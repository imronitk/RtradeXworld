// RTradeXworld canonical trade engine.
// Pure functions only: no network, no database, no dates from the clock. Same fills in => same trades out,
// whatever order they arrive in and however many times it is run.
//
// Money maths uses BigInt fixed-point (12 decimal places) so repeated additions never drift like JS floats do.
// (The file name starts with an underscore so Vercel does not expose it as an API route.)
//
// MODEL
//  - One net position per symbol (one-way mode). A trade is one "position cycle": it starts when the net position
//    leaves zero and ends when it returns to zero.
//  - A fill that crosses zero (e.g. long 100, then SELL 150) is split into a closing part and an opening part,
//    and its fee is divided in proportion to size.
//  - Realized P&L uses the average-cost method: each exit is measured against the running average entry price.
//  - Open trades report no final P&L (realizedToDate only).
//  - P&L is only computed when the contract value is known; otherwise it is left empty and the trade is flagged.

const DECIMALS = 12;
const S = 10n ** BigInt(DECIMALS);

export function parseDec(x) {
  if (x === null || x === undefined || typeof x === 'boolean') return null;
  let s;
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) return null;
    s = Math.abs(x) < 1e-6 || Math.abs(x) >= 1e21 ? x.toFixed(DECIMALS) : String(x);
  } else s = String(x).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [i, f = ''] = s.split('.');
  const v = BigInt(i) * S + BigInt((f + '0'.repeat(DECIMALS)).slice(0, DECIMALS));
  return neg ? -v : v;
}
const mul = (a, b) => (a * b) / S;
const div = (a, b) => (a * S) / b;
const abs = (a) => (a < 0n ? -a : a);
const min = (a, b) => (a < b ? a : b);
const max = (a, b) => (a > b ? a : b);

// Scaled BigInt -> plain decimal string (rounded half away from zero to `places`).
export function decToString(v, places = 8) {
  if (v === null || v === undefined) return null;
  const neg = v < 0n;
  let a = abs(v);
  const drop = DECIMALS - places;
  if (drop > 0) {
    const f = 10n ** BigInt(drop);
    a = (a + f / 2n) / f;
  }
  const scale = 10n ** BigInt(Math.min(places, DECIMALS));
  const whole = a / scale, frac = (a % scale).toString().padStart(Math.min(places, DECIMALS), '0');
  const body = places > 0 ? `${whole}.${frac}` : `${whole}`;
  return (neg && a !== 0n ? '-' : '') + body;
}

function compareIds(a, b) {
  const sa = String(a), sb = String(b);
  if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) { const x = BigInt(sa), y = BigInt(sb); return x < y ? -1 : x > y ? 1 : 0; }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
function sortFills(fills) {
  return [...fills].sort((a, b) => (a.timeUs !== b.timeUs ? (a.timeUs < b.timeUs ? -1 : 1) : compareIds(a.id, b.id)));
}

function productKind(notionalType) {
  const t = String(notionalType || '').toLowerCase();
  if (t.includes('inverse')) return 'inverse';
  if (t.includes('vanilla') || t.includes('linear')) return 'linear';
  return 'unknown';
}

// fills: [{ id, symbol, side:'buy'|'sell', size, price, fee, timeUs, contractValue, notionalType, quotingAsset, settlingAsset }]
// All numeric fields may be decimal strings or numbers. Returns { trades, rejected, duplicates }.
export function buildTrades(fills) {
  const rejected = [];
  const seen = new Set();
  let duplicates = 0;
  const clean = [];
  for (const f of fills || []) {
    if (!f || f.id === undefined || f.id === null || String(f.id) === '') { rejected.push({ id: f && f.id, reason: 'missing_id' }); continue; }
    const key = `${f.symbol}|${f.id}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    const size = parseDec(f.size), price = parseDec(f.price);
    if (!f.symbol) { rejected.push({ id: f.id, reason: 'missing_symbol' }); continue; }
    if (f.side !== 'buy' && f.side !== 'sell') { rejected.push({ id: f.id, reason: 'bad_side' }); continue; }
    if (size === null || size <= 0n) { rejected.push({ id: f.id, reason: 'bad_size' }); continue; }
    if (price === null || price <= 0n) { rejected.push({ id: f.id, reason: 'bad_price' }); continue; }
    if (!Number.isFinite(Number(f.timeUs))) { rejected.push({ id: f.id, reason: 'bad_time' }); continue; }
    const fee = f.fee === null || f.fee === undefined || f.fee === '' ? null : parseDec(f.fee);
    clean.push({ ...f, _size: size, _price: price, _fee: fee, timeUs: Number(f.timeUs) });
  }

  const bySymbol = new Map();
  for (const f of clean) { if (!bySymbol.has(f.symbol)) bySymbol.set(f.symbol, []); bySymbol.get(f.symbol).push(f); }

  const trades = [];
  for (const [symbol, list] of bySymbol) {
    const sorted = sortFills(list);
    const info = sorted.find(f => f.contractValue !== null && f.contractValue !== undefined) || {};
    const cv = parseDec(info.contractValue);
    const kind = productKind(sorted.map(f => f.notionalType).find(Boolean));
    const quoting = String(sorted.map(f => f.quotingAsset).find(Boolean) || '').toUpperCase();
    const settling = String(sorted.map(f => f.settlingAsset).find(Boolean) || '').toUpperCase();

    let pos = 0n, avgCost = 0n, cycle = null;

    const open = (fill) => ({
      key: `${symbol}:${fill.id}`, direction: fill.side === 'buy' ? 'long' : 'short', openedAtUs: fill.timeUs, lastTimeUs: fill.timeUs,
      entries: [], exits: [], realized: 0n, fees: 0n, feeKnown: true, peak: 0n, fillIds: [],
    });
    const finalize = (c, closed) => {
      const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0n);
      const entryQty = sum(c.entries, 'q'), exitQty = sum(c.exits, 'q');
      const avgEntry = entryQty > 0n ? div(c.entries.reduce((a, x) => a + mul(x.p, x.q), 0n), entryQty) : null;
      const avgExit = exitQty > 0n ? div(c.exits.reduce((a, x) => a + mul(x.p, x.q), 0n), exitQty) : null;
      const reasons = [];
      let gross = null;
      if (cv === null || cv <= 0n) reasons.push('contract_value_unavailable');
      else if (kind === 'inverse') reasons.push('inverse_contract_not_supported');
      else {
        gross = c.realized;
        if (kind === 'unknown') reasons.push('contract_type_not_reported_assumed_linear');
      }
      let net = null;
      if (gross !== null) {
        if (c.feeKnown && quoting && settling && quoting === settling) net = gross - c.fees;
        else { net = gross; reasons.push(c.feeKnown ? 'fees_not_deducted_currency_unknown_or_different' : 'fees_not_deducted_missing_commission'); }
      }
      trades.push({
        tradeKey: c.key, symbol, direction: c.direction, status: closed ? 'closed' : 'open',
        openedAtUs: c.openedAtUs, closedAtUs: closed ? c.lastTimeUs : null,
        sizeEntry: entryQty, sizePeak: c.peak, remainingSize: closed ? 0n : abs(pos),
        avgEntry, avgExit, fees: c.fees, feesKnown: c.feeKnown,
        grossPnl: closed ? gross : null, netPnl: closed ? net : null,
        realizedToDate: gross === null ? null : c.realized,
        currency: quoting || null, contractValue: cv, notionalKind: kind,
        needsReview: reasons.length > 0, reviewReasons: reasons,
        fillsCount: c.fillIds.length, fillIds: c.fillIds.slice(),
      });
    };

    for (const f of sorted) {
      const sign = f.side === 'buy' ? 1n : -1n;
      const qty = f._size, price = f._price;
      let remaining = qty, feeLeft = f._fee === null ? 0n : f._fee;
      while (remaining > 0n) {
        if (pos === 0n) { cycle = open(f); avgCost = 0n; }
        const sameDir = pos === 0n || (pos > 0n) === (sign > 0n);
        if (cycle) { cycle.lastTimeUs = f.timeUs; if (!cycle.fillIds.includes(f.id)) cycle.fillIds.push(f.id); }
        if (sameDir) {
          const newPos = pos + sign * remaining;
          avgCost = div(mul(abs(pos), avgCost) + mul(remaining, price), abs(newPos));
          cycle.entries.push({ p: price, q: remaining });
          cycle.fees += feeLeft;
          if (f._fee === null) cycle.feeKnown = false;
          pos = newPos;
          cycle.peak = max(cycle.peak, abs(pos));
          remaining = 0n;
        } else {
          const closeQty = min(remaining, abs(pos));
          const partFee = closeQty === remaining ? feeLeft : (feeLeft * closeQty) / remaining;
          const dir = cycle.direction === 'long' ? 1n : -1n;
          if (cv !== null && cv > 0n) cycle.realized += mul(mul(price - avgCost, closeQty), cv) * dir;
          cycle.exits.push({ p: price, q: closeQty });
          cycle.fees += partFee;
          if (f._fee === null) cycle.feeKnown = false;
          feeLeft -= partFee;
          pos += sign * closeQty;
          remaining -= closeQty;
          if (pos === 0n) { finalize(cycle, true); cycle = null; }
        }
      }
    }
    if (cycle && pos !== 0n) finalize(cycle, false);
  }
  trades.sort((a, b) => (a.openedAtUs !== b.openedAtUs ? a.openedAtUs - b.openedAtUs : a.tradeKey < b.tradeKey ? -1 : 1));
  return { trades, rejected, duplicates };
}
