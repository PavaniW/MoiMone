import { useEffect, useRef, useState } from 'react';
import Loading from '../components/Loading.jsx';
import SpendingChart from '../components/SpendingChart.jsx';
import BudgetBar from '../components/BudgetBar.jsx';
import TransactionItem from '../components/TransactionItem.jsx';
import { formatAmount, formatCard, cardKey, CURRENCY } from '../lib/format.js';
import { api } from '../lib/api.js';
import { useSpace } from '../space.jsx';

const FALLBACK_COLOR = '#9A9384';

const nowD = new Date();
const CURRENT = { month: nowD.getMonth() + 1, year: nowD.getFullYear() };

const pad2 = (n) => String(n).padStart(2, '0');
const monthKey = (m, y) => `${y}-${pad2(m)}`;
const monthLabel = (m, y) =>
  new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const monthShort = (m, y) => new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
const addMonths = (m, y, d) => {
  const dt = new Date(y, m - 1 + d, 1);
  return { month: dt.getMonth() + 1, year: dt.getFullYear() };
};
const isFuture = (m, y) => y > CURRENT.year || (y === CURRENT.year && m > CURRENT.month);
const inMonth = (t, m, y) => (t.transaction_date || '').slice(0, 7) === monthKey(m, y);

// --- Date-range helpers (range mode) ---
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const TODAY_ISO = iso(nowD);
// End dates are inclusive in the UI; the API's `to` is exclusive, so bump a day.
const nextDayISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return iso(new Date(y, m - 1, d + 1));
};
const rangeLabel = (from, to) => {
  const f = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  return `${f(from)} – ${f(to)}`;
};
// Quick presets — each returns an inclusive { from, to } ending today.
const PRESETS = [
  { key: 'mtd', label: 'This month' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'ytd', label: 'This year' },
];
function presetRange(key) {
  const now = new Date();
  const to = iso(now);
  if (key === 'mtd') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (key === 'ytd') return { from: iso(new Date(now.getFullYear(), 0, 1)), to };
  const days = key === '90' ? 89 : 29;
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from: iso(from), to };
}

// Shape the raw API rows into what the Dashboard components expect.
// In month mode windowTxns spans the last 6 months and we derive the selected
// month from it; in range mode the API already scoped windowTxns to the range,
// so we aggregate all of them (and skip the month-only trend + budgets).
function build(categories, cards, windowTxns, recentTxns, budgetRows, selection) {
  const rangeMode = selection.mode === 'range';
  const colorOf = Object.fromEntries(categories.map((c) => [c.name, c.color]));
  const cardsById = Object.fromEntries(cards.map((c) => [c.id, c]));
  const monthTxns = rangeMode
    ? windowTxns
    : windowTxns.filter((t) => inMonth(t, selection.month, selection.year));

  let spent = 0;
  let income = 0;
  let saved = 0;
  const byCategory = {};
  const byCardMap = {};
  for (const t of monthTxns) {
    const amount = Number(t.amount);
    if (t.type === 'income') {
      income += amount;
    } else if (t.type === 'transfer' && t.goal_id) {
      saved += amount;
    } else if (t.type === 'expense') {
      spent += amount;
      byCategory[t.category] = (byCategory[t.category] || 0) + amount;

      const linkedCard = t.card || (t.card_id && cardsById[t.card_id]);
      let key;
      let label;
      if (linkedCard) {
        key = t.card_id;
        label = linkedCard.last4 ? `${linkedCard.nickname} ••${linkedCard.last4}` : linkedCard.nickname;
      } else if (t.payment_method) {
        key = cardKey(t.payment_method, t.card_last4);
        label = formatCard(t.payment_method, t.card_last4);
      } else {
        key = 'unspecified';
        label = 'Unspecified';
      }
      if (!byCardMap[key]) byCardMap[key] = { key, label, amount: 0 };
      byCardMap[key].amount += amount;
    }
  }

  const byCard = Object.values(byCardMap).sort((a, b) => b.amount - a.amount);
  const spendByCategory = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount, color: colorOf[category] || FALLBACK_COLOR }))
    .sort((a, b) => b.amount - a.amount);

  // Budgets and the 6-month trend are inherently per-calendar-month, so they
  // only apply in month mode; range mode hides both panels.
  const budgets = rangeMode
    ? []
    : budgetRows.map((b) => ({
        ...b,
        monthly_limit: Number(b.monthly_limit),
        spent: Number(b.spent),
        color: colorOf[b.category] || FALLBACK_COLOR,
      }));

  let trend = null;
  if (!rangeMode) {
    // 6-month expense trend, oldest → selected month.
    trend = [];
    for (let i = 5; i >= 0; i--) {
      const p = addMonths(selection.month, selection.year, -i);
      const amount = windowTxns
        .filter((t) => t.type === 'expense' && inMonth(t, p.month, p.year))
        .reduce((s, t) => s + Number(t.amount), 0);
      trend.push({ key: monthKey(p.month, p.year), label: monthShort(p.month, p.year), amount, current: i === 0 });
    }
  }

  const recent = recentTxns.map((t) => ({
    ...t,
    amount: Number(t.amount),
    color: colorOf[t.category] || FALLBACK_COLOR,
  }));

  // "Available" = what you can actually spend right now: the balance of your
  // everyday spending accounts (debit + cash). Bank/savings and credit are
  // excluded. This is a live balance, not a monthly flow, so it doesn't change
  // as you browse past months.
  const available = cards
    .filter((c) => c.type === 'debit' || c.type === 'cash')
    .reduce((s, c) => s + Number(c.balance || 0), 0);

  return {
    mode: selection.mode,
    accounts: cards,
    summary: { spent, income, saved, available },
    spendByCategory,
    budgets,
    trend,
    recent,
    byCard,
  };
}

// Page 1 — Dashboard, styled as a personal statement. Live data via the backend API.
export default function Dashboard() {
  const [state, setState] = useState({ status: 'loading' });
  const [mode, setMode] = useState('month'); // 'month' (default) | 'range'
  const [period, setPeriod] = useState(CURRENT);
  const [range, setRange] = useState(() => presetRange('30'));
  const { currentSpaceId, refreshTick } = useSpace();
  const loadedSpace = useRef(null);

  const atCurrent = period.month === CURRENT.month && period.year === CURRENT.year;
  const goPrev = () => setPeriod((p) => addMonths(p.month, p.year, -1));
  const goNext = () => setPeriod((p) => (atCurrent ? p : addMonths(p.month, p.year, 1)));
  const validRange = range.from && range.to && range.from <= range.to;

  useEffect(() => {
    if (!currentSpaceId) return; // wait until the active space is known
    if (mode === 'range' && !validRange) return; // don't fetch an inverted range
    let active = true;
    // Loader only on a space switch; period changes / focus refreshes stay silent.
    if (loadedSpace.current !== currentSpaceId) setState({ status: 'loading' });
    loadedSpace.current = currentSpaceId;
    (async () => {
      try {
        let from;
        let to;
        if (mode === 'range') {
          from = range.from;
          to = nextDayISO(range.to); // API `to` is exclusive
        } else {
          const start = addMonths(period.month, period.year, -5);
          const end = addMonths(period.month, period.year, 1); // exclusive
          from = `${monthKey(start.month, start.year)}-01`;
          to = `${monthKey(end.month, end.year)}-01`;
        }
        // month/year still sent for the budgets query (ignored in range mode).
        const params = `?space=${currentSpaceId}&from=${from}&to=${to}&month=${period.month}&year=${period.year}`;
        const d = await api.getDashboard(params);
        const selection = mode === 'range' ? { mode: 'range', ...range } : { mode: 'month', ...period };
        if (active)
          setState({ status: 'ready', data: build(d.categories, d.cards, d.transactions, d.recent, d.budgets, selection) });
      } catch (err) {
        if (active) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      active = false;
    };
  }, [currentSpaceId, refreshTick, mode, period.month, period.year, range.from, range.to, validRange]);

  if (state.status === 'loading') {
    return <Loading label="Loading your statement…" />;
  }
  if (state.status === 'error') {
    return (
      <div className="dash-state">
        <p className="dash-state-title">Couldn’t load your data</p>
        <p className="dash-state-detail">{state.message}</p>
        <p className="dash-state-hint">
          Check that the backend is running and Supabase is configured in <code>backend/.env</code>.
        </p>
      </div>
    );
  }

  const { accounts, summary, spendByCategory, budgets, trend, recent, byCard } = state.data;
  const rangeMode = state.data.mode === 'range';
  const cardMax = byCard.reduce((m, c) => Math.max(m, c.amount), 0);
  const trendMax = trend ? trend.reduce((m, t) => Math.max(m, t.amount), 0) : 0;
  const periodNote = rangeMode ? 'selected range' : 'this month';
  const title = rangeMode
    ? rangeLabel(range.from, range.to)
    : atCurrent
      ? 'This Month'
      : monthLabel(period.month, period.year);

  return (
    <section>
      {/* Masthead with month / range switcher */}
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Personal Statement</div>
          <h2 className="stmt-title">{title}</h2>
        </div>
        <div className="dash-controls">
          <div className="mode-toggle" role="tablist" aria-label="Dashboard period mode">
            <button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')} role="tab" aria-selected={mode === 'month'}>Month</button>
            <button className={mode === 'range' ? 'active' : ''} onClick={() => setMode('range')} role="tab" aria-selected={mode === 'range'}>Range</button>
          </div>
          {mode === 'month' ? (
            <div className="month-nav">
              <button className="month-nav-btn" onClick={goPrev} aria-label="Previous month">‹</button>
              <span className="month-nav-label num">{monthLabel(period.month, period.year)}</span>
              <button className="month-nav-btn" onClick={goNext} disabled={atCurrent} aria-label="Next month">›</button>
            </div>
          ) : (
            <div className="range-controls">
              <div className="range-presets">
                {PRESETS.map((p) => {
                  const r = presetRange(p.key);
                  const on = range.from === r.from && range.to === r.to;
                  return (
                    <button key={p.key} className={`range-preset ${on ? 'active' : ''}`} onClick={() => setRange(r)}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="range-inputs num">
                <input type="date" value={range.from} max={range.to || TODAY_ISO} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} aria-label="From date" />
                <span className="range-sep">→</span>
                <input type="date" value={range.to} min={range.from} max={TODAY_ISO} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} aria-label="To date" />
              </div>
              {!validRange && <span className="range-warn">“From” must be on or before “To”.</span>}
            </div>
          )}
        </div>
      </header>

      {/* Summary band — the hero */}
      <div className="stmt-summary four">
        <div className="summary-cell">
          <div className="summary-label">Income</div>
          <div className="summary-value num"><span className="sym">{CURRENCY}</span>{formatAmount(summary.income)}</div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">Spent</div>
          <div className="summary-value num"><span className="sym">{CURRENCY}</span>{formatAmount(summary.spent)}</div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">Saved</div>
          <div className="summary-value num"><span className="sym">{CURRENCY}</span>{formatAmount(summary.saved)}</div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">Available</div>
          <div className={`summary-value num ${summary.available >= 0 ? 'pos' : 'neg'}`}>
            <span className="sym">{summary.available >= 0 ? CURRENCY : `− ${CURRENCY}`}</span>{formatAmount(Math.abs(summary.available))}
          </div>
          <div className="summary-sub">Debit + Cash balance</div>
        </div>
      </div>

      {/* Accounts + balances */}
      {accounts.length > 0 && (
        <div className="panel" style={{ marginTop: '1.25rem' }}>
          <div className="panel-head">
            <h3 className="panel-title">Accounts</h3>
            <span className="panel-note">balances</span>
          </div>
          <div className="acct-list">
            {accounts.map((a) => (
              <div className="acct-row" key={a.id}>
                <span className="acct-name">
                  <span className="cat-dot" style={{ background: a.color || '#9A9384' }} />
                  {a.nickname}
                  {a.last4 ? <span className="card-tag"> ••{a.last4}</span> : ''}
                </span>
                <span className={`acct-bal num ${Number(a.balance) < 0 ? 'neg' : ''}`}>
                  <span className="sym">{CURRENCY}</span>
                  {formatAmount(Number(a.balance))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6-month spending trend — month mode only (a fixed 6-month grid) */}
      {!rangeMode && (
      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-head">
          <h3 className="panel-title">Spending Trend</h3>
          <span className="panel-note">last 6 months</span>
        </div>
        {trendMax > 0 ? (
          <div className="trend">
            {trend.map((t) => (
              <div className="trend-col" key={t.key}>
                <span className="trend-amt num">{formatAmount(t.amount)}</span>
                <div className="trend-bar-wrap">
                  <div
                    className={`trend-bar ${t.current ? 'current' : ''}`}
                    style={{ height: `${trendMax ? (t.amount / trendMax) * 100 : 0}%` }}
                  />
                </div>
                <span className="trend-label">{t.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel-empty">No spending in the last 6 months yet.</p>
        )}
      </div>
      )}

      {/* Chart + budgets (budgets are month-only, so the grid goes single-column in range mode) */}
      <div className={`dash-grid ${rangeMode ? 'solo' : ''}`}>
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Where It Went</h3>
            <span className="panel-note">by category</span>
          </div>
          {spendByCategory.length ? (
            <SpendingChart data={spendByCategory} />
          ) : (
            <p className="panel-empty">No spending recorded for the {periodNote} yet.</p>
          )}
        </div>

        {!rangeMode && (
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Budgets</h3>
            <span className="panel-note">{monthLabel(period.month, period.year)}</span>
          </div>
          {budgets.length ? (
            <div className="budget-list">
              {budgets.map((b) => (
                <BudgetBar key={b.category} {...b} />
              ))}
            </div>
          ) : (
            <p className="panel-empty">No budgets set for this month.</p>
          )}
        </div>
        )}
      </div>

      {/* Spending by account */}
      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-head">
          <h3 className="panel-title">Spent by Account</h3>
          <span className="panel-note">{periodNote}</span>
        </div>
        {byCard.length ? (
          <div className="card-list">
            {byCard.map((c) => (
              <div className="card-row" key={c.key}>
                <span className="card-row-label">{c.label}</span>
                <div className="card-row-track">
                  <div className="card-row-fill" style={{ width: `${cardMax ? (c.amount / cardMax) * 100 : 0}%` }} />
                </div>
                <span className="card-row-amount num"><span className="sym">{CURRENCY}</span>{formatAmount(c.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel-empty">No account spending recorded for the {periodNote} yet.</p>
        )}
      </div>

      {/* Recent transactions ledger */}
      <div className="ledger">
        <div className="panel-head">
          <h3 className="panel-title">Recent Entries</h3>
          <span className="panel-note">last 5</span>
        </div>
        {recent.length ? (
          <div className="ledger-table">
            <div className="ledger-row head">
              <span>Date</span>
              <span>Merchant</span>
              <span className="hide-sm">Category</span>
              <span className="hide-sm">Source</span>
              <span style={{ textAlign: 'right' }}>Amount</span>
            </div>
            {recent.map((t) => (
              <TransactionItem key={t.id} transaction={t} />
            ))}
          </div>
        ) : (
          <p className="panel-empty">No transactions yet.</p>
        )}
      </div>
    </section>
  );
}
