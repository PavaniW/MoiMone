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

// Shape the raw API rows into what the Dashboard components expect.
// windowTxns spans the last 6 months; the selected month is derived from it.
function build(categories, cards, windowTxns, recentTxns, budgetRows, period) {
  const colorOf = Object.fromEntries(categories.map((c) => [c.name, c.color]));
  const cardsById = Object.fromEntries(cards.map((c) => [c.id, c]));
  const monthTxns = windowTxns.filter((t) => inMonth(t, period.month, period.year));

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

  const budgets = budgetRows.map((b) => ({
    ...b,
    monthly_limit: Number(b.monthly_limit),
    spent: Number(b.spent),
    color: colorOf[b.category] || FALLBACK_COLOR,
  }));
  const totalBudget = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const overCount = budgets.filter((b) => b.spent > b.monthly_limit).length;

  // 6-month expense trend, oldest → selected month.
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const p = addMonths(period.month, period.year, -i);
    const amount = windowTxns
      .filter((t) => t.type === 'expense' && inMonth(t, p.month, p.year))
      .reduce((s, t) => s + Number(t.amount), 0);
    trend.push({ key: monthKey(p.month, p.year), label: monthShort(p.month, p.year), amount, current: i === 0 });
  }

  const recent = recentTxns.map((t) => ({
    ...t,
    amount: Number(t.amount),
    color: colorOf[t.category] || FALLBACK_COLOR,
  }));

  return {
    accounts: cards,
    summary: { spent, income, saved, available: income - spent - saved },
    spendByCategory,
    budgets,
    totalBudget,
    overCount,
    trend,
    recent,
    byCard,
  };
}

// Page 1 — Dashboard, styled as a personal statement. Live data via the backend API.
export default function Dashboard() {
  const [state, setState] = useState({ status: 'loading' });
  const [period, setPeriod] = useState(CURRENT);
  const { currentSpaceId, refreshTick } = useSpace();
  const loadedSpace = useRef(null);

  const atCurrent = period.month === CURRENT.month && period.year === CURRENT.year;
  const goPrev = () => setPeriod((p) => addMonths(p.month, p.year, -1));
  const goNext = () => setPeriod((p) => (atCurrent ? p : addMonths(p.month, p.year, 1)));

  useEffect(() => {
    if (!currentSpaceId) return; // wait until the active space is known
    let active = true;
    // Loader only on a space switch; month nav / focus refreshes stay silent.
    if (loadedSpace.current !== currentSpaceId) setState({ status: 'loading' });
    loadedSpace.current = currentSpaceId;
    (async () => {
      try {
        const sp = `&space=${currentSpaceId}`;
        const start = addMonths(period.month, period.year, -5);
        const end = addMonths(period.month, period.year, 1); // exclusive
        const from = `${monthKey(start.month, start.year)}-01`;
        const to = `${monthKey(end.month, end.year)}-01`;
        const budgetParams = `?month=${period.month}&year=${period.year}${sp}`;
        const [categories, cards, windowTxns, recentTxns, budgetRows] = await Promise.all([
          api.getCategories(),
          api.getCards(),
          api.getTransactions(`?from=${from}&to=${to}${sp}`),
          api.getTransactions(`?limit=5${sp}`),
          api.getBudgets(budgetParams),
        ]);
        if (active)
          setState({ status: 'ready', data: build(categories, cards, windowTxns, recentTxns, budgetRows, period) });
      } catch (err) {
        if (active) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      active = false;
    };
  }, [currentSpaceId, refreshTick, period.month, period.year]);

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

  const { accounts, summary, spendByCategory, budgets, totalBudget, overCount, trend, recent, byCard } = state.data;
  const cardMax = byCard.reduce((m, c) => Math.max(m, c.amount), 0);
  const trendMax = trend.reduce((m, t) => Math.max(m, t.amount), 0);
  const budgetPct = totalBudget ? Math.min(100, (summary.spent / totalBudget) * 100) : 0;

  return (
    <section>
      {/* Masthead with month switcher */}
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Personal Statement</div>
          <h2 className="stmt-title">{atCurrent ? 'This Month' : monthLabel(period.month, period.year)}</h2>
        </div>
        <div className="month-nav">
          <button className="month-nav-btn" onClick={goPrev} aria-label="Previous month">‹</button>
          <span className="month-nav-label num">{monthLabel(period.month, period.year)}</span>
          <button className="month-nav-btn" onClick={goNext} disabled={atCurrent} aria-label="Next month">›</button>
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

      {/* Total monthly budget */}
      {totalBudget > 0 && (
        <div className="panel total-budget">
          <div className="panel-head">
            <h3 className="panel-title">Monthly Budget</h3>
            <span className="panel-note num">
              {CURRENCY} {formatAmount(summary.spent)} of {CURRENCY} {formatAmount(totalBudget)}
            </span>
          </div>
          <div className="tb-track">
            <div className={`tb-fill ${summary.spent > totalBudget ? 'over' : ''}`} style={{ width: `${budgetPct}%` }} />
          </div>
          {overCount > 0 && (
            <p className="tb-nudge">⚠ {overCount} {overCount === 1 ? 'category is' : 'categories are'} over budget</p>
          )}
        </div>
      )}

      {/* 6-month spending trend */}
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

      {/* Chart + budgets */}
      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Where It Went</h3>
            <span className="panel-note">by category</span>
          </div>
          {spendByCategory.length ? (
            <SpendingChart data={spendByCategory} />
          ) : (
            <p className="panel-empty">No spending recorded this month yet.</p>
          )}
        </div>

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
      </div>

      {/* Spending by card */}
      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-head">
          <h3 className="panel-title">By Card</h3>
          <span className="panel-note">credit vs debit</span>
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
          <p className="panel-empty">No card spending recorded this month yet.</p>
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
