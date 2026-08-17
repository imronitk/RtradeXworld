import React, { useState, useEffect } from 'react';
import { LayoutDashboard, NotebookPen, CalendarDays, BarChart3, BookOpen, TrendingUp, TrendingDown, Flame, Target, Activity, Check, Star, Search, ChevronLeft, Trash2, AlertCircle, Camera, ShieldCheck } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, YAxis, BarChart, Bar, XAxis, Cell } from 'recharts';

// ===== SUPABASE CONNECTION =====
const SUPABASE_URL = 'https://mggvpiwlgrdusnbxfuxd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_v2QBHeK8JVO3rgT9w3h3Hg_OdVWaM3u';
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

function toDb(t) {
  return {
    date: t.date, market: t.market, symbol: t.symbol, direction: t.direction,
    entry_price: t.entry, exit_price: t.exit, stop_loss: t.stopLoss, quantity: t.positionSize,
    risk_amount: t.risk, pnl: t.pnl, rr: t.rMultiple, strategy: t.strategy, setup_type: t.setup,
    emotion: t.emotion, mistake_tags: t.mistake, confidence: t.confidence, notes: t.notes,
    screenshot_url: t.screenshotUrl || null,
  };
}
function fromDb(row) {
  return {
    id: row.id, date: row.date, market: row.market, symbol: row.symbol, direction: row.direction,
    entry: row.entry_price, exit: row.exit_price, stopLoss: row.stop_loss, positionSize: row.quantity,
    risk: row.risk_amount, pnl: row.pnl, rMultiple: row.rr, strategy: row.strategy, setup: row.setup_type,
    emotion: row.emotion, mistake: row.mistake_tags, confidence: row.confidence, notes: row.notes,
    screenshotUrl: row.screenshot_url,
  };
}
async function uploadScreenshot(file) {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/trade-screenshots/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) throw new Error(`Screenshot upload failed (${res.status}): ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/trade-screenshots/${path}`;
}

async function apiGet() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?select=*&order=date.desc,created_at.desc`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Database read failed (${res.status}): ${await res.text()}`);
  return (await res.json()).map(fromDb);
}
async function apiInsert(trade) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades`, {
    method: 'POST', headers: { ...HEADERS, Prefer: 'return=representation' }, body: JSON.stringify(toDb(trade)),
  });
  if (!res.ok) throw new Error(`Database save failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return fromDb(data[0]);
}
async function apiUpdate(id, trade) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`, {
    method: 'PATCH', headers: { ...HEADERS, Prefer: 'return=representation' }, body: JSON.stringify(toDb(trade)),
  });
  if (!res.ok) throw new Error(`Database update failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return fromDb(data[0]);
}
async function apiDelete(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`, { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`Database delete failed (${res.status}): ${await res.text()}`);
}

// ===== JOURNAL API =====
function journalToDb(e) {
  return {
    date: e.date, mood: e.mood, confidence: e.confidence,
    pre_market_plan: e.preMarketPlan, post_market_review: e.postMarketReview,
    lessons_learned: e.lessonsLearned, mistakes: e.mistakes, tomorrow_focus: e.tomorrowFocus,
  };
}
function journalFromDb(row) {
  return {
    id: row.id, date: row.date, mood: row.mood, confidence: row.confidence,
    preMarketPlan: row.pre_market_plan, postMarketReview: row.post_market_review,
    lessonsLearned: row.lessons_learned, mistakes: row.mistakes, tomorrowFocus: row.tomorrow_focus,
  };
}
async function apiJournalList() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/journal_entries?select=*&order=date.desc&limit=30`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Journal read failed (${res.status}): ${await res.text()}`);
  return (await res.json()).map(journalFromDb);
}
async function apiJournalUpsert(entry) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/journal_entries?on_conflict=date`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(journalToDb(entry)),
  });
  if (!res.ok) throw new Error(`Journal save failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return journalFromDb(data[0]);
}

// ===== STRATEGY API =====
function strategyToDb(s) {
  return { name: s.name, description: s.description, rules: s.rules, checklist: s.checklist, expected_rr: s.expectedRR === '' ? null : s.expectedRR };
}
function strategyFromDb(row) {
  return { id: row.id, name: row.name, description: row.description, rules: row.rules, checklist: row.checklist, expectedRR: row.expected_rr };
}
async function apiStrategyList() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/strategies?select=*&order=name.asc`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Strategy read failed (${res.status}): ${await res.text()}`);
  return (await res.json()).map(strategyFromDb);
}
async function apiStrategyCreate(s) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/strategies`, {
    method: 'POST', headers: { ...HEADERS, Prefer: 'return=representation' }, body: JSON.stringify(strategyToDb(s)),
  });
  if (!res.ok) throw new Error(`Strategy save failed (${res.status}): ${await res.text()}`);
  return strategyFromDb((await res.json())[0]);
}
async function apiStrategyUpdate(id, s) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/strategies?id=eq.${id}`, {
    method: 'PATCH', headers: { ...HEADERS, Prefer: 'return=representation' }, body: JSON.stringify(strategyToDb(s)),
  });
  if (!res.ok) throw new Error(`Strategy update failed (${res.status}): ${await res.text()}`);
  return strategyFromDb((await res.json())[0]);
}
async function apiStrategyDelete(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/strategies?id=eq.${id}`, { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`Strategy delete failed (${res.status}): ${await res.text()}`);
}

// ===== RULE ENGINE API =====
function ruleFromDb(row) { return { id: row.id, ruleType: row.rule_type, threshold: row.threshold, enabled: row.enabled }; }
async function apiRulesList() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_rules?select=*&order=created_at.asc`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Rules read failed (${res.status}): ${await res.text()}`);
  return (await res.json()).map(ruleFromDb);
}
async function apiRuleCreate(ruleType, threshold) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_rules`, {
    method: 'POST', headers: { ...HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify({ rule_type: ruleType, threshold, enabled: true }),
  });
  if (!res.ok) throw new Error(`Rule create failed (${res.status}): ${await res.text()}`);
  return ruleFromDb((await res.json())[0]);
}
async function apiRuleUpdate(id, fields) {
  const body = {};
  if (fields.threshold !== undefined) body.threshold = fields.threshold;
  if (fields.enabled !== undefined) body.enabled = fields.enabled;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_rules?id=eq.${id}`, {
    method: 'PATCH', headers: { ...HEADERS, Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Rule update failed (${res.status}): ${await res.text()}`);
  return ruleFromDb((await res.json())[0]);
}
async function apiRuleDelete(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_rules?id=eq.${id}`, { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`Rule delete failed (${res.status}): ${await res.text()}`);
}

async function withRetry(fn, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) { lastErr = e; console.error(`[DB] attempt ${i + 1} failed:`, e.message); if (i < attempts - 1) await new Promise(r => setTimeout(r, 800)); }
  }
  throw lastErr;
}

// ===== UI =====
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'trades', label: 'Trades', icon: NotebookPen },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'journal', label: 'Journal', icon: BookOpen },
];
const MARKETS = ['Forex', 'Stocks', 'Crypto', 'Futures', 'Options', 'Other'];
const EMOTIONS = ['Calm', 'Confident', 'Anxious', 'FOMO', 'Greedy', 'Fearful', 'Revenge', 'Bored'];
const MISTAKES = ['None', 'Early Entry', 'Late Entry', 'Moved Stop', 'Oversized', 'FOMO Entry', 'Revenge Trade', 'No Stop Loss', 'Ignored Plan'];
const inputCls = "w-full bg-[#1A1B1F] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-[#E8E9EC] placeholder:text-[#4B5563] focus:outline-none focus:border-[#22C55E]/50 transition-colors";

function fmtMoney(n) { const sign = n > 0 ? '+' : n < 0 ? '-' : ''; return `${sign}$${Math.abs(n).toFixed(2)}`; }
function Field({ label, children }) { return <div><label className="text-[11px] uppercase tracking-wide text-[#6B7280] mb-1.5 block">{label}</label>{children}</div>; }
function StatCard({ label, value, positive, negative, icon: Icon, sub, compact }) {
  const color = positive ? '#22C55E' : negative ? '#EF4444' : '#E8E9EC';
  return (
    <div className={`rounded-2xl bg-[#141519] border border-white/[0.06] overflow-hidden min-w-0 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center gap-1.5 text-[#6B7280] mb-2 min-w-0">{Icon && <Icon size={13} className="shrink-0" />}<span className="text-[10px] font-medium uppercase tracking-wide truncate">{label}</span></div>
      <p className={`font-semibold tracking-tight truncate ${compact ? 'text-base' : 'text-xl'}`} style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-[#6B7280] mt-0.5">{sub}</p>}
    </div>
  );
}

function DashboardView({ trades, loading }) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sumPnl = (list) => list.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0);
  const inRange = (t, from) => t.date && new Date(t.date) >= from;
  const todayPnl = sumPnl(trades.filter(t => inRange(t, startOfToday)));
  const weekPnl = sumPnl(trades.filter(t => inRange(t, startOfWeek)));
  const monthPnl = sumPnl(trades.filter(t => inRange(t, startOfMonth)));
  const totalPnl = sumPnl(trades);
  const totalTrades = trades.length;
  const wins = trades.filter(t => Number(t.pnl) > 0);
  const losses = trades.filter(t => Number(t.pnl) < 0);
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const rTrades = trades.filter(t => t.rMultiple !== undefined && t.rMultiple !== null && t.rMultiple !== '');
  const avgR = rTrades.length > 0 ? rTrades.reduce((acc, t) => acc + Number(t.rMultiple), 0) / rTrades.length : 0;
  let streak = 0, streakType = null;
  const sorted = [...trades].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const t of sorted) {
    const isWin = Number(t.pnl) > 0;
    if (streakType === null) { streakType = isWin ? 'win' : 'loss'; streak = 1; }
    else if ((isWin && streakType === 'win') || (!isWin && streakType === 'loss')) streak++;
    else break;
  }
  const chronological = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0;
  const equityData = chronological.map((t, i) => { running += Number(t.pnl) || 0; return { i, value: running }; });
  if (equityData.length === 0) equityData.push({ i: 0, value: 0 }, { i: 1, value: 0 });
  else if (equityData.length === 1) equityData.unshift({ i: -1, value: 0 });
  const hasTrades = totalTrades > 0;

  return (
    <>
      {loading ? <div className="text-center py-16 text-[#6B7280] text-sm">Loading from database...</div> : !hasTrades ? (
        <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-6 text-center">
          <p className="text-sm font-medium mb-1">No trades yet</p>
          <p className="text-[13px] text-[#6B7280] leading-relaxed">Log a trade on the Trades tab and this screen fills in automatically.</p>
        </div>
      ) : null}
      <div className="rounded-2xl bg-gradient-to-br from-[#141519] to-[#0F1012] border border-white/[0.06] p-5">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[#6B7280] mb-1">Total P&L</p>
        <p className="text-3xl font-semibold tracking-tight" style={{ color: totalPnl > 0 ? '#22C55E' : totalPnl < 0 ? '#EF4444' : '#E8E9EC' }}>{fmtMoney(totalPnl)}</p>
        <div className="h-16 mt-3 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityData}>
              <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={totalPnl >= 0 ? '#22C55E' : '#EF4444'} stopOpacity={0.35} /><stop offset="100%" stopColor={totalPnl >= 0 ? '#22C55E' : '#EF4444'} stopOpacity={0} /></linearGradient></defs>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Area type="monotone" dataKey="value" stroke={totalPnl >= 0 ? '#22C55E' : '#EF4444'} strokeWidth={2} fill="url(#eq)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Today" value={fmtMoney(todayPnl)} positive={todayPnl > 0} negative={todayPnl < 0} compact />
        <StatCard label="Week" value={fmtMoney(weekPnl)} positive={weekPnl > 0} negative={weekPnl < 0} compact />
        <StatCard label="Month" value={fmtMoney(monthPnl)} positive={monthPnl > 0} negative={monthPnl < 0} compact />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Win Rate" value={`${winRate.toFixed(0)}%`} icon={Target} sub={`${wins.length}W / ${losses.length}L`} />
        <StatCard label="Total Trades" value={totalTrades} icon={NotebookPen} />
        <StatCard label="Average R" value={avgR.toFixed(2) + 'R'} icon={Activity} positive={avgR > 0} negative={avgR < 0} />
        <StatCard label="Current Streak" value={streak > 0 ? `${streak} ${streakType === 'win' ? 'Win' : 'Loss'}${streak > 1 ? 's' : ''}` : '—'} icon={streakType === 'win' ? TrendingUp : TrendingDown} positive={streakType === 'win'} negative={streakType === 'loss'} />
      </div>
    </>
  );
}

function TradeForm({ initial, onSave, saveLabel }) {
  const today = new Date().toISOString().slice(0, 10);
  const base = { date: today, market: 'Forex', symbol: '', direction: 'long', entry: '', exit: '', stopLoss: '', positionSize: '', strategy: '', setup: '', emotion: 'Calm', mistake: 'None', confidence: 3, notes: '', screenshotUrl: null };
  const [form, setForm] = useState({ ...base, ...initial });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [localError, setLocalError] = useState('');
  const [uploadingShot, setUploadingShot] = useState(false);
  const [shotError, setShotError] = useState('');
  const [zoomedImage, setZoomedImage] = useState(false);
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target ? e.target.value : e }));

  async function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploadingShot(true);
    setShotError('');
    try {
      const url = await withRetry(() => uploadScreenshot(file));
      setForm(f => ({ ...f, screenshotUrl: url }));
    } catch (err) {
      console.error('[Screenshot] upload failed:', err);
      setShotError(err.message || 'Upload failed. Please retry.');
    } finally {
      setUploadingShot(false);
      e.target.value = '';
    }
  }

  const entryN = parseFloat(form.entry), exitN = parseFloat(form.exit), stopN = parseFloat(form.stopLoss), qtyN = parseFloat(form.positionSize);
  const hasNumbers = !isNaN(entryN) && !isNaN(exitN) && !isNaN(stopN) && !isNaN(qtyN) && qtyN > 0;
  let pnl = 0, riskDollar = 0, rMultiple = 0;
  if (hasNumbers) {
    const riskPerUnit = Math.abs(entryN - stopN);
    riskDollar = riskPerUnit * qtyN;
    pnl = form.direction === 'long' ? (exitN - entryN) * qtyN : (entryN - exitN) * qtyN;
    rMultiple = riskDollar > 0 ? pnl / riskDollar : 0;
  }
  const canSave = form.symbol.trim() !== '' && form.date && form.direction && hasNumbers;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setLocalError('');
    const full = { ...form, entry: entryN, exit: exitN, stopLoss: stopN, positionSize: qtyN, risk: riskDollar, pnl: Number(pnl.toFixed(2)), rMultiple: Number(rMultiple.toFixed(2)) };
    let ok = false;
    try {
      ok = await onSave(full);
    } catch (e) {
      ok = false;
      setLocalError(e?.message || 'Trade could not be saved.');
    }
    setSaving(false);
    if (ok !== false) {
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 1800);
      if (!initial?.id) setForm(base);
    } else if (!localError) {
      setLocalError('Trade could not be saved. Please retry.');
    }
  }

  return (
    <>
      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" value={form.date} onChange={set('date')} className={inputCls} /></Field>
          <Field label="Market"><select value={form.market} onChange={set('market')} className={inputCls}>{MARKETS.map(m => <option key={m} value={m}>{m}</option>)}</select></Field>
        </div>
        <Field label="Symbol"><input type="text" placeholder="e.g. EURUSD, AAPL, BTCUSD" value={form.symbol} onChange={set('symbol')} className={inputCls} /></Field>
        <Field label="Direction">
          <div className="grid grid-cols-2 gap-2">
            {['long', 'short'].map(d => (
              <button key={d} onClick={() => setForm(f => ({ ...f, direction: d }))} className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${form.direction === d ? (d === 'long' ? 'bg-[#22C55E]/15 border-[#22C55E]/50 text-[#22C55E]' : 'bg-[#EF4444]/15 border-[#EF4444]/50 text-[#EF4444]') : 'bg-[#1A1B1F] border-white/[0.08] text-[#6B7280]'}`}>{d === 'long' ? 'Long' : 'Short'}</button>
            ))}
          </div>
        </Field>
      </div>
      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entry Price"><input inputMode="decimal" type="number" placeholder="0.00" value={form.entry} onChange={set('entry')} className={inputCls} /></Field>
          <Field label="Exit Price"><input inputMode="decimal" type="number" placeholder="0.00" value={form.exit} onChange={set('exit')} className={inputCls} /></Field>
          <Field label="Stop Loss"><input inputMode="decimal" type="number" placeholder="0.00" value={form.stopLoss} onChange={set('stopLoss')} className={inputCls} /></Field>
          <Field label="Position Size"><input inputMode="decimal" type="number" placeholder="0" value={form.positionSize} onChange={set('positionSize')} className={inputCls} /></Field>
        </div>
        {hasNumbers && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="rounded-xl bg-[#1A1B1F] border border-white/[0.06] p-3 text-center"><p className="text-[10px] uppercase text-[#6B7280] mb-1">Risk</p><p className="text-sm font-semibold">${riskDollar.toFixed(2)}</p></div>
            <div className="rounded-xl bg-[#1A1B1F] border border-white/[0.06] p-3 text-center"><p className="text-[10px] uppercase text-[#6B7280] mb-1">P&L</p><p className="text-sm font-semibold" style={{ color: pnl > 0 ? '#22C55E' : pnl < 0 ? '#EF4444' : '#E8E9EC' }}>{pnl > 0 ? '+' : ''}{pnl.toFixed(2)}</p></div>
            <div className="rounded-xl bg-[#1A1B1F] border border-white/[0.06] p-3 text-center"><p className="text-[10px] uppercase text-[#6B7280] mb-1">R Multiple</p><p className="text-sm font-semibold" style={{ color: rMultiple > 0 ? '#22C55E' : rMultiple < 0 ? '#EF4444' : '#E8E9EC' }}>{rMultiple.toFixed(2)}R</p></div>
          </div>
        )}
      </div>
      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5 space-y-4">
        <Field label="Strategy"><input type="text" placeholder="e.g. Trend pullback" value={form.strategy} onChange={set('strategy')} className={inputCls} /></Field>
        <Field label="Setup"><input type="text" placeholder="e.g. Breakout retest" value={form.setup} onChange={set('setup')} className={inputCls} /></Field>
      </div>
      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5 space-y-4">
        <Field label="Emotion"><select value={form.emotion} onChange={set('emotion')} className={inputCls}>{EMOTIONS.map(e => <option key={e} value={e}>{e}</option>)}</select></Field>
        <Field label="Mistake"><select value={form.mistake} onChange={set('mistake')} className={inputCls}>{MISTAKES.map(m => <option key={m} value={m}>{m}</option>)}</select></Field>
        <Field label="Confidence"><div className="flex gap-2">{[1, 2, 3, 4, 5].map(n => (<button key={n} onClick={() => setForm(f => ({ ...f, confidence: n }))} className="p-1"><Star size={22} className={n <= form.confidence ? 'fill-[#22C55E] text-[#22C55E]' : 'text-[#3A3B40]'} /></button>))}</div></Field>
      </div>
      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5 space-y-4">
        <Field label="Notes"><textarea rows={3} placeholder="What happened? What did you see?" value={form.notes} onChange={set('notes')} className={inputCls} /></Field>
        <Field label="Screenshot">
          {form.screenshotUrl ? (
            <div className="relative">
              <img src={form.screenshotUrl} alt="Trade screenshot" onClick={() => setZoomedImage(true)} className="w-full max-h-56 object-cover rounded-xl border border-white/[0.08] cursor-pointer" />
              <button type="button" onClick={() => setForm(f => ({ ...f, screenshotUrl: null }))} className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2.5 py-1 rounded-lg">Remove</button>
              <p className="text-[10px] text-[#6B7280] mt-1.5 text-center">Tap image to view full size</p>
            </div>
          ) : (
            <label className="w-full bg-[#1A1B1F] border border-dashed border-white/[0.15] rounded-xl px-3.5 py-5 text-center block cursor-pointer">
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={uploadingShot} />
              <p className="text-xs text-[#9CA3AF]">{uploadingShot ? 'Uploading...' : 'Tap to take a photo or choose from gallery'}</p>
            </label>
          )}
          {shotError && <p className="text-[11px] text-[#EF4444] mt-1.5">{shotError}</p>}
        </Field>
      </div>
      {zoomedImage && form.screenshotUrl && (
        <div onClick={() => setZoomedImage(false)} className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" style={{ position: 'fixed' }}>
          <img src={form.screenshotUrl} alt="Trade screenshot full size" className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setZoomedImage(false)} className="absolute top-6 right-6 bg-white/10 text-white w-9 h-9 rounded-full flex items-center justify-center text-lg">✕</button>
        </div>
      )}
      <button onClick={handleSave} disabled={!canSave || saving} className={`w-full py-3.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${canSave ? 'bg-[#22C55E] text-black' : 'bg-[#1A1B1F] text-[#4B5563] border border-white/[0.06]'}`}>
        {savedMsg ? <><Check size={16} /> Saved to database</> : saving ? 'Saving...' : saveLabel}
      </button>
      {localError && <p className="text-[12px] text-[#EF4444] text-center -mt-2 flex items-center justify-center gap-1"><AlertCircle size={13} />{localError}</p>}
      {!canSave && <p className="text-[11px] text-[#6B7280] text-center -mt-2">Fill in Symbol, Entry, Exit, Stop Loss, and Position Size to save.</p>}
    </>
  );
}

const FILTERS = ['All', 'Long', 'Short', 'Wins', 'Losses'];
const SORTS = ['Newest', 'Oldest', 'Highest P&L', 'Lowest P&L'];

function LedgerView({ trades, onEdit }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState('Newest');
  let list = trades.filter(t => {
    const q = query.toLowerCase();
    const matchesQuery = !q || [t.symbol, t.strategy, t.setup, t.notes].some(v => (v || '').toLowerCase().includes(q));
    const matchesFilter = filter === 'All' ? true : filter === 'Long' ? t.direction === 'long' : filter === 'Short' ? t.direction === 'short' : filter === 'Wins' ? Number(t.pnl) > 0 : Number(t.pnl) < 0;
    return matchesQuery && matchesFilter;
  });
  list = [...list].sort((a, b) => {
    if (sort === 'Newest') return new Date(b.date) - new Date(a.date);
    if (sort === 'Oldest') return new Date(a.date) - new Date(b.date);
    if (sort === 'Highest P&L') return Number(b.pnl) - Number(a.pnl);
    return Number(a.pnl) - Number(b.pnl);
  });
  return (
    <>
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
        <input type="text" placeholder="Search symbol, strategy, notes..." value={query} onChange={e => setQuery(e.target.value)} className={inputCls + ' pl-10'} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        {FILTERS.map(f => (<button key={f} onClick={() => setFilter(f)} className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filter === f ? 'bg-[#22C55E]/15 border-[#22C55E]/50 text-[#22C55E]' : 'bg-[#1A1B1F] border-white/[0.08] text-[#6B7280]'}`}>{f}</button>))}
      </div>
      <select value={sort} onChange={e => setSort(e.target.value)} className={inputCls}>{SORTS.map(s => <option key={s} value={s}>{s}</option>)}</select>
      {list.length === 0 ? (
        <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-6 text-center"><p className="text-sm text-[#6B7280]">No trades match.</p></div>
      ) : (
        <div className="space-y-2">
          {list.map(t => (
            <button key={t.id} onClick={() => onEdit(t)} className="w-full text-left rounded-xl bg-[#141519] border border-white/[0.06] px-4 py-3 flex items-center justify-between active:bg-[#1A1B1F] transition-colors">
              <div><p className="text-sm font-medium flex items-center gap-1.5">{t.symbol} <span className="text-[#6B7280] font-normal">· {t.direction === 'long' ? 'Long' : 'Short'} · {t.market}</span>{t.screenshotUrl && <Camera size={12} className="text-[#6B7280] shrink-0" />}</p><p className="text-[11px] text-[#6B7280]">{t.date}</p></div>
              <div className="text-right"><p className="text-sm font-semibold" style={{ color: t.pnl > 0 ? '#22C55E' : t.pnl < 0 ? '#EF4444' : '#E8E9EC' }}>{t.pnl > 0 ? '+' : ''}{Number(t.pnl).toFixed(2)}</p><p className="text-[11px] text-[#6B7280]">{Number(t.rMultiple).toFixed(2)}R</p></div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function CalendarView({ trades }) {
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(null);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const dayMap = {};
  trades.forEach(t => {
    if (!t.date) return;
    if (!dayMap[t.date]) dayMap[t.date] = { pnl: 0, count: 0 };
    dayMap[t.date].pnl += Number(t.pnl) || 0;
    dayMap[t.date].count += 1;
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthTrades = trades.filter(t => t.date && t.date.startsWith(monthPrefix));
  const monthPnl = monthTrades.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0);
  const monthWins = monthTrades.filter(t => Number(t.pnl) > 0).length;
  const monthWinRate = monthTrades.length > 0 ? (monthWins / monthTrades.length) * 100 : 0;

  const dateStr = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const selectedTrades = selected ? trades.filter(t => t.date === selected).sort((a, b) => Number(b.id || 0) - Number(a.id || 0)) : [];

  const maxAbsPnl = Math.max(1, ...Object.values(dayMap).map(v => Math.abs(v.pnl)));
  function tierStyle(pnl) {
    if (pnl === 0) return { bg: '#3A3B40', text: '#E8E9EC' };
    const ratio = Math.abs(pnl) / maxAbsPnl;
    const tier = ratio < 0.34 ? 0 : ratio < 0.67 ? 1 : 2;
    if (pnl > 0) {
      const bgs = ['#DCFCE7', '#86EFAC', '#22C55E'];
      const texts = ['#166534', '#14532D', '#052E14'];
      return { bg: bgs[tier], text: texts[tier] };
    }
    const bgs = ['#FEE2E2', '#FCA5A5', '#EF4444'];
    const texts = ['#7F1D1D', '#7F1D1D', '#450A0A'];
    return { bg: bgs[tier], text: texts[tier] };
  }

  return (
    <>
      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4 grid grid-cols-3 gap-3">
        <div><p className="text-[10px] uppercase text-[#6B7280] mb-1">Month P&L</p><p className="text-base font-semibold truncate" style={{ color: monthPnl > 0 ? '#22C55E' : monthPnl < 0 ? '#EF4444' : '#E8E9EC' }}>{fmtMoney(monthPnl)}</p></div>
        <div><p className="text-[10px] uppercase text-[#6B7280] mb-1">Trades</p><p className="text-base font-semibold">{monthTrades.length}</p></div>
        <div><p className="text-[10px] uppercase text-[#6B7280] mb-1">Win Rate</p><p className="text-base font-semibold">{monthWinRate.toFixed(0)}%</p></div>
      </div>

      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-2.5">
        <div className="flex items-center justify-between mb-1 px-1.5">
          <button onClick={() => { setCursor(new Date(year, month - 1, 1)); setSelected(null); }} className="p-1.5 rounded-lg bg-[#1A1B1F] text-[#9CA3AF]"><ChevronLeft size={16} /></button>
          <p className="text-sm font-semibold">{MONTH_NAMES[month]} {year}</p>
          <button onClick={() => { setCursor(new Date(year, month + 1, 1)); setSelected(null); }} className="p-1.5 rounded-lg bg-[#1A1B1F] text-[#9CA3AF]"><ChevronLeft size={16} className="rotate-180" /></button>
        </div>
        <p className="text-center text-[11px] text-[#6B7280] mb-4">
          {monthTrades.length} trade{monthTrades.length !== 1 ? 's' : ''} · <span style={{ color: monthPnl > 0 ? '#22C55E' : monthPnl < 0 ? '#EF4444' : '#9CA3AF' }}>{fmtMoney(monthPnl)}</span>
        </p>
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {WEEKDAYS.map((w, i) => <div key={i} className="text-center text-[10px] text-[#6B7280] font-medium">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const ds = dateStr(d);
            const info = dayMap[ds];
            const isSelected = selected === ds;
            const style = info ? tierStyle(info.pnl) : { bg: '#1A1B1F', text: '#4B5563' };
            const pnlLabel = info ? (info.pnl >= 0 ? `+$${info.pnl.toFixed(2)}` : `-$${Math.abs(info.pnl).toFixed(2)}`) : null;
            const pnlFontSize = pnlLabel && pnlLabel.length > 10 ? '6.5px' : pnlLabel && pnlLabel.length > 7 ? '7.5px' : '8.5px';
            return (
              <button
                key={i}
                onClick={() => setSelected(isSelected ? null : ds)}
                style={{ backgroundColor: style.bg, color: style.text }}
                className={`aspect-[3/4] rounded-lg flex flex-col items-center justify-center gap-0.5 px-1 overflow-hidden ${isSelected ? 'ring-2 ring-white/60' : ''}`}
              >
                <span className="text-sm font-semibold leading-none">{d}</span>
                {info ? (
                  <>
                    <span style={{ fontSize: pnlFontSize }} className="font-bold leading-none whitespace-nowrap">{pnlLabel}</span>
                    <span className="text-[7px] leading-none opacity-80 whitespace-nowrap">{info.count} trade{info.count !== 1 ? 's' : ''}</span>
                  </>
                ) : (
                  <span className="text-[7px] leading-none opacity-70">No data</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-4 flex-wrap">
          <span className="text-[10px] text-[#6B7280] mr-1">Loss</span>
          {['#EF4444', '#FCA5A5', '#FEE2E2'].map(c => <div key={c} className="w-3.5 h-3.5 rounded" style={{ backgroundColor: c }} />)}
          <div className="w-3.5 h-3.5 rounded bg-[#1A1B1F] mx-1" />
          {['#DCFCE7', '#86EFAC', '#22C55E'].map(c => <div key={c} className="w-3.5 h-3.5 rounded" style={{ backgroundColor: c }} />)}
          <span className="text-[10px] text-[#6B7280] ml-1">Profit</span>
        </div>
      </div>

      {selected && (
        <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4">
          <p className="text-[11px] uppercase tracking-wide text-[#6B7280] mb-3">{selected}</p>
          {selectedTrades.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No trades this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedTrades.map(t => (
                <div key={t.id} className="rounded-xl bg-[#1A1B1F] border border-white/[0.06] px-4 py-3 flex items-center justify-between">
                  <div><p className="text-sm font-medium">{t.symbol} <span className="text-[#6B7280] font-normal">· {t.direction === 'long' ? 'Long' : 'Short'}</span></p><p className="text-[11px] text-[#6B7280]">{t.strategy || 'No strategy noted'}</p></div>
                  <p className="text-sm font-semibold" style={{ color: t.pnl > 0 ? '#22C55E' : t.pnl < 0 ? '#EF4444' : '#E8E9EC' }}>{t.pnl > 0 ? '+' : ''}{Number(t.pnl).toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function GroupTable({ title, groups, icon: Icon }) {
  if (groups.length === 0) return null;
  return (
    <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4">
      <div className="flex items-center gap-1.5 text-[#6B7280] mb-3"><Icon size={14} /><p className="text-[11px] uppercase tracking-wide font-medium">{title}</p></div>
      <div className="space-y-2">
        {groups.map(g => (
          <div key={g.key} className="flex items-center justify-between">
            <div className="min-w-0 flex-1 mr-3">
              <p className="text-sm font-medium truncate">{g.key}</p>
              <p className="text-[11px] text-[#6B7280]">{g.count} trade{g.count !== 1 ? 's' : ''} · {g.count > 0 ? Math.round((g.wins / g.count) * 100) : 0}% win</p>
            </div>
            <p className="text-sm font-semibold shrink-0" style={{ color: g.pnl > 0 ? '#22C55E' : g.pnl < 0 ? '#EF4444' : '#E8E9EC' }}>{g.pnl > 0 ? '+' : ''}{g.pnl.toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StrategyManager({ trades, onClose }) {
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subview, setSubview] = useState('list'); // list | add
  const [editing, setEditing] = useState(null);
  const emptyForm = { name: '', description: '', rules: '', checklist: '', expectedRR: '' };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try { setStrategies(await apiStrategyList()); }
      catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  function statsFor(name) {
    const matched = trades.filter(t => (t.strategy || '').trim().toLowerCase() === name.trim().toLowerCase());
    const pnl = matched.reduce((a, t) => a + (Number(t.pnl) || 0), 0);
    const wins = matched.filter(t => Number(t.pnl) > 0).length;
    const avgR = matched.length > 0 ? matched.reduce((a, t) => a + (Number(t.rMultiple) || 0), 0) / matched.length : 0;
    return { count: matched.length, pnl, winRate: matched.length > 0 ? (wins / matched.length) * 100 : 0, avgR };
  }

  function startEdit(s) { setEditing(s); setForm({ name: s.name, description: s.description || '', rules: s.rules || '', checklist: s.checklist || '', expectedRR: s.expectedRR ?? '' }); setSubview('add'); }
  function startNew() { setEditing(null); setForm(emptyForm); setSubview('add'); }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const updated = await withRetry(() => apiStrategyUpdate(editing.id, form));
        setStrategies(prev => prev.map(s => s.id === updated.id ? updated : s));
      } else {
        const created = await withRetry(() => apiStrategyCreate(form));
        setStrategies(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setSubview('list');
      setEditing(null);
    } catch (e) {
      setError(e.message || 'Could not save strategy.');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!editing || !window.confirm(`Delete "${editing.name}"? This won't delete any trades, just this strategy record.`)) return;
    try {
      await apiStrategyDelete(editing.id);
      setStrategies(prev => prev.filter(s => s.id !== editing.id));
      setSubview('list');
      setEditing(null);
    } catch (e) {
      setError(e.message || 'Could not delete strategy.');
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="flex items-center gap-1 text-sm text-[#6B7280]"><ChevronLeft size={16} /> Back to Stats</button>
        {subview === 'list' && <button onClick={startNew} className="text-xs font-medium text-[#22C55E]">+ New Strategy</button>}
      </div>

      {error && <div className="rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 px-4 py-3 text-xs text-[#EF4444]">{error}</div>}

      {subview === 'add' ? (
        <>
          <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5 space-y-4">
            <Field label="Name"><input type="text" placeholder="e.g. Trend Pullback" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} /></Field>
            <Field label="Description"><textarea rows={2} placeholder="One-line summary of this setup" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} /></Field>
            <Field label="Expected RR"><input inputMode="decimal" type="number" placeholder="e.g. 2.5" value={form.expectedRR} onChange={e => setForm(f => ({ ...f, expectedRR: e.target.value }))} className={inputCls} /></Field>
            <Field label="Rules"><textarea rows={4} placeholder="One rule per line" value={form.rules} onChange={e => setForm(f => ({ ...f, rules: e.target.value }))} className={inputCls} /></Field>
            <Field label="Checklist"><textarea rows={4} placeholder="One checklist item per line" value={form.checklist} onChange={e => setForm(f => ({ ...f, checklist: e.target.value }))} className={inputCls} /></Field>
          </div>
          <button onClick={handleSave} disabled={!form.name.trim() || saving} className={`w-full py-3.5 rounded-xl text-sm font-semibold ${form.name.trim() ? 'bg-[#22C55E] text-black' : 'bg-[#1A1B1F] text-[#4B5563] border border-white/[0.06]'}`}>
            {saving ? 'Saving...' : editing ? 'Update Strategy' : 'Save Strategy'}
          </button>
          {editing && <button onClick={handleDelete} className="w-full py-3 rounded-xl text-sm font-medium text-[#EF4444] flex items-center justify-center gap-1.5"><Trash2 size={14} /> Delete Strategy</button>}
        </>
      ) : loading ? (
        <p className="text-sm text-[#6B7280] text-center py-8">Loading...</p>
      ) : strategies.length === 0 ? (
        <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-6 text-center">
          <p className="text-sm font-medium mb-1">No strategies saved yet</p>
          <p className="text-[13px] text-[#6B7280]">Save your setups here with rules and a checklist, and this screen will track real performance for each one automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {strategies.map(s => {
            const st = statsFor(s.name);
            return (
              <button key={s.id} onClick={() => startEdit(s)} className="w-full text-left rounded-2xl bg-[#141519] border border-white/[0.06] p-4 active:bg-[#1A1B1F]">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold">{s.name}</p>
                  <p className="text-sm font-semibold" style={{ color: st.pnl > 0 ? '#22C55E' : st.pnl < 0 ? '#EF4444' : '#E8E9EC' }}>{st.pnl > 0 ? '+' : ''}{st.pnl.toFixed(2)}</p>
                </div>
                {s.description && <p className="text-[12px] text-[#6B7280] mb-2">{s.description}</p>}
                <p className="text-[11px] text-[#6B7280]">{st.count} trade{st.count !== 1 ? 's' : ''} · {st.winRate.toFixed(0)}% win · {st.avgR.toFixed(2)}R avg{s.expectedRR ? ` · target ${s.expectedRR}R` : ''}</p>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function PsychologyView({ trades, onClose }) {
  const [journalEntries, setJournalEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setJournalEntries(await apiJournalList()); }
      catch (e) { console.error('[Psychology] journal load failed:', e); }
      finally { setLoading(false); }
    })();
  }, []);

  function groupBy(keyFn) {
    const map = {};
    trades.forEach(t => {
      const k = keyFn(t);
      if (!k) return;
      if (!map[k]) map[k] = { key: k, pnl: 0, count: 0, wins: 0 };
      map[k].pnl += Number(t.pnl) || 0;
      map[k].count += 1;
      if (Number(t.pnl) > 0) map[k].wins += 1;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }

  const byEmotion = groupBy(t => t.emotion);
  const mistakesOnly = trades.filter(t => t.mistake && t.mistake !== 'None');
  const byMistake = groupBy(t => t.mistake).filter(g => g.key !== 'None').sort((a, b) => a.pnl - b.pnl);
  const byConfidence = groupBy(t => t.confidence ? `${t.confidence} Star${t.confidence > 1 ? 's' : ''}` : null);

  const disciplineScore = trades.length > 0 ? Math.round(((trades.length - mistakesOnly.length) / trades.length) * 100) : 0;

  const worstEmotion = [...byEmotion].sort((a, b) => a.pnl - b.pnl)[0];
  const costliestMistake = byMistake[0];

  return (
    <>
      <button onClick={onClose} className="flex items-center gap-1 text-sm text-[#6B7280]"><ChevronLeft size={16} /> Back to Stats</button>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Discipline Score" value={`${disciplineScore}%`} positive={disciplineScore >= 70} negative={disciplineScore < 50} icon={Target} sub={`${mistakesOnly.length} flagged trade${mistakesOnly.length !== 1 ? 's' : ''}`} />
        <StatCard label="Total Trades" value={trades.length} icon={NotebookPen} />
      </div>

      {(worstEmotion || costliestMistake) && (
        <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-[#6B7280] mb-1">Quick Insights</p>
          {worstEmotion && worstEmotion.pnl < 0 && (
            <p className="text-sm text-[#E8E9EC]">You lose the most when trading <span className="font-semibold text-[#EF4444]">{worstEmotion.key}</span> — {fmtMoney(worstEmotion.pnl)} across {worstEmotion.count} trade{worstEmotion.count !== 1 ? 's' : ''}.</p>
          )}
          {costliestMistake && costliestMistake.pnl < 0 && (
            <p className="text-sm text-[#E8E9EC]">Your costliest mistake is <span className="font-semibold text-[#EF4444]">{costliestMistake.key}</span> — {fmtMoney(costliestMistake.pnl)} total.</p>
          )}
          {!(worstEmotion && worstEmotion.pnl < 0) && !(costliestMistake && costliestMistake.pnl < 0) && (
            <p className="text-sm text-[#6B7280]">No clear costly patterns yet — keep logging to build a bigger picture.</p>
          )}
        </div>
      )}

      <GroupTable title="By Emotion" groups={byEmotion} icon={Activity} />
      <GroupTable title="By Mistake" groups={byMistake} icon={AlertCircle} />
      <GroupTable title="By Confidence Level" groups={byConfidence} icon={Star} />

      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4">
        <p className="text-[11px] uppercase tracking-wide text-[#6B7280] mb-3">Recent Mood (from Journal)</p>
        {loading ? (
          <p className="text-sm text-[#6B7280]">Loading...</p>
        ) : journalEntries.length === 0 ? (
          <p className="text-sm text-[#6B7280]">No journal entries yet — log a daily entry in the Journal tab to track mood over time.</p>
        ) : (
          <div className="space-y-2">
            {journalEntries.slice(0, 8).map(e => (
              <div key={e.id} className="flex items-center justify-between">
                <p className="text-sm">{e.date}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#9CA3AF]">{e.mood}</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(n => <Star key={n} size={11} className={n <= (e.confidence || 0) ? 'fill-[#22C55E] text-[#22C55E]' : 'text-[#3A3B40]'} />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function generateInsights(trades) {
  const insights = [];
  const fmt = fmtMoney;

  const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dowMap = {};
  trades.forEach(t => {
    if (!t.date) return;
    const d = new Date(t.date).getDay();
    if (!dowMap[d]) dowMap[d] = { day: dowNames[d], pnl: 0, count: 0 };
    dowMap[d].pnl += Number(t.pnl) || 0;
    dowMap[d].count += 1;
  });
  const dowArr = Object.values(dowMap);
  if (dowArr.length >= 2) {
    const best = [...dowArr].sort((a, b) => b.pnl - a.pnl)[0];
    const worst = [...dowArr].sort((a, b) => a.pnl - b.pnl)[0];
    if (best.pnl > 0) insights.push({ icon: TrendingUp, positive: true, text: `You perform best on ${best.day}s — ${fmt(best.pnl)} across ${best.count} trade${best.count !== 1 ? 's' : ''}.` });
    if (worst.pnl < 0 && worst.day !== best.day) insights.push({ icon: TrendingDown, positive: false, text: `${worst.day}s have been your worst day — ${fmt(worst.pnl)} total. Consider sitting out or sizing down.` });
  }

  const chronological = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date) || Number(a.id) - Number(b.id));
  const afterLoss = [], afterWin = [];
  for (let i = 1; i < chronological.length; i++) {
    (Number(chronological[i - 1].pnl) > 0 ? afterWin : afterLoss).push(chronological[i]);
  }
  const avg = (arr) => arr.length ? arr.reduce((a, t) => a + (Number(t.pnl) || 0), 0) / arr.length : null;
  const avgAfterLoss = avg(afterLoss), avgAfterWin = avg(afterWin);
  if (avgAfterLoss !== null && avgAfterWin !== null && avgAfterLoss < avgAfterWin - Math.abs(avgAfterWin) * 0.3) {
    insights.push({ icon: AlertCircle, positive: false, text: `Your results drop after a loss (avg ${fmt(avgAfterLoss)}/trade) versus after a win (avg ${fmt(avgAfterWin)}/trade) — a possible sign of revenge trading.` });
  }

  const longs = trades.filter(t => t.direction === 'long'), shorts = trades.filter(t => t.direction === 'short');
  if (longs.length >= 3 && shorts.length >= 3) {
    const longWR = (longs.filter(t => Number(t.pnl) > 0).length / longs.length) * 100;
    const shortWR = (shorts.filter(t => Number(t.pnl) > 0).length / shorts.length) * 100;
    if (Math.abs(longWR - shortWR) > 15) {
      const betterIsLong = longWR > shortWR;
      insights.push({ icon: Target, positive: true, text: `You're noticeably stronger trading ${betterIsLong ? 'Long' : 'Short'} (${Math.round(betterIsLong ? longWR : shortWR)}% win rate) than ${betterIsLong ? 'Short' : 'Long'} (${Math.round(betterIsLong ? shortWR : longWR)}% win rate).` });
    }
  }

  const byDate = {};
  trades.forEach(t => {
    if (!t.date) return;
    if (!byDate[t.date]) byDate[t.date] = { pnl: 0, count: 0 };
    byDate[t.date].pnl += Number(t.pnl) || 0;
    byDate[t.date].count += 1;
  });
  const heavyDays = Object.values(byDate).filter(d => d.count >= 3);
  const lightDays = Object.values(byDate).filter(d => d.count === 1);
  if (heavyDays.length >= 2 && lightDays.length >= 2) {
    const heavyAvg = heavyDays.reduce((a, d) => a + d.pnl, 0) / heavyDays.reduce((a, d) => a + d.count, 0);
    const lightAvg = lightDays.reduce((a, d) => a + d.pnl, 0) / lightDays.reduce((a, d) => a + d.count, 0);
    if (heavyAvg < lightAvg - Math.abs(lightAvg) * 0.3) {
      insights.push({ icon: AlertCircle, positive: false, text: `On days you take 3+ trades, your average result per trade (${fmt(heavyAvg)}) is worse than on single-trade days (${fmt(lightAvg)}) — a possible overtrading pattern.` });
    }
  }

  const emoMap = {};
  trades.forEach(t => {
    if (!t.emotion) return;
    if (!emoMap[t.emotion]) emoMap[t.emotion] = { key: t.emotion, pnl: 0, count: 0 };
    emoMap[t.emotion].pnl += Number(t.pnl) || 0;
    emoMap[t.emotion].count += 1;
  });
  const emoArr = Object.values(emoMap).filter(e => e.count >= 2);
  if (emoArr.length > 0) {
    const worstEmo = [...emoArr].sort((a, b) => a.pnl - b.pnl)[0];
    if (worstEmo.pnl < 0) insights.push({ icon: AlertCircle, positive: false, text: `Most losing trades happen when you're feeling "${worstEmo.key}" — ${fmt(worstEmo.pnl)} across ${worstEmo.count} trades.` });
  }

  return insights;
}

function confidenceLabel(n) {
  if (n < 6) return { label: 'Insufficient data', color: '#6B7280' };
  if (n < 20) return { label: 'Early observation', color: '#F59E0B' };
  if (n < 50) return { label: 'Moderate evidence', color: '#EAB308' };
  if (n < 100) return { label: 'Strengthening evidence', color: '#84CC16' };
  return { label: 'Strong historical evidence', color: '#22C55E' };
}

function EvidenceBlock({ title, children }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[#6B7280] mb-1">{title}</p>
      <div className="text-sm text-[#E8E9EC] leading-relaxed">{children}</div>
    </div>
  );
}

function WhyLosingView({ trades }) {
  const chronological = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date) || Number(a.id) - Number(b.id));
  const factors = [];

  const afterLoss = [];
  for (let i = 1; i < chronological.length; i++) if (Number(chronological[i - 1].pnl) <= 0) afterLoss.push(chronological[i]);
  if (afterLoss.length >= 3) {
    const pnl = afterLoss.reduce((a, t) => a + Number(t.pnl), 0);
    const wins = afterLoss.filter(t => Number(t.pnl) > 0).length;
    if (pnl < 0) factors.push({ name: 'Trading Right After a Loss', count: afterLoss.length, pnl, winRate: (wins / afterLoss.length) * 100 });
  }

  const byDate = {};
  trades.forEach(t => { if (!t.date) return; (byDate[t.date] = byDate[t.date] || []).push(t); });
  const overtradeTrades = Object.values(byDate).filter(list => list.length >= 3).flat();
  if (overtradeTrades.length >= 3) {
    const pnl = overtradeTrades.reduce((a, t) => a + Number(t.pnl), 0);
    const wins = overtradeTrades.filter(t => Number(t.pnl) > 0).length;
    if (pnl < 0) factors.push({ name: 'Overtrading (3+ trades/day)', count: overtradeTrades.length, pnl, winRate: (wins / overtradeTrades.length) * 100 });
  }

  const mistakeTrades = trades.filter(t => t.mistake && t.mistake !== 'None');
  const byMistakeName = {};
  mistakeTrades.forEach(t => { (byMistakeName[t.mistake] = byMistakeName[t.mistake] || []).push(t); });
  Object.entries(byMistakeName).forEach(([name, list]) => {
    if (list.length < 2) return;
    const pnl = list.reduce((a, t) => a + Number(t.pnl), 0);
    const wins = list.filter(t => Number(t.pnl) > 0).length;
    if (pnl < 0) factors.push({ name, count: list.length, pnl, winRate: (wins / list.length) * 100 });
  });

  factors.sort((a, b) => a.pnl - b.pnl);
  const totalLoss = trades.filter(t => Number(t.pnl) < 0).reduce((a, t) => a + Number(t.pnl), 0);
  const top = factors[0];

  if (!top) {
    return <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5"><p className="text-sm text-[#6B7280]">No clear, data-backed cause stands out yet. That's a good sign — or it just means we need more trades to be sure.</p></div>;
  }
  const pctOfLosses = totalLoss < 0 ? Math.round((top.pnl / totalLoss) * 100) : 0;
  const conf = confidenceLabel(top.count);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5 space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#EF4444] mb-1">Your Biggest Performance Leak</p>
          <p className="text-lg font-semibold">{top.name}</p>
        </div>
        <EvidenceBlock title="Evidence">
          {top.count} trades · {fmtMoney(top.pnl)} net · {top.winRate.toFixed(0)}% win rate{pctOfLosses > 0 ? ` · roughly ${pctOfLosses}% of your total losses` : ''}
        </EvidenceBlock>
        <EvidenceBlock title="Coach's Verdict">Your data suggests this pattern is a bigger drag on results than your core strategy selection right now.</EvidenceBlock>
        <EvidenceBlock title="Action">For your next 10 trades, specifically watch for this pattern before entering — pause and re-check your plan when it shows up.</EvidenceBlock>
        <p className="text-[11px]" style={{ color: conf.color }}>{conf.label} ({top.count} trades)</p>
      </div>
      {factors.length > 1 && (
        <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4">
          <p className="text-[11px] uppercase tracking-wide text-[#6B7280] mb-3">Other Contributing Factors</p>
          <div className="space-y-2">
            {factors.slice(1).map((f, i) => (
              <div key={i} className="flex items-center justify-between">
                <p className="text-sm">{f.name}</p>
                <p className="text-sm font-medium text-[#EF4444]">{fmtMoney(f.pnl)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ImprovingView({ trades }) {
  const chronological = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date) || Number(a.id) - Number(b.id));
  const n = Math.min(20, Math.floor(chronological.length / 2));
  if (n < 5) {
    return <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5"><p className="text-sm text-[#6B7280]">Not enough trades yet for a fair before/after comparison — log more and check back.</p></div>;
  }
  const recent = chronological.slice(-n);
  const previous = chronological.slice(-2 * n, -n);

  function stats(list) {
    const pnl = list.reduce((a, t) => a + Number(t.pnl), 0);
    const wins = list.filter(t => Number(t.pnl) > 0).length;
    const avgR = list.reduce((a, t) => a + (Number(t.rMultiple) || 0), 0) / list.length;
    const mistakeRate = (list.filter(t => t.mistake && t.mistake !== 'None').length / list.length) * 100;
    return { pnl, winRate: (wins / list.length) * 100, avgR, mistakeRate };
  }
  const r = stats(recent), p = stats(previous);
  const pnlBetter = r.pnl > p.pnl;
  const mistakesBetter = r.mistakeRate < p.mistakeRate;

  let verdict;
  if (pnlBetter && mistakesBetter) verdict = 'Clear improvement — both your results and your discipline are trending the right way.';
  else if (!pnlBetter && mistakesBetter) verdict = 'You may be improving despite lower recent P&L — your execution discipline (fewer flagged mistakes) has gotten meaningfully better.';
  else if (pnlBetter && !mistakesBetter) verdict = 'Recent P&L is up, but flagged mistakes increased — worth watching before assuming this is sustainable.';
  else verdict = 'Both results and discipline have slipped recently — worth a deliberate reset.';

  const Row = ({ label, prevVal, recVal, higherBetter = true }) => {
    const better = higherBetter ? recVal > prevVal : recVal < prevVal;
    return (
      <div className="flex items-center justify-between py-1.5">
        <p className="text-sm text-[#9CA3AF]">{label}</p>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#6B7280]">{prevVal}</span>
          <span className="text-[#4B5563]">→</span>
          <span className="font-semibold" style={{ color: better ? '#22C55E' : '#EF4444' }}>{recVal}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5">
        <p className="text-[10px] uppercase tracking-wide text-[#6B7280] mb-3">Last {n} Trades vs Previous {n}</p>
        <Row label="Net P&L" prevVal={fmtMoney(p.pnl)} recVal={fmtMoney(r.pnl)} />
        <Row label="Win Rate" prevVal={p.winRate.toFixed(0) + '%'} recVal={r.winRate.toFixed(0) + '%'} />
        <Row label="Average R" prevVal={p.avgR.toFixed(2) + 'R'} recVal={r.avgR.toFixed(2) + 'R'} />
        <Row label="Mistake Rate" prevVal={p.mistakeRate.toFixed(0) + '%'} recVal={r.mistakeRate.toFixed(0) + '%'} higherBetter={false} />
      </div>
      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5">
        <p className="text-[10px] uppercase tracking-wide text-[#6B7280] mb-1">Coach's Verdict</p>
        <p className="text-sm leading-relaxed">{verdict}</p>
      </div>
    </div>
  );
}

function TopMistakesView({ trades }) {
  const mistakeTrades = trades.filter(t => t.mistake && t.mistake !== 'None');
  if (mistakeTrades.length === 0) {
    return <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5"><p className="text-sm text-[#6B7280]">No mistakes flagged in your trades yet — either great discipline, or the Mistake field isn't being used consistently.</p></div>;
  }
  const totalLoss = Math.abs(trades.filter(t => Number(t.pnl) < 0).reduce((a, t) => a + Number(t.pnl), 0)) || 1;
  const map = {};
  mistakeTrades.forEach(t => {
    if (!map[t.mistake]) map[t.mistake] = { name: t.mistake, count: 0, pnl: 0, rSum: 0 };
    map[t.mistake].count += 1;
    map[t.mistake].pnl += Number(t.pnl) || 0;
    map[t.mistake].rSum += Number(t.rMultiple) || 0;
  });
  const list = Object.values(map).sort((a, b) => a.pnl - b.pnl).slice(0, 5);

  function severity(pnl, count) {
    const pctOfLoss = Math.abs(pnl) / totalLoss;
    if (pnl >= 0 || count < 2) return { label: 'LOW', color: '#6B7280' };
    if (pctOfLoss > 0.3 || count >= 8) return { label: 'CRITICAL', color: '#EF4444' };
    if (pctOfLoss > 0.15 || count >= 4) return { label: 'HIGH', color: '#F59E0B' };
    return { label: 'MODERATE', color: '#EAB308' };
  }

  return (
    <div className="space-y-2">
      {list.map((m, i) => {
        const sev = severity(m.pnl, m.count);
        return (
          <div key={m.name} className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold">#{i + 1} {m.name.toUpperCase()}</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: sev.color, backgroundColor: sev.color + '22' }}>{sev.label}</span>
            </div>
            <p className="text-[13px] text-[#9CA3AF]">{m.count} occurrence{m.count !== 1 ? 's' : ''} · Net impact: <span className="text-[#EF4444] font-medium">{fmtMoney(m.pnl)}</span> · Avg R: {(m.rSum / m.count).toFixed(2)}R</p>
          </div>
        );
      })}
    </div>
  );
}

function EdgeLeakView({ trades }) {
  const map = {};
  trades.forEach(t => {
    const key = `${t.strategy && t.strategy.trim() ? t.strategy.trim() : 'Unspecified'} · ${t.direction === 'long' ? 'Long' : 'Short'} · ${t.market || 'Unspecified'}`;
    if (!map[key]) map[key] = { key, count: 0, pnl: 0, wins: 0, rSum: 0 };
    map[key].count += 1;
    map[key].pnl += Number(t.pnl) || 0;
    map[key].wins += Number(t.pnl) > 0 ? 1 : 0;
    map[key].rSum += Number(t.rMultiple) || 0;
  });
  const list = Object.values(map).filter(g => g.count >= 2).sort((a, b) => b.pnl - a.pnl);
  const edge = list[0];
  const leak = [...list].reverse()[0];

  if (!edge) return <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5"><p className="text-sm text-[#6B7280]">Not enough repeated combinations yet — log more trades with consistent strategy names to surface your edge.</p></div>;

  const Card = ({ title, g, positive }) => {
    if (!g) return null;
    const conf = confidenceLabel(g.count);
    return (
      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5">
        <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: positive ? '#22C55E' : '#EF4444' }}>{title}</p>
        <p className="text-base font-semibold mb-3">{g.key}</p>
        <div className="grid grid-cols-3 gap-2">
          <div><p className="text-[10px] text-[#6B7280]">Trades</p><p className="text-sm font-semibold">{g.count}</p></div>
          <div><p className="text-[10px] text-[#6B7280]">Win Rate</p><p className="text-sm font-semibold">{((g.wins / g.count) * 100).toFixed(0)}%</p></div>
          <div><p className="text-[10px] text-[#6B7280]">Avg R</p><p className="text-sm font-semibold">{(g.rSum / g.count).toFixed(2)}R</p></div>
        </div>
        <p className="text-sm font-semibold mt-3" style={{ color: positive ? '#22C55E' : '#EF4444' }}>{fmtMoney(g.pnl)} net</p>
        <p className="text-[11px] mt-1" style={{ color: conf.color }}>{conf.label}</p>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <Card title="Your Edge" g={edge} positive={true} />
      {leak && leak.key !== edge.key && leak.pnl < 0 && <Card title="Your Leak" g={leak} positive={false} />}
    </div>
  );
}

const MENTOR_SYSTEM_PROMPT = `You are RTrade AI Mentor, a professional trading performance mentor.
Your purpose is to help the trader understand their own decisions, behavior, risk management, execution and statistical edge.
You are not a signal seller. You do not predict the future. You do not guarantee profits.
You do not encourage revenge trading, martingale behavior, or increasing risk to recover losses.
You challenge weak reasoning respectfully. You distinguish trade outcome from decision quality.
You use the trader's actual journal evidence provided below whenever available, and never invent statistics or claim data you weren't given.
When evidence is insufficient, say so plainly.
You act like a calm, experienced trading mentor: identify the most important issue first, explain why it matters, and give one practical next step.
Ask a smart follow-up question when it would help more than a big answer. Keep responses concise and conversational, not a wall of text.`;

const MENTOR_TOPICS = ['General', 'Psychology', 'Risk', 'Strategy'];

function buildStatsContext(trades, topic) {
  if (trades.length === 0) return 'TRADING_STATISTICS:\nNo trades logged yet.';
  const pnl = trades.reduce((a, t) => a + Number(t.pnl), 0);
  const wins = trades.filter(t => Number(t.pnl) > 0).length;
  const winRate = (wins / trades.length) * 100;
  const avgR = trades.reduce((a, t) => a + (Number(t.rMultiple) || 0), 0) / trades.length;
  let lines = [`TRADING_STATISTICS:`, `Total trades: ${trades.length}`, `Net P&L: ${fmtMoney(pnl)}`, `Win rate: ${winRate.toFixed(0)}%`, `Average R: ${avgR.toFixed(2)}R`];

  if (topic === 'Psychology') {
    const emo = {};
    trades.forEach(t => { if (!t.emotion) return; (emo[t.emotion] = emo[t.emotion] || { c: 0, p: 0 }).c++; emo[t.emotion].p += Number(t.pnl); });
    lines.push('PSYCHOLOGY:');
    Object.entries(emo).forEach(([k, v]) => lines.push(`${k}: ${v.c} trades, ${fmtMoney(v.p)} net`));
    const mistakes = trades.filter(t => t.mistake && t.mistake !== 'None');
    lines.push(`Trades with a flagged mistake: ${mistakes.length} of ${trades.length}`);
  } else if (topic === 'Risk') {
    const risks = trades.filter(t => t.risk).map(t => Number(t.risk));
    if (risks.length) lines.push(`RISK:`, `Average risk per trade: ${(risks.reduce((a, b) => a + b, 0) / risks.length).toFixed(2)}`);
    const chronological = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
    let peak = -Infinity, running = 0, maxDD = 0;
    chronological.forEach(t => { running += Number(t.pnl); peak = Math.max(peak, running); maxDD = Math.max(maxDD, peak - running); });
    lines.push(`Max drawdown: ${fmtMoney(-maxDD)}`);
  } else if (topic === 'Strategy') {
    const strat = {};
    trades.forEach(t => { const k = t.strategy || 'Unspecified'; (strat[k] = strat[k] || { c: 0, p: 0, r: 0 }).c++; strat[k].p += Number(t.pnl); strat[k].r += Number(t.rMultiple) || 0; });
    lines.push('STRATEGY_PERFORMANCE:');
    Object.entries(strat).forEach(([k, v]) => lines.push(`${k}: ${v.c} trades, ${fmtMoney(v.p)} net, avg ${(v.r / v.c).toFixed(2)}R`));
  }
  return lines.join('\n');
}

function renderFormatted(text) {
  return text.split('\n').map((line, li) => {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)/);
    const inline = (str) => str.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
        : <React.Fragment key={i}>{part}</React.Fragment>
    );
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizeCls = level === 1 ? 'text-base font-bold' : level === 2 ? 'text-[15px] font-bold' : 'text-sm font-semibold';
      return <div key={li} className={`${sizeCls} mt-2 mb-1`}>{inline(headingMatch[2])}</div>;
    }
    return (
      <React.Fragment key={li}>
        {li > 0 && <br />}
        {inline(line)}
      </React.Fragment>
    );
  });
}

function dedupeRepeatedTail(text) {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of paragraphs) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out.join('\n\n');
}

function AIMentorView({ trades, onClose }) {
  const [topic, setTopic] = useState('General');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function checkAndBumpDailyLimit() {
    const key = 'mentor_usage_' + new Date().toISOString().slice(0, 10);
    const count = Number(localStorage.getItem(key) || '0');
    if (count >= 15) return false;
    localStorage.setItem(key, String(count + 1));
    return true;
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    if (!checkAndBumpDailyLimit()) {
      setError("You've reached today's AI Mentor limit (free-tier protection). Your statistical Coach is still fully available.");
      return;
    }
    setError('');
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setSending(true);
    try {
      const statsContext = buildStatsContext(trades, topic);
      const fullSystemPrompt = `${MENTOR_SYSTEM_PROMPT}\n\nCurrent topic: ${topic}\n\n${statsContext}`;
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: fullSystemPrompt, messages: newMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMessages(prev => [...prev, { role: 'assistant', content: dedupeRepeatedTail(data.reply) }]);
    } catch (e) {
      console.error('[Mentor] send failed:', e);
      setError(e.message || 'Could not reach the AI Mentor. Try the statistical Coach instead.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button onClick={onClose} className="flex items-center gap-1 text-sm text-[#6B7280]"><ChevronLeft size={16} /> Back to Stats</button>
      <div className="rounded-2xl bg-gradient-to-br from-[#141519] to-[#0F1012] border border-white/[0.06] p-5">
        <p className="text-sm font-semibold mb-1">RTrade AI Mentor</p>
        <p className="text-[12px] text-[#6B7280]">Discuss your trading. Understand your patterns. Not a signal service — grounded in your own journal data.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {MENTOR_TOPICS.map(t => (
          <button key={t} onClick={() => setTopic(t)} className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-medium border ${topic === t ? 'bg-[#22C55E]/15 border-[#22C55E]/50 text-[#22C55E]' : 'bg-[#1A1B1F] border-white/[0.08] text-[#6B7280]'}`}>{t}</button>
        ))}
      </div>

      <div className="space-y-3">
        {messages.length === 0 && (
          <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4">
            <p className="text-sm text-[#6B7280]">Ask something specific — e.g. "Why do I keep losing on short trades?" or "Is my risk sizing consistent?" The Mentor will use your real {topic.toLowerCase()} data to answer.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`rounded-2xl p-4 max-w-[88%] ${m.role === 'user' ? 'bg-[#22C55E]/15 ml-auto' : 'bg-[#141519] border border-white/[0.06]'}`}>
            <p className="text-sm leading-relaxed">{renderFormatted(m.content)}</p>
          </div>
        ))}
        {sending && <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4 max-w-[88%]"><p className="text-sm text-[#6B7280]">Thinking...</p></div>}
      </div>

      {error && <div className="rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 px-4 py-3 text-xs text-[#EF4444]">{error}</div>}

      <div className="flex gap-2 sticky bottom-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Ask your mentor..."
          className={inputCls}
        />
        <button onClick={sendMessage} disabled={sending || !input.trim()} className="px-4 rounded-xl bg-[#22C55E] text-black text-sm font-semibold shrink-0 disabled:opacity-40">Send</button>
      </div>
    </>
  );
}

const RULE_TYPES = {
  max_trades_per_day: { label: 'Max Trades per Day', unit: 'trades', placeholder: 'e.g. 3' },
  max_risk_per_trade: { label: 'Max Risk per Trade', unit: '$', placeholder: 'e.g. 50' },
  max_daily_loss: { label: 'Max Daily Loss', unit: '$', placeholder: 'e.g. 100' },
  stop_after_losses: { label: 'Stop After Consecutive Losses', unit: 'losses', placeholder: 'e.g. 2' },
};

function checkRuleViolations(trades, rules) {
  const violations = [];
  const active = rules.filter(r => r.enabled);
  const byDate = {};
  trades.forEach(t => { if (!t.date) return; (byDate[t.date] = byDate[t.date] || []).push(t); });

  const maxTrades = active.find(r => r.ruleType === 'max_trades_per_day');
  if (maxTrades) {
    Object.entries(byDate).forEach(([date, list]) => {
      if (list.length > maxTrades.threshold) {
        list.slice(maxTrades.threshold).forEach((t, i) => violations.push({ trade: t, rule: RULE_TYPES.max_trades_per_day.label, message: `Trade #${maxTrades.threshold + i + 1} on ${date} exceeded your ${maxTrades.threshold}/day limit` }));
      }
    });
  }
  const maxRisk = active.find(r => r.ruleType === 'max_risk_per_trade');
  if (maxRisk) {
    trades.forEach(t => { if (Number(t.risk) > maxRisk.threshold) violations.push({ trade: t, rule: RULE_TYPES.max_risk_per_trade.label, message: `Risked $${Number(t.risk).toFixed(2)}, over your $${maxRisk.threshold} limit` }); });
  }
  const maxDailyLoss = active.find(r => r.ruleType === 'max_daily_loss');
  if (maxDailyLoss) {
    Object.entries(byDate).forEach(([date, list]) => {
      const dayPnl = list.reduce((a, t) => a + Number(t.pnl), 0);
      if (dayPnl < -maxDailyLoss.threshold) violations.push({ trade: list[list.length - 1], rule: RULE_TYPES.max_daily_loss.label, message: `${date} lost $${Math.abs(dayPnl).toFixed(2)}, over your $${maxDailyLoss.threshold} daily limit` });
    });
  }
  const stopAfter = active.find(r => r.ruleType === 'stop_after_losses');
  if (stopAfter) {
    const chronological = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date) || Number(a.id) - Number(b.id));
    let streak = 0;
    chronological.forEach(t => {
      if (streak >= stopAfter.threshold) violations.push({ trade: t, rule: RULE_TYPES.stop_after_losses.label, message: `Traded again after ${streak} consecutive losses (limit: ${stopAfter.threshold})` });
      streak = Number(t.pnl) < 0 ? streak + 1 : 0;
    });
  }
  return violations;
}

function RuleEngineView({ trades, onClose }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newType, setNewType] = useState('max_trades_per_day');
  const [newThreshold, setNewThreshold] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      try { setRules(await apiRulesList()); }
      catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const usedTypes = rules.map(r => r.ruleType);
  const availableTypes = Object.keys(RULE_TYPES).filter(t => !usedTypes.includes(t));

  async function handleAddRule() {
    if (!newThreshold || isNaN(Number(newThreshold))) return;
    setAdding(true);
    setError('');
    try {
      const created = await apiRuleCreate(newType, Number(newThreshold));
      setRules(prev => [...prev, created]);
      setNewThreshold('');
      const remaining = availableTypes.filter(t => t !== newType);
      if (remaining.length) setNewType(remaining[0]);
    } catch (e) { setError(e.message || 'Could not add rule.'); }
    finally { setAdding(false); }
  }

  async function toggleRule(rule) {
    try {
      const updated = await apiRuleUpdate(rule.id, { enabled: !rule.enabled });
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
    } catch (e) { setError(e.message || 'Could not update rule.'); }
  }

  async function deleteRule(rule) {
    if (!window.confirm(`Remove the "${RULE_TYPES[rule.ruleType].label}" rule?`)) return;
    try {
      await apiRuleDelete(rule.id);
      setRules(prev => prev.filter(r => r.id !== rule.id));
    } catch (e) { setError(e.message || 'Could not delete rule.'); }
  }

  const violations = trades.length > 0 && rules.some(r => r.enabled) ? checkRuleViolations(trades, rules) : [];
  const violatingTradeIds = new Set(violations.map(v => v.trade.id));
  const complianceRate = trades.length > 0 ? Math.round(((trades.length - violatingTradeIds.size) / trades.length) * 100) : null;

  return (
    <>
      <button onClick={onClose} className="flex items-center gap-1 text-sm text-[#6B7280]"><ChevronLeft size={16} /> Back to Stats</button>

      {error && <div className="rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 px-4 py-3 text-xs text-[#EF4444]">{error}</div>}

      {complianceRate !== null && (
        <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5">
          <p className="text-[11px] uppercase tracking-wide text-[#6B7280] mb-1">Rule Compliance</p>
          <p className="text-3xl font-semibold" style={{ color: complianceRate >= 80 ? '#22C55E' : complianceRate >= 60 ? '#F59E0B' : '#EF4444' }}>{complianceRate}%</p>
          <p className="text-[12px] text-[#6B7280] mt-1">{violatingTradeIds.size} of {trades.length} trades involved a rule violation</p>
        </div>
      )}

      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5 space-y-3">
        <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">Your Rules</p>
        {loading ? <p className="text-sm text-[#6B7280]">Loading...</p> : rules.length === 0 ? (
          <p className="text-sm text-[#6B7280]">No rules set yet — add one below.</p>
        ) : (
          rules.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-xl bg-[#1A1B1F] border border-white/[0.06] px-3.5 py-3">
              <div>
                <p className="text-sm font-medium">{RULE_TYPES[r.ruleType].label}</p>
                <p className="text-[12px] text-[#6B7280]">{RULE_TYPES[r.ruleType].unit === '$' ? '$' : ''}{r.threshold}{RULE_TYPES[r.ruleType].unit !== '$' ? ' ' + RULE_TYPES[r.ruleType].unit : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggleRule(r)} className={`w-10 h-6 rounded-full relative transition-colors ${r.enabled ? 'bg-[#22C55E]' : 'bg-[#3A3B40]'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${r.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <button onClick={() => deleteRule(r)}><Trash2 size={15} className="text-[#EF4444]" /></button>
              </div>
            </div>
          ))
        )}

        {availableTypes.length > 0 && (
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <select value={newType} onChange={e => setNewType(e.target.value)} className={inputCls}>
              {availableTypes.map(t => <option key={t} value={t}>{RULE_TYPES[t].label}</option>)}
            </select>
            <div className="flex gap-2">
              <input inputMode="decimal" type="number" placeholder={RULE_TYPES[newType].placeholder} value={newThreshold} onChange={e => setNewThreshold(e.target.value)} className={inputCls} />
              <button onClick={handleAddRule} disabled={!newThreshold || adding} className="px-4 rounded-xl bg-[#22C55E] text-black text-sm font-semibold shrink-0 disabled:opacity-40">Add</button>
            </div>
          </div>
        )}
      </div>

      {violations.length > 0 && (
        <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4">
          <p className="text-[11px] uppercase tracking-wide text-[#6B7280] mb-3">Violations ({violations.length})</p>
          <div className="space-y-2">
            {violations.slice(0, 20).map((v, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <AlertCircle size={14} className="text-[#EF4444] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] font-medium text-[#EF4444]">{v.rule}</p>
                  <p className="text-[12px] text-[#9CA3AF]">{v.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CoachView({ trades, onClose }) {
  const [mode, setMode] = useState('overview');
  const insights = trades.length >= 5 ? generateInsights(trades) : [];
  const modes = [
    { id: 'why', label: 'Why Am I Losing?' },
    { id: 'improving', label: 'Am I Improving?' },
    { id: 'mistakes', label: 'Top 5 Mistakes' },
    { id: 'edge', label: 'Edge vs Leak' },
  ];

  if (mode !== 'overview') {
    const activeMode = modes.find(m => m.id === mode);
    return (
      <>
        <button onClick={() => setMode('overview')} className="flex items-center gap-1 text-sm text-[#6B7280]"><ChevronLeft size={16} /> Back to Coach</button>
        <p className="text-lg font-semibold">{activeMode.label}</p>
        {mode === 'why' && <WhyLosingView trades={trades} />}
        {mode === 'improving' && <ImprovingView trades={trades} />}
        {mode === 'mistakes' && <TopMistakesView trades={trades} />}
        {mode === 'edge' && <EdgeLeakView trades={trades} />}
      </>
    );
  }

  return (
    <>
      <button onClick={onClose} className="flex items-center gap-1 text-sm text-[#6B7280]"><ChevronLeft size={16} /> Back to Stats</button>
      <div className="rounded-2xl bg-gradient-to-br from-[#141519] to-[#0F1012] border border-white/[0.06] p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-[#22C55E]/15 flex items-center justify-center"><Flame size={14} className="text-[#22C55E]" /></div>
          <p className="text-sm font-semibold">Trading Coach</p>
        </div>
        <p className="text-[12px] text-[#6B7280]">A trading intelligence engine built entirely from your own journal data — no predictions, no guesswork.</p>
      </div>

      {trades.length < 5 ? (
        <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-6 text-center">
          <p className="text-sm font-medium mb-1">Not enough data yet</p>
          <p className="text-[13px] text-[#6B7280]">Log at least 5 trades and the Coach will start finding real patterns in how you trade.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {modes.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} className="py-3.5 rounded-xl text-[13px] font-medium bg-[#141519] border border-white/[0.06] text-[#E8E9EC] text-left px-3.5">{m.label}</button>
            ))}
          </div>

          {insights.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-[#6B7280] mt-2">Quick Insights</p>
              {insights.map((ins, i) => {
                const Icon = ins.icon;
                return (
                  <div key={i} className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4 flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${ins.positive ? 'bg-[#22C55E]/15' : 'bg-[#EF4444]/15'}`}>
                      <Icon size={14} className={ins.positive ? 'text-[#22C55E]' : 'text-[#EF4444]'} />
                    </div>
                    <p className="text-sm text-[#E8E9EC] leading-relaxed">{ins.text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

function StatsView({ trades }) {
  const [showManager, setShowManager] = useState(false);
  const [showPsych, setShowPsych] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [showMentor, setShowMentor] = useState(false);
  const [showRules, setShowRules] = useState(false);
  if (showManager) return <StrategyManager trades={trades} onClose={() => setShowManager(false)} />;
  if (showPsych) return <PsychologyView trades={trades} onClose={() => setShowPsych(false)} />;
  if (showCoach) return <CoachView trades={trades} onClose={() => setShowCoach(false)} />;
  if (showMentor) return <AIMentorView trades={trades} onClose={() => setShowMentor(false)} />;
  if (showRules) return <RuleEngineView trades={trades} onClose={() => setShowRules(false)} />;
  if (trades.length === 0) {
    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setShowManager(true)} className="py-3 rounded-xl text-[13px] font-medium bg-[#141519] border border-white/[0.06] text-[#22C55E] flex flex-col items-center justify-center gap-1"><Target size={14} /> Strategies</button>
          <button onClick={() => setShowPsych(true)} className="py-3 rounded-xl text-[13px] font-medium bg-[#141519] border border-white/[0.06] text-[#22C55E] flex flex-col items-center justify-center gap-1"><Activity size={14} /> Psychology</button>
          <button onClick={() => setShowCoach(true)} className="py-3 rounded-xl text-[13px] font-medium bg-[#141519] border border-white/[0.06] text-[#22C55E] flex flex-col items-center justify-center gap-1"><Flame size={14} /> Coach</button>
          <button onClick={() => setShowMentor(true)} className="py-3 rounded-xl text-[13px] font-medium bg-[#141519] border border-white/[0.06] text-[#22C55E] flex flex-col items-center justify-center gap-1"><BookOpen size={14} /> AI Mentor</button>
          <button onClick={() => setShowRules(true)} className="py-3 rounded-xl text-[13px] font-medium bg-[#141519] border border-white/[0.06] text-[#22C55E] flex flex-col items-center justify-center gap-1 col-span-2"><ShieldCheck size={14} /> Rule Engine</button>
        </div>
        <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-6 text-center">
          <p className="text-sm font-medium mb-1">No trades yet</p>
          <p className="text-[13px] text-[#6B7280] leading-relaxed">Log some trades and this screen will break down your edge — by strategy, by market, and over time.</p>
        </div>
      </>
    );
  }

  const totalPnl = trades.reduce((a, t) => a + (Number(t.pnl) || 0), 0);
  const wins = trades.filter(t => Number(t.pnl) > 0);
  const losses = trades.filter(t => Number(t.pnl) < 0);
  const winRate = (wins.length / trades.length) * 100;
  const grossProfit = wins.reduce((a, t) => a + Number(t.pnl), 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + Number(t.pnl), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
  const expectancy = totalPnl / trades.length;

  function groupBy(keyFn) {
    const map = {};
    trades.forEach(t => {
      const k = keyFn(t) || 'Unspecified';
      if (!map[k]) map[k] = { key: k, pnl: 0, count: 0, wins: 0 };
      map[k].pnl += Number(t.pnl) || 0;
      map[k].count += 1;
      if (Number(t.pnl) > 0) map[k].wins += 1;
    });
    return Object.values(map).sort((a, b) => b.pnl - a.pnl);
  }
  const byStrategy = groupBy(t => t.strategy && t.strategy.trim());
  const byMarket = groupBy(t => t.market);

  const chronological = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0, peak = -Infinity, maxDD = 0;
  chronological.forEach(t => {
    running += Number(t.pnl) || 0;
    peak = Math.max(peak, running);
    maxDD = Math.max(maxDD, peak - running);
  });

  const monthMap = {};
  trades.forEach(t => {
    if (!t.date) return;
    const key = t.date.slice(0, 7);
    monthMap[key] = (monthMap[key] || 0) + (Number(t.pnl) || 0);
  });
  const monthKeys = Object.keys(monthMap).sort().slice(-6);
  const monthData = monthKeys.map(k => {
    const [y, m] = k.split('-');
    return { label: MONTH_NAMES[Number(m) - 1].slice(0, 3), pnl: monthMap[k] };
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setShowManager(true)} className="py-3 rounded-xl text-[13px] font-medium bg-[#141519] border border-white/[0.06] text-[#22C55E] flex flex-col items-center justify-center gap-1"><Target size={14} /> Strategies</button>
        <button onClick={() => setShowPsych(true)} className="py-3 rounded-xl text-[13px] font-medium bg-[#141519] border border-white/[0.06] text-[#22C55E] flex flex-col items-center justify-center gap-1"><Activity size={14} /> Psychology</button>
        <button onClick={() => setShowCoach(true)} className="py-3 rounded-xl text-[13px] font-medium bg-[#141519] border border-white/[0.06] text-[#22C55E] flex flex-col items-center justify-center gap-1"><Flame size={14} /> Coach</button>
        <button onClick={() => setShowMentor(true)} className="py-3 rounded-xl text-[13px] font-medium bg-[#141519] border border-white/[0.06] text-[#22C55E] flex flex-col items-center justify-center gap-1"><BookOpen size={14} /> AI Mentor</button>
        <button onClick={() => setShowRules(true)} className="py-3 rounded-xl text-[13px] font-medium bg-[#141519] border border-white/[0.06] text-[#22C55E] flex flex-col items-center justify-center gap-1 col-span-2"><ShieldCheck size={14} /> Rule Engine</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Win Rate" value={`${winRate.toFixed(0)}%`} icon={Target} />
        <StatCard label="Profit Factor" value={profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)} icon={Activity} positive={profitFactor > 1} negative={profitFactor < 1 && profitFactor !== Infinity} />
        <StatCard label="Expectancy" value={fmtMoney(expectancy) + '/trade'} positive={expectancy > 0} negative={expectancy < 0} icon={TrendingUp} />
        <StatCard label="Max Drawdown" value={'-' + fmtMoney(maxDD).replace('+', '').replace('-', '')} negative={maxDD > 0} icon={TrendingDown} />
      </div>

      {monthData.length > 0 && (
        <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-4">
          <p className="text-[11px] uppercase tracking-wide text-[#6B7280] mb-3">Monthly Performance</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData}>
                <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {monthData.map((m, i) => <Cell key={i} fill={m.pnl >= 0 ? '#22C55E' : '#EF4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <GroupTable title="By Strategy" groups={byStrategy} icon={Target} />
      <GroupTable title="By Market" groups={byMarket} icon={BarChart3} />
    </>
  );
}

const MOODS = ['Calm', 'Confident', 'Anxious', 'Excited', 'Frustrated', 'Neutral', 'Tired', 'Motivated'];

function JournalView() {
  const today = new Date().toISOString().slice(0, 10);
  const empty = { date: today, mood: 'Calm', confidence: 3, preMarketPlan: '', postMarketReview: '', lessonsLearned: '', mistakes: '', tomorrowFocus: '' };
  const [form, setForm] = useState(empty);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target ? e.target.value : e }));

  useEffect(() => {
    (async () => {
      try {
        const data = await apiJournalList();
        setEntries(data);
        const todayEntry = data.find(e => e.date === today);
        if (todayEntry) setForm(todayEntry);
      } catch (e) {
        console.error('[Journal] load failed:', e);
        setError('Could not load journal entries: ' + e.message);
      } finally { setLoading(false); }
    })();
  }, []);

  function loadEntry(entry) { setForm(entry); setSavedMsg(false); }
  function startNew() { setForm({ ...empty, date: today }); setSavedMsg(false); }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const saved = await withRetry(() => apiJournalUpsert(form));
      setEntries(prev => {
        const exists = prev.some(e => e.date === saved.date);
        const updated = exists ? prev.map(e => e.date === saved.date ? saved : e) : [saved, ...prev];
        return updated.sort((a, b) => new Date(b.date) - new Date(a.date));
      });
      setForm(saved);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 1800);
    } catch (e) {
      console.error('[Journal] save failed:', e);
      setError(e.message || 'Could not save journal entry.');
    } finally { setSaving(false); }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">{form.date === today && !entries.some(e => e.date === form.date && e.date !== today) ? "Today's Entry" : `Editing ${form.date}`}</p>
        {form.date !== today && <button onClick={startNew} className="text-xs font-medium text-[#22C55E]">+ New entry for today</button>}
      </div>

      {error && <div className="rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 px-4 py-3 text-xs text-[#EF4444]">{error}</div>}

      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5 space-y-4">
        <Field label="Date"><input type="date" value={form.date} onChange={set('date')} className={inputCls} /></Field>
        <Field label="Mood"><select value={form.mood} onChange={set('mood')} className={inputCls}>{MOODS.map(m => <option key={m} value={m}>{m}</option>)}</select></Field>
        <Field label="Confidence"><div className="flex gap-2">{[1, 2, 3, 4, 5].map(n => (<button key={n} onClick={() => setForm(f => ({ ...f, confidence: n }))} className="p-1"><Star size={22} className={n <= (form.confidence || 0) ? 'fill-[#22C55E] text-[#22C55E]' : 'text-[#3A3B40]'} /></button>))}</div></Field>
      </div>

      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5 space-y-4">
        <Field label="Pre-Market Plan"><textarea rows={3} placeholder="What's your plan for today?" value={form.preMarketPlan || ''} onChange={set('preMarketPlan')} className={inputCls} /></Field>
        <Field label="Post-Market Review"><textarea rows={3} placeholder="How did the day actually go?" value={form.postMarketReview || ''} onChange={set('postMarketReview')} className={inputCls} /></Field>
      </div>

      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-5 space-y-4">
        <Field label="Lessons Learned"><textarea rows={2} value={form.lessonsLearned || ''} onChange={set('lessonsLearned')} className={inputCls} /></Field>
        <Field label="Mistakes"><textarea rows={2} value={form.mistakes || ''} onChange={set('mistakes')} className={inputCls} /></Field>
        <Field label="Tomorrow's Focus"><textarea rows={2} value={form.tomorrowFocus || ''} onChange={set('tomorrowFocus')} className={inputCls} /></Field>
      </div>

      <button onClick={handleSave} disabled={saving} className="w-full py-3.5 rounded-xl text-sm font-semibold bg-[#22C55E] text-black flex items-center justify-center gap-2">
        {savedMsg ? <><Check size={16} /> Saved</> : saving ? 'Saving...' : 'Save Entry'}
      </button>

      {!loading && entries.length > 0 && (
        <div className="pt-2">
          <p className="text-[11px] uppercase tracking-wide text-[#6B7280] mb-2">Past Entries</p>
          <div className="space-y-2">
            {entries.map(e => (
              <button key={e.id} onClick={() => loadEntry(e)} className="w-full text-left rounded-xl bg-[#141519] border border-white/[0.06] px-4 py-3 flex items-center justify-between active:bg-[#1A1B1F]">
                <div><p className="text-sm font-medium">{e.date}</p><p className="text-[11px] text-[#6B7280]">{e.mood} · Confidence {e.confidence}/5</p></div>
                <ChevronLeft size={16} className="rotate-180 text-[#6B7280]" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function TradesTab({ trades, onAdd, onUpdate, onDelete, dbError }) {
  const [subview, setSubview] = useState('add');
  const [editingTrade, setEditingTrade] = useState(null);

  if (editingTrade) {
    return (
      <>
        <div className="flex items-center justify-between mb-1">
          <button onClick={() => setEditingTrade(null)} className="flex items-center gap-1 text-sm text-[#6B7280]"><ChevronLeft size={16} /> Back</button>
          <button onClick={async () => { if (window.confirm('Delete this trade permanently?')) { await onDelete(editingTrade.id); setEditingTrade(null); } }} className="flex items-center gap-1 text-sm text-[#EF4444]"><Trash2 size={14} /> Delete</button>
        </div>
        <TradeForm initial={editingTrade} saveLabel="Update Trade" onSave={async (full) => onUpdate({ ...full, id: editingTrade.id }).then(() => { setEditingTrade(null); return true; })} />
      </>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-1">
        <button onClick={() => setSubview('add')} className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${subview === 'add' ? 'bg-[#22C55E]/15 border-[#22C55E]/50 text-[#22C55E]' : 'bg-[#1A1B1F] border-white/[0.08] text-[#6B7280]'}`}>Add Trade</button>
        <button onClick={() => setSubview('list')} className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${subview === 'list' ? 'bg-[#22C55E]/15 border-[#22C55E]/50 text-[#22C55E]' : 'bg-[#1A1B1F] border-white/[0.08] text-[#6B7280]'}`}>All Trades ({trades.length})</button>
      </div>
      {dbError && <div className="rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 px-4 py-3 text-xs text-[#EF4444] flex items-start gap-2"><AlertCircle size={14} className="shrink-0 mt-0.5" />{dbError}</div>}
      {subview === 'add' ? <TradeForm initial={{}} saveLabel="Save Trade" onSave={onAdd} /> : <LedgerView trades={trades} onEdit={setEditingTrade} />}
    </>
  );
}

export default function App() {
  const [active, setActive] = useState('dashboard');
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [connStatus, setConnStatus] = useState('connecting'); // connecting | connected | error

  useEffect(() => {
    (async () => {
      try {
        console.log('[DB] Connecting to Supabase and loading trades...');
        const data = await withRetry(() => apiGet());
        setTrades(data);
        setConnStatus('connected');
        console.log('[DB] Loaded', data.length, 'trades from Supabase');
      } catch (e) {
        console.error('[DB] Initial load failed:', e);
        setConnStatus('error');
        setDbError('Could not connect to the database: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAdd(full) {
    try {
      const saved = await withRetry(() => apiInsert(full));
      setTrades(prev => [saved, ...prev]);
      setDbError('');
      return true;
    } catch (e) {
      console.error('[DB] Insert failed:', e);
      throw e;
    }
  }
  async function handleUpdate(full) {
    try {
      const saved = await withRetry(() => apiUpdate(full.id, full));
      setTrades(prev => prev.map(t => t.id === saved.id ? saved : t));
      setDbError('');
      return true;
    } catch (e) {
      console.error('[DB] Update failed:', e);
      throw e;
    }
  }
  async function handleDelete(id) {
    try {
      await withRetry(() => apiDelete(id));
      setTrades(prev => prev.filter(t => t.id !== id));
      setDbError('');
    } catch (e) {
      console.error('[DB] Delete failed:', e);
      setDbError('Could not delete trade: ' + e.message);
    }
  }

  const titles = {
    dashboard: ['Dashboard', 'Your Trading Overview'],
    trades: ['Trades', 'Log & Manage Trades'],
    calendar: ['Calendar', 'Your Trading Calendar'],
    stats: ['Statistics', 'Your Trading Edge'],
    journal: ['Journal', 'Daily Reflection'],
  };
  const [eyebrow, title] = titles[active];

  return (
    <div className="min-h-screen w-full bg-[#0A0B0D] text-[#E8E9EC] font-sans flex flex-col overflow-x-hidden">
      <header className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#6B7280] flex items-center gap-1.5">
            {eyebrow}
            <span className={`w-1.5 h-1.5 rounded-full ${connStatus === 'connected' ? 'bg-[#22C55E]' : connStatus === 'error' ? 'bg-[#EF4444]' : 'bg-[#F59E0B]'}`} />
          </p>
          <h1 className="text-xl font-semibold tracking-tight mt-0.5">{title}</h1>
        </div>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1B4332] to-[#0A0B0D] border border-[#22C55E]/30 flex items-center justify-center">
          <Flame size={16} className="text-[#22C55E]" />
        </div>
      </header>
      <main className="flex-1 px-5 pb-28 space-y-4 overflow-y-auto">
        {active === 'dashboard' && <DashboardView trades={trades} loading={loading} />}
        {active === 'trades' && <TradesTab trades={trades} onAdd={handleAdd} onUpdate={handleUpdate} onDelete={handleDelete} dbError={dbError} />}
        {active === 'calendar' && <CalendarView trades={trades} />}
        {active === 'stats' && <StatsView trades={trades} />}
        {active === 'journal' && <JournalView />}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0A0B0D]/95 backdrop-blur-xl border-t border-white/[0.06] px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-between max-w-md mx-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button key={id} onClick={() => setActive(id)} className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors">
                <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} className={isActive ? 'text-[#22C55E]' : 'text-[#6B7280]'} />
                <span className={`text-[10px] font-medium ${isActive ? 'text-[#22C55E]' : 'text-[#6B7280]'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
