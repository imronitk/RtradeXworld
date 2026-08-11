import React, { useState, useEffect } from 'react';
import { LayoutDashboard, NotebookPen, CalendarDays, BarChart3, BookOpen, TrendingUp, TrendingDown, Flame, Target, Activity, Check, Star, Search, ChevronLeft, Trash2, AlertCircle } from 'lucide-react';
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
  };
}
function fromDb(row) {
  return {
    id: row.id, date: row.date, market: row.market, symbol: row.symbol, direction: row.direction,
    entry: row.entry_price, exit: row.exit_price, stopLoss: row.stop_loss, positionSize: row.quantity,
    risk: row.risk_amount, pnl: row.pnl, rMultiple: row.rr, strategy: row.strategy, setup: row.setup_type,
    emotion: row.emotion, mistake: row.mistake_tags, confidence: row.confidence, notes: row.notes,
  };
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
  const base = { date: today, market: 'Forex', symbol: '', direction: 'long', entry: '', exit: '', stopLoss: '', positionSize: '', strategy: '', setup: '', emotion: 'Calm', mistake: 'None', confidence: 3, notes: '' };
  const [form, setForm] = useState({ ...base, ...initial });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [localError, setLocalError] = useState('');
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target ? e.target.value : e }));

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
        <Field label="Screenshot"><div className="w-full bg-[#1A1B1F] border border-dashed border-white/[0.1] rounded-xl px-3.5 py-4 text-center"><p className="text-xs text-[#4B5563]">Coming in a later step</p></div></Field>
      </div>
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
              <div><p className="text-sm font-medium">{t.symbol} <span className="text-[#6B7280] font-normal">· {t.direction === 'long' ? 'Long' : 'Short'} · {t.market}</span></p><p className="text-[11px] text-[#6B7280]">{t.date}</p></div>
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

function StatsView({ trades }) {
  if (trades.length === 0) {
    return (
      <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-6 text-center">
        <p className="text-sm font-medium mb-1">No trades yet</p>
        <p className="text-[13px] text-[#6B7280] leading-relaxed">Log some trades and this screen will break down your edge — by strategy, by market, and over time.</p>
      </div>
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
    journal: ['Journal', 'Coming soon'],
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
        {active === 'journal' && (
          <div className="rounded-2xl bg-[#141519] border border-white/[0.06] p-6 text-center"><p className="text-sm text-[#6B7280]">This screen is built in a later step.</p></div>
        )}
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
