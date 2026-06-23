import { useEffect, useState } from 'react';
import SpendingChart from '../components/SpendingChart.jsx';
import BudgetBar from '../components/BudgetBar.jsx';
import TransactionItem from '../components/TransactionItem.jsx';
import { formatAmount, formatCard, cardKey, CURRENCY } from '../lib/format.js';
import { api } from '../lib/api.js';

const now = new Date();
const PERIOD = {
  month: now.getMonth() + 1,
  year: now.getFullYear(),
  label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
};

const FALLBACK_COLOR = '#9A9384';

// Shape the raw API rows into what the Dashboard components expect.
// Postgres numerics arrive as strings via supabase-js, so coerce with Number().
function build(categories, monthTxns, recentTxns, budgetRows) {
  const colorOf = Object.fromEntries(categories.map((c) => [c.name, c.color]));

  let spent = 0;
  let income = 0;
  const byCategory = {};
  const byCardMap = {};
  for (const t of monthTxns) {
    const amount = Number(t.amount);
    if (t.type === 'income') {
      income += amount;
    } else {
      spent += amount;
      byCategory[t.category] = (byCategory[t.category] || 0) + amount;

      const key = cardKey(t.payment_method, t.card_last4);
      const label = t.payment_method ? formatCard(t.payment_method, t.card_last4) : 'Unspecified';
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

  const recent = recentTxns.map((t) => ({
    ...t,
    amount: Number(t.amount),
    color: colorOf[t.category] || FALLBACK_COLOR,
  }));

  return { summary: { spent, income, net: income - spent }, spendByCategory, budgets, recent, byCard };
}

// Page 1 — Dashboard, styled as a personal statement. Live data via the backend API.
export default function Dashboard() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const period = `?month=${PERIOD.month}&year=${PERIOD.year}`;
        const [categories, monthTxns, recentTxns, budgetRows] = await Promise.all([
          api.getCategories(),
          api.getTransactions(period),
          api.getTransactions('?limit=5'),
          api.getBudgets(period),
        ]);
        if (active) setState({ status: 'ready', data: build(categories, monthTxns, recentTxns, budgetRows) });
      } catch (err) {
        if (active) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'loading') {
    return <div className="dash-state">Loading your statement…</div>;
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

  const { summary, spendByCategory, budgets, recent, byCard } = state.data;
  const cardMax = byCard.reduce((m, c) => Math.max(m, c.amount), 0);

  return (
    <section>
      {/* Masthead */}
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Personal Statement</div>
          <h2 className="stmt-title">This Month</h2>
        </div>
        <span className="stmt-period num">{PERIOD.label}</span>
      </header>

      {/* Summary band — the hero */}
      <div className="stmt-summary">
        <div className="summary-cell">
          <div className="summary-label">Spent</div>
          <div className="summary-value num">
            <span className="sym">{CURRENCY}</span>
            {formatAmount(summary.spent)}
          </div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">Income</div>
          <div className="summary-value num">
            <span className="sym">{CURRENCY}</span>
            {formatAmount(summary.income)}
          </div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">Net</div>
          <div className={`summary-value num ${summary.net >= 0 ? 'pos' : 'neg'}`}>
            <span className="sym">{summary.net >= 0 ? `+ ${CURRENCY}` : `− ${CURRENCY}`}</span>
            {formatAmount(summary.net)}
          </div>
        </div>
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
            <span className="panel-note">{PERIOD.label}</span>
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
                  <div
                    className="card-row-fill"
                    style={{ width: `${cardMax ? (c.amount / cardMax) * 100 : 0}%` }}
                  />
                </div>
                <span className="card-row-amount num">
                  <span className="sym">{CURRENCY}</span>
                  {formatAmount(c.amount)}
                </span>
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
