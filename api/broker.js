// RTradeXworld broker connection endpoint (Vercel serverless function) — Delta Exchange India, READ-ONLY.
//
// What it does:   POST { action: 'connect' | 'sync' | 'disconnect', ... }
//   connect    validates the API key against Delta, runs a safe Connection Test, stores the credentials ENCRYPTED.
//   sync       pulls the trader's fills from Delta, stores them (duplicate-proof), rebuilds trades with the shared engine.
//   disconnect deletes the stored credentials (and optionally the synced fills).
//
// Security rules this file follows:
//   - The caller's Supabase login is verified server-side. The user's own token is used for every database call,
//     so Row Level Security still protects every row. No service-role key exists in this project.
//   - API secrets are encrypted with AES-256-GCM using BROKER_ENC_KEY (a Vercel environment variable) and are only
//     ever decrypted in memory inside this function. They are never returned, logged or written anywhere in plain text.
//   - Only read endpoints are called. There is no code path for placing, changing or cancelling orders.
//   - Nothing here ever guesses at data: a response that is missing a required field stops the sync with a clear message.

import crypto from 'node:crypto';
import { buildTrades, parseDec, decToString } from './_tradeEngine.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mggvpiwlgrdusnbxfuxd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_v2QBHeK8JVO3rgT9w3h3Hg_OdVWaM3u';
const DELTA_BASES = { production: 'https://api.india.delta.exchange', testnet: 'https://cdn-ind.testnet.deltaex.org' };
const USER_AGENT = 'rtradexworld-journal/1.0';

const PAGE_SIZE = 100;
const MAX_PAGES = 100;               // 10,000 fills per sync run
const PAGING_BUDGET_MS = 15000;      // leave time to save and rebuild inside the 30 s function limit
const SYNC_COOLDOWN_MS = 60 * 1000;
const SYNC_LOCK_MS = 2 * 60 * 1000;
const CONNECT_WINDOW_MS = 10 * 60 * 1000;
const CONNECT_MAX = 5;
const ATTEMPT_MAX = 8;               // best-effort cap on connection TESTS per user (per server instance)
const attempts = new Map();
function tooManyAttempts(userId) {
  const now = Date.now();
  const list = (attempts.get(userId) || []).filter(t => now - t < CONNECT_WINDOW_MS);
  list.push(now);
  attempts.set(userId, list);
  return list.length > ATTEMPT_MAX;
}

export const config = { maxDuration: 30 };

const MESSAGES = {
  invalid_key: 'Delta did not recognise this API key. Check that the key and secret were copied exactly, and that the key was created on Delta Exchange India (not Delta Global).',
  signature: 'Delta rejected the signature. The API secret is probably wrong or has extra characters.',
  clock: 'Delta rejected the request time. Please try again in a moment.',
  ip_blocked: "Delta blocked this request because the server's IP address is not allowed for this key. Delta may require a fixed IP address for this key, which this version cannot provide.",
  permission: 'This key is not allowed to read this data. Create a key on Delta Exchange India with the Read Data permission.',
  auth: 'Delta rejected the credentials.',
  rate_limited: 'Delta says too many requests were made. Please wait a minute and try again.',
  maintenance: 'Delta is temporarily unavailable. Please try again later.',
  network: 'Could not reach Delta. Please try again.',
  bad_request: 'Delta rejected the request.',
  unsupported_shape: 'Delta returned data in a shape this version cannot read safely, so nothing was imported.',
  unknown: 'Something unexpected happened while talking to Delta.',
};
const AUTH_KINDS = new Set(['invalid_key', 'signature', 'ip_blocked', 'permission', 'auth']);

class BrokerError extends Error {
  constructor(kind, extra = {}) { super(MESSAGES[kind] || MESSAGES.unknown); this.kind = kind; this.extra = extra; }
}

function json(res, status, body) { return res.status(status).json(body); }
// Structured log lines. Only pass non-secret values here.
function log(event, data = {}) { console.log(JSON.stringify({ event, ...data })); }

// ---------------------------------------------------------------- crypto
function encKey() {
  const s = process.env.BROKER_ENC_KEY;
  if (!s || s.length < 32) return null;
  return crypto.createHash('sha256').update(s).digest();
}
function encrypt(obj, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') });
}
function decrypt(str, key) {
  const p = JSON.parse(str);
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
  d.setAuthTag(Buffer.from(p.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(p.ct, 'base64')), d.final()]).toString('utf8'));
}

// ---------------------------------------------------------------- supabase (always with the USER'S token)
function sb(path, token, init = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}
async function sbOk(path, token, init) {
  const r = await sb(path, token, init);
  if (!r.ok) { const e = new Error(`database_${r.status}`); e.status = r.status; throw e; }
  return r;
}
async function sbRows(path, token) { return (await sbOk(path, token)).json(); }
async function sbAll(basePath, token, pageSize = 1000, maxRows = 50000) {
  const out = [];
  while (out.length < maxRows) {
    const rows = await sbRows(`${basePath}&limit=${pageSize}&offset=${out.length}`, token);
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

// ---------------------------------------------------------------- Delta (read-only GET requests only)
async function deltaGet(base, creds, path, query = {}) {
  const qs = Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : '';
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', creds.apiSecret).update('GET' + ts + path + qs).digest('hex');
  let res;
  try {
    res = await fetch(base + path + qs, {
      method: 'GET',
      headers: { 'api-key': creds.apiKey, timestamp: ts, signature, 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) { throw new BrokerError('network'); }
  let body = null;
  try { body = JSON.parse(await res.text()); } catch (e) { body = null; }
  const reset = Number(res.headers && res.headers.get ? res.headers.get('x-rate-limit-reset') : NaN);
  return { status: res.status, ok: res.ok && !(body && body.success === false), body, resetMs: Number.isFinite(reset) ? reset : null };
}
function classify(status, body) {
  const text = `${String((body && body.error && (body.error.code || body.error.message)) || (body && body.error) || '')} ${String((body && body.message) || '')}`.toLowerCase();
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403 || (status < 400 && body && body.success === false)) {
    if (text.includes('whitelist') || text.includes('ip_not') || /\bip\b/.test(text)) return 'ip_blocked';
    if (text.includes('expired') || text.includes('timestamp')) return 'clock';
    if (text.includes('signature')) return 'signature';
    if (text.includes('invalid_api_key') || text.includes('api key') || text.includes('api-key')) return 'invalid_key';
    if (text.includes('unauthorized') || text.includes('permission')) return 'permission';
    return 'auth';
  }
  if (status >= 500) return 'maintenance';
  if (status >= 400) return 'bad_request';
  return 'unknown';
}

// ---------------------------------------------------------------- normalizing Delta data
const str = (v) => (v === null || v === undefined ? '' : String(v));
function timeUs(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    if (s.length >= 16) return n;
    if (s.length >= 13) return n * 1000;
    if (s.length >= 10) return n * 1000000;
    return null;
  }
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  const frac = (s.match(/\.(\d+)/) || [])[1] || '';
  return ms * 1000 + (Number((frac + '000000').slice(0, 6)) % 1000);
}
function isoFromUs(us) {
  const ms = Math.floor(us / 1000), rem = Math.round(us - ms * 1000);
  return new Date(ms).toISOString().slice(0, -1) + String(rem).padStart(3, '0') + 'Z';
}
function localDate(us, tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(us / 1000)); }
  catch (e) { return new Date(us / 1000).toISOString().slice(0, 10); }
}
const assetSymbol = (a) => (a && typeof a === 'object' ? str(a.symbol) : str(a)) || null;

function normalizeFill(f) {
  const product = f && typeof f.product === 'object' && f.product ? f.product : {};
  const id = str(f && (f.id !== undefined ? f.id : f.fill_id));
  const symbol = str((f && f.product_symbol) || product.symbol || (f && f.symbol));
  const side = str(f && f.side).toLowerCase();
  const size = parseDec(f && f.size), price = parseDec(f && f.price);
  const t = timeUs(f && f.created_at);
  const missing = [];
  if (!id) missing.push('id');
  if (!symbol) missing.push('symbol');
  if (side !== 'buy' && side !== 'sell') missing.push('side');
  if (size === null || size <= 0n) missing.push('size');
  if (price === null || price <= 0n) missing.push('price');
  if (t === null) missing.push('created_at');
  if (missing.length) return { ok: false, missing };
  const cv = parseDec(product.contract_value);
  const commission = f.commission === undefined || f.commission === null || f.commission === '' ? null : parseDec(f.commission);
  return {
    ok: true, symbol, timeUs: t,
    row: {
      broker_fill_id: id, broker_order_id: str(f.order_id) || null, symbol, side,
      size: decToString(size, 12), price: decToString(price, 12), commission: commission === null ? null : decToString(commission, 12),
      role: str(f.role) || null, fill_type: str(f.fill_type) || null, occurred_at: isoFromUs(t),
      contract_value: cv !== null && cv > 0n ? decToString(cv, 12) : null,
      notional_type: str(product.notional_type) || null, quoting_asset: assetSymbol(product.quoting_asset), settling_asset: assetSymbol(product.settling_asset),
      raw: f,
    },
  };
}
function engineFill(row) {
  return {
    id: row.broker_fill_id, symbol: row.symbol, side: row.side, size: row.size, price: row.price, fee: row.commission,
    timeUs: timeUs(row.occurred_at), contractValue: row.contract_value, notionalType: row.notional_type,
    quotingAsset: row.quoting_asset, settlingAsset: row.settling_asset,
  };
}

// ---------------------------------------------------------------- Connection Test (read-only probes, no values returned)
async function runDiagnostics(base, creds) {
  const d = { wallet: null, fills: null, product: null, fields: null };
  const w = await deltaGet(base, creds, '/v2/wallet/balances');
  d.wallet = { http: w.status, ok: w.ok };
  if (!w.ok) return { ...d, auth_ok: false, kind: classify(w.status, w.body) };
  const f = await deltaGet(base, creds, '/v2/fills', { page_size: '5' });
  d.fills = { http: f.status, ok: f.ok };
  if (!f.ok) return { ...d, auth_ok: true, fills_ok: false, kind: classify(f.status, f.body) };
  const list = f.body && Array.isArray(f.body.result) ? f.body.result : null;
  if (!list) return { ...d, auth_ok: true, fills_ok: true, shape_ok: false, kind: 'unsupported_shape' };
  d.fills.sample = list.length;
  const present = (pred) => (list.length === 0 ? 'no_sample' : list.every(pred) ? 'all' : list.some(pred) ? 'some' : 'none');
  const prod = (x) => (x && typeof x.product === 'object' && x.product ? x.product : {});
  d.fields = {
    id: present(x => str(x.id !== undefined ? x.id : x.fill_id) !== ''),
    symbol: present(x => str(x.product_symbol || prod(x).symbol || x.symbol) !== ''),
    side: present(x => ['buy', 'sell'].includes(str(x.side).toLowerCase())),
    size: present(x => { const v = parseDec(x.size); return v !== null && v > 0n; }),
    price: present(x => { const v = parseDec(x.price); return v !== null && v > 0n; }),
    created_at: present(x => timeUs(x.created_at) !== null),
    commission: present(x => x.commission !== undefined && x.commission !== null && parseDec(x.commission) !== null),
    order_id: present(x => str(x.order_id) !== ''),
    contract_value: present(x => { const v = parseDec(prod(x).contract_value); return v !== null && v > 0n; }),
    notional_type: present(x => str(prod(x).notional_type) !== ''),
    quoting_asset: present(x => !!assetSymbol(prod(x).quoting_asset)),
    settling_asset: present(x => !!assetSymbol(prod(x).settling_asset)),
  };
  const required = ['id', 'symbol', 'side', 'size', 'price', 'created_at'];
  const shapeOk = list.length === 0 ? null : required.every(k => d.fields[k] === 'all');
  if (list.length && d.fields.contract_value !== 'all') {
    const sym = str(list[0].product_symbol || prod(list[0]).symbol || list[0].symbol);
    const p = await deltaGet(base, creds, `/v2/products/${encodeURIComponent(sym)}`);
    const r = p.body && p.body.result ? p.body.result : {};
    const cv = parseDec(r.contract_value);
    d.product = { http: p.status, ok: p.ok, contract_value: cv !== null && cv > 0n ? 'present' : 'missing', notional_type: str(r.notional_type) ? 'present' : 'missing' };
  }
  return { ...d, auth_ok: true, fills_ok: true, shape_ok: shapeOk, kind: shapeOk === false ? 'unsupported_shape' : null };
}

// ---------------------------------------------------------------- actions
async function getConnection(token, id) {
  const rows = await sbRows(`/rest/v1/broker_connections?id=eq.${encodeURIComponent(id)}&select=*`, token);
  return rows && rows[0] ? rows[0] : null;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const summarize = (c) => ({
  id: c.id, broker: c.broker, environment: c.environment, status: c.status, api_key_last4: c.api_key_last4,
  last_sync_started_at: c.last_sync_started_at, last_sync_completed_at: c.last_sync_completed_at,
  fills_synced: c.fills_synced, trades_synced: c.trades_synced, last_error_code: c.last_error_code, last_error_message: c.last_error_message,
  sync_summary: c.sync_summary, diagnostics: c.diagnostics,
});

async function doConnect(token, user, body, key, res) {
  const environment = body.environment === 'testnet' ? 'testnet' : body.environment === 'production' ? 'production' : null;
  const apiKey = str(body.apiKey).trim(), apiSecret = str(body.apiSecret).trim();
  if (!environment) return json(res, 400, { code: 'bad_request', error: 'Choose Production or Testnet.' });
  if (!/^[\w-]{8,128}$/.test(apiKey)) return json(res, 400, { code: 'bad_request', error: 'The API key looks wrong. Paste exactly what Delta showed, without spaces.' });
  if (!/^[\w\-+/=.]{16,256}$/.test(apiSecret)) return json(res, 400, { code: 'bad_request', error: 'The API secret looks wrong. Paste exactly what Delta showed, without spaces.' });

  if (tooManyAttempts(user.id)) return json(res, 429, { code: 'rate_limited', error: 'Too many connection attempts. Please wait a few minutes.' });
  const existing = await sbRows(`/rest/v1/broker_connections?broker=eq.delta_india&environment=eq.${environment}&status=neq.disconnected&select=id`, token);
  if (Array.isArray(existing) && existing.length) return json(res, 409, { code: 'already_connected', error: 'Delta is already connected. Disconnect it first to connect a different key.' });

  const creds = { apiKey, apiSecret };
  let diag;
  try { diag = await runDiagnostics(DELTA_BASES[environment], creds); }
  catch (e) { const kind = e instanceof BrokerError ? e.kind : 'unknown'; return json(res, 502, { code: kind, error: MESSAGES[kind] }); }
  log('connect_test', { auth_ok: !!diag.auth_ok, fills_ok: !!diag.fills_ok, shape_ok: diag.shape_ok, kind: diag.kind || null });
  if (diag.kind) {
    const status = diag.kind === 'rate_limited' ? 429 : diag.kind === 'maintenance' || diag.kind === 'network' ? 502 : diag.kind === 'unsupported_shape' ? 422 : 401;
    return json(res, status, { code: diag.kind, error: MESSAGES[diag.kind], diagnostics: diag });
  }

  // Reconnecting reuses the earlier connection so the same fills and trades line up (no duplicates).
  const previous = await sbRows(`/rest/v1/broker_connections?broker=eq.delta_india&environment=eq.${environment}&status=eq.disconnected&select=id&order=created_at.desc&limit=1`, token);
  let conn;
  if (Array.isArray(previous) && previous[0]) {
    const upd = await sbOk(`/rest/v1/broker_connections?id=eq.${previous[0].id}`, token, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'active', api_key_last4: apiKey.slice(-4), diagnostics: diag, disconnected_at: null, last_error_code: null, last_error_message: null, last_error_at: null, last_sync_started_at: null }),
    });
    conn = (await upd.json())[0];
  } else {
    const created = await sbOk('/rest/v1/broker_connections', token, {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: user.id, broker: 'delta_india', environment, status: 'active', api_key_last4: apiKey.slice(-4), diagnostics: diag }),
    });
    conn = (await created.json())[0];
  }
  try {
    await sbOk('/rest/v1/broker_credentials', token, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ connection_id: conn.id, user_id: user.id, ciphertext: encrypt(creds, key) }) });
  } catch (e) {
    await sb(`/rest/v1/broker_connections?id=eq.${conn.id}`, token, { method: 'PATCH', body: JSON.stringify({ status: 'disconnected' }) }).catch(() => {});
    throw e;
  }
  return json(res, 200, { ok: true, connection: summarize(conn), diagnostics: diag, reconnected: !!(Array.isArray(previous) && previous[0]) });
}

async function doSync(token, user, body, key, res) {
  const id = str(body.connectionId);
  if (!UUID_RE.test(id)) return json(res, 400, { code: 'bad_request', error: 'Invalid connection.' });
  const conn = await getConnection(token, id);
  if (!conn || conn.status === 'disconnected') return json(res, 404, { code: 'not_found', error: 'Connection not found.' });
  const now = Date.now();
  const started = conn.last_sync_started_at ? Date.parse(conn.last_sync_started_at) : 0;
  if (conn.status !== 'syncing' && started && now - started < SYNC_COOLDOWN_MS) {
    return json(res, 429, { code: 'too_soon', error: 'Synced a moment ago. Please wait a minute before syncing again.', retryAfterSec: Math.ceil((SYNC_COOLDOWN_MS - (now - started)) / 1000) });
  }
  // take the lock (only one sync at a time per connection; a stale lock is taken over after 2 minutes)
  const stale = new Date(now - SYNC_LOCK_MS).toISOString();
  const lock = await sbOk(`/rest/v1/broker_connections?id=eq.${id}&or=(status.neq.syncing,last_sync_started_at.lt.${stale})`, token, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'syncing', last_sync_started_at: new Date(now).toISOString() }),
  });
  const locked = await lock.json();
  if (!Array.isArray(locked) || locked.length === 0) return json(res, 409, { code: 'busy', error: 'A sync is already running.' });

  try {
    const credRows = await sbRows(`/rest/v1/broker_credentials?connection_id=eq.${id}&select=ciphertext`, token);
    if (!credRows[0]) throw new BrokerError('auth');
    let creds;
    try { creds = decrypt(credRows[0].ciphertext, key); } catch (e) { throw new BrokerError('auth'); }
    const base = DELTA_BASES[conn.environment] || DELTA_BASES.production;

    // 1. pull fills (cursor pagination)
    const deadline = Date.now() + PAGING_BUDGET_MS;
    const raw = []; let after = null, pages = 0, truncated = false;
    for (;;) {
      if (pages >= MAX_PAGES || Date.now() > deadline) { truncated = true; break; }
      const q = { page_size: String(PAGE_SIZE) }; if (after) q.after = after;
      const r = await deltaGet(base, creds, '/v2/fills', q);
      if (!r.ok) throw new BrokerError(classify(r.status, r.body), { resetMs: r.resetMs });
      const list = r.body && Array.isArray(r.body.result) ? r.body.result : null;
      if (!list) throw new BrokerError('unsupported_shape');
      raw.push(...list); pages++;
      after = r.body.meta && r.body.meta.after ? r.body.meta.after : null;
      if (!after || list.length === 0) break;
    }

    // 2. validate EVERYTHING before saving anything from this run
    const normalized = [], missingCount = {};
    for (const f of raw) {
      const n = normalizeFill(f);
      if (!n.ok) { n.missing.forEach(m => { missingCount[m] = (missingCount[m] || 0) + 1; }); continue; }
      normalized.push(n);
    }
    if (Object.keys(missingCount).length) throw new BrokerError('unsupported_shape', { missing: missingCount });

    // 3. product facts for symbols whose fills do not carry them
    const productCache = {};
    for (const n of normalized) {
      const row = n.row;
      if (row.contract_value) continue;
      if (!(row.symbol in productCache)) {
        const p = await deltaGet(base, creds, `/v2/products/${encodeURIComponent(row.symbol)}`).catch(() => null);
        const r = p && p.ok && p.body && p.body.result ? p.body.result : null;
        const cv = r ? parseDec(r.contract_value) : null;
        productCache[row.symbol] = r ? { contract_value: cv !== null && cv > 0n ? decToString(cv, 12) : null, notional_type: str(r.notional_type) || null, quoting_asset: assetSymbol(r.quoting_asset), settling_asset: assetSymbol(r.settling_asset) } : {};
      }
      const pc = productCache[row.symbol];
      row.contract_value = row.contract_value || pc.contract_value || null;
      row.notional_type = row.notional_type || pc.notional_type || null;
      row.quoting_asset = row.quoting_asset || pc.quoting_asset || null;
      row.settling_asset = row.settling_asset || pc.settling_asset || null;
    }

    // 4. save fills (a fill that already exists is silently skipped)
    for (let i = 0; i < normalized.length; i += 500) {
      const chunk = normalized.slice(i, i + 500).map(n => ({ ...n.row, connection_id: id, user_id: user.id }));
      await sbOk('/rest/v1/broker_fills?on_conflict=connection_id,broker_fill_id', token, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(chunk) });
    }

    // 5. rebuild trades from the whole ledger (deterministic, so safe to repeat any number of times)
    const dbFills = await sbAll(`/rest/v1/broker_fills?connection_id=eq.${id}&select=*&order=occurred_at.asc,broker_fill_id.asc`, token);
    const built = buildTrades(dbFills.map(engineFill));
    const prof = await sbRows(`/rest/v1/profiles?id=eq.${user.id}&select=timezone`, token).catch(() => []);
    const tz = prof && prof[0] && prof[0].timezone ? prof[0].timezone : 'UTC';
    const existingTrades = await sbAll(`/rest/v1/trades?connection_id=eq.${id}&select=id,trade_key,date,entry_price,exit_price,quantity,pnl,fees_total,currency,contract_value,status,closed_at,needs_review,review_reason,risk_amount`, token);
    const byKey = new Map(existingTrades.map(t => [t.trade_key, t]));

    const colsFor = (t) => {
      const closed = t.status === 'closed';
      return {
        date: localDate(t.openedAtUs, tz), symbol: t.symbol, direction: t.direction,
        entry_price: decToString(t.avgEntry, 8), exit_price: closed && t.avgExit !== null ? decToString(t.avgExit, 8) : null,
        quantity: decToString(t.sizeEntry, 8), pnl: closed && t.netPnl !== null ? decToString(t.netPnl, 8) : null,
        fees_total: t.feesKnown ? decToString(t.fees, 8) : null, currency: t.currency || null,
        contract_value: t.contractValue !== null ? decToString(t.contractValue, 12) : null,
        status: t.status, executed_at: isoFromUs(t.openedAtUs), closed_at: closed ? isoFromUs(t.closedAtUs) : null,
        needs_review: t.needsReview, review_reason: t.reviewReasons.length ? t.reviewReasons.join(',') : null,
      };
    };
    const same = (a, b) => {
      if (a === null || a === undefined || b === null || b === undefined) return (a === null || a === undefined) && (b === null || b === undefined);
      if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
      const x = Number(a), y = Number(b);
      if (Number.isFinite(x) && Number.isFinite(y) && String(a).match(/^-?[\d.]+$/) && String(b).match(/^-?[\d.]+$/)) return Math.abs(x - y) < 1e-8;
      if (/T\d\d:/.test(String(a)) && /T\d\d:/.test(String(b))) return Date.parse(a) === Date.parse(b);
      return String(a) === String(b);
    };
    const inserts = [], patches = [];
    for (const t of built.trades) {
      const cols = colsFor(t), ex = byKey.get(t.tradeKey);
      if (!ex) {
        inserts.push({
          ...cols, user_id: user.id, connection_id: id, trade_key: t.tradeKey, market: 'Crypto', import_source: 'delta_api',
          stop_loss: null, risk_amount: null, rr: null, strategy: '', setup_type: '', emotion: '', mistake_tags: '', confidence: 3, notes: '',
        });
      } else {
        const diff = {};
        for (const k of Object.keys(cols)) if (!same(cols[k], ex[k])) diff[k] = cols[k];
        if (Object.keys(diff).length) {
          // keep the trader's own R in step with the broker's P&L (R = P&L / the risk the trader entered)
          const newPnl = 'pnl' in diff ? diff.pnl : ex.pnl;
          if (Number(ex.risk_amount) > 0 && newPnl !== null && newPnl !== undefined) diff.rr = Math.round((Number(newPnl) / Number(ex.risk_amount)) * 100) / 100;
          patches.push({ id: ex.id, diff });
        }
      }
    }
    for (let i = 0; i < inserts.length; i += 200) {
      await sbOk('/rest/v1/trades', token, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(inserts.slice(i, i + 200)) });
    }
    for (const p of patches) {
      await sbOk(`/rest/v1/trades?id=eq.${p.id}`, token, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(p.diff) });
    }

    const summary = {
      pages, fills_fetched: raw.length, fills_in_ledger: dbFills.length, trades_total: built.trades.length,
      trades_created: inserts.length, trades_updated: patches.length, trades_open: built.trades.filter(t => t.status === 'open').length,
      trades_needing_review: built.trades.filter(t => t.needsReview).length, truncated, rejected: built.rejected.length,
    };
    await sbOk(`/rest/v1/broker_connections?id=eq.${id}`, token, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'active', last_sync_completed_at: new Date().toISOString(), fills_synced: dbFills.length, trades_synced: built.trades.length, last_error_code: null, last_error_message: null, last_error_at: null, sync_summary: summary }),
    });
    log('sync_ok', { pages, fills: raw.length, created: inserts.length, updated: patches.length });
    return json(res, 200, { ok: true, summary });
  } catch (e) {
    const kind = e instanceof BrokerError ? e.kind : 'unknown';
    log('sync_failed', { kind, db: e && e.status ? e.status : null });
    const status = AUTH_KINDS.has(kind) ? 'auth_failed' : 'sync_error';
    await sb(`/rest/v1/broker_connections?id=eq.${id}`, token, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status, last_error_code: kind, last_error_message: MESSAGES[kind] || MESSAGES.unknown, last_error_at: new Date().toISOString(), ...(e instanceof BrokerError && e.extra && e.extra.missing ? { sync_summary: { problem: 'unsupported_shape', missing_fields: e.extra.missing } } : {}) }),
    }).catch(() => {});
    const http = kind === 'rate_limited' ? 429 : AUTH_KINDS.has(kind) ? 401 : kind === 'unsupported_shape' ? 422 : kind === 'maintenance' || kind === 'network' ? 502 : 500;
    return json(res, http, { code: kind, error: MESSAGES[kind] || MESSAGES.unknown, ...(e && e.extra && e.extra.missing ? { missing_fields: e.extra.missing } : {}) });
  }
}

async function doDisconnect(token, body, res) {
  const id = str(body.connectionId);
  if (!UUID_RE.test(id)) return json(res, 400, { code: 'bad_request', error: 'Invalid connection.' });
  const conn = await getConnection(token, id);
  if (!conn) return json(res, 404, { code: 'not_found', error: 'Connection not found.' });
  await sbOk(`/rest/v1/broker_credentials?connection_id=eq.${id}`, token, { method: 'DELETE' });
  if (body.deleteFills === true) await sbOk(`/rest/v1/broker_fills?connection_id=eq.${id}`, token, { method: 'DELETE' });
  await sbOk(`/rest/v1/broker_connections?id=eq.${id}`, token, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'disconnected', disconnected_at: new Date().toISOString() }) });
  log('disconnect', { deleted_fills: body.deleteFills === true });
  return json(res, 200, { ok: true });
}

// ---------------------------------------------------------------- entry point
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const key = encKey();
  if (!key) return json(res, 503, { code: 'not_configured', error: 'Broker connections are not set up on the server yet.' });

  const auth = String((req.headers && req.headers.authorization) || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json(res, 401, { code: 'unauthorized', error: 'Please log in again.' });
  let user;
  try {
    const u = await sb('/auth/v1/user', token);
    if (!u.ok) return json(res, 401, { code: 'unauthorized', error: 'Your session has expired. Please log in again.' });
    user = await u.json();
    if (!user || !user.id) return json(res, 401, { code: 'unauthorized', error: 'Your session has expired. Please log in again.' });
  } catch (e) { return json(res, 502, { code: 'upstream', error: 'Could not verify your login. Please try again.' }); }

  const body = req.body && typeof req.body === 'object' ? req.body : null;
  if (!body) return json(res, 400, { code: 'bad_request', error: 'Invalid request.' });
  try {
    if (body.action === 'connect') return await doConnect(token, user, body, key, res);
    if (body.action === 'sync') return await doSync(token, user, body, key, res);
    if (body.action === 'disconnect') return await doDisconnect(token, body, res);
    return json(res, 400, { code: 'bad_request', error: 'Unknown action.' });
  } catch (e) {
    log('error', { name: e && e.name, db: e && e.status ? e.status : null });
    const notReady = e && (e.status === 404 || e.status === 400);
    return json(res, notReady ? 503 : 500, { code: notReady ? 'db_not_ready' : 'server_error', error: notReady ? 'Broker tables are not set up yet. The database setup step is incomplete.' : 'Something went wrong. Please try again.' });
  }
}
