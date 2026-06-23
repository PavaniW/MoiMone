import { useState } from 'react';
import { formatAmount, CURRENCY } from '../lib/format.js';

const DEFAULT_COLOR = '#2f6b4f';

// Days between now and a yyyy-mm-dd deadline; null when no deadline.
function daysLeft(deadline) {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

// Card for one saving goal: progress bar, % saved, days remaining, add-funds & delete.
export default function GoalCard({ goal, onAddFunds, onDelete }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const reached = current >= target;
  const color = goal.color || DEFAULT_COLOR;
  const days = daysLeft(goal.deadline);

  async function add(e) {
    e.preventDefault();
    const value = Number(amount);
    if (!value) return;
    setBusy(true);
    try {
      await onAddFunds(goal.id, value);
      setAmount('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="goal-card">
      <div className="goal-head">
        <span className="goal-name">
          <span className="cat-dot" style={{ background: color }} />
          {goal.name}
        </span>
        <button className="row-del" title="Delete goal" onClick={() => onDelete(goal.id)}>
          ✕
        </button>
      </div>

      <div className="goal-figures num">
        <span className="goal-current">
          {CURRENCY} {formatAmount(current)}
        </span>
        <span className="goal-target"> / {formatAmount(target)}</span>
      </div>

      <div className="track">
        <div className="fill" style={{ width: `${pct}%`, background: color }} />
      </div>

      <div className="goal-meta">
        <span className={reached ? 'pct alert-pos' : 'pct'}>{reached ? 'Reached 🎉' : `${pct}%`}</span>
        {days !== null && (
          <span className="goal-days">
            {days >= 0 ? `${days} days left` : `${Math.abs(days)} days overdue`}
          </span>
        )}
      </div>

      <form className="goal-add" onSubmit={add}>
        <input
          className="field-input num"
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Add funds"
        />
        <button className="btn-secondary" type="submit" disabled={busy}>
          {busy ? '…' : 'Add'}
        </button>
      </form>
    </div>
  );
}
