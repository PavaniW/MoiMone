import { useState } from 'react';
import { formatAmount, CURRENCY } from '../lib/format.js';

const DEFAULT_COLOR = '#2f6b4f';

// Days between now and a yyyy-mm-dd deadline; null when no deadline.
function daysLeft(deadline) {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

// Card for one saving goal: progress bar, % saved, days remaining, add-funds,
// edit (name/target/deadline) & delete.
export default function GoalCard({ goal, onAddFunds, onEdit, onDelete }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', target_amount: '', deadline: '' });

  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const reached = current >= target;
  const color = goal.color || DEFAULT_COLOR;
  const days = daysLeft(goal.deadline);
  // Minimum to save per month to hit the target by the deadline.
  const remaining = Math.max(0, target - current);
  const monthsLeft = days != null && days > 0 ? Math.max(1, Math.ceil(days / 30.44)) : null;
  const perMonth = monthsLeft ? remaining / monthsLeft : null;

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

  function startEdit() {
    setDraft({
      name: goal.name,
      target_amount: String(target),
      deadline: goal.deadline || '',
    });
    setEditing(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!draft.name.trim() || !(Number(draft.target_amount) > 0)) return;
    setBusy(true);
    try {
      await onEdit(goal.id, {
        name: draft.name.trim(),
        target_amount: Number(draft.target_amount),
        deadline: draft.deadline || null,
      });
      setEditing(false);
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
        <span className="goal-actions">
          <button className="row-edit" title="Edit goal" onClick={startEdit}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
          <button className="row-del" title="Delete goal" onClick={() => onDelete(goal.id)}>
            ✕
          </button>
        </span>
      </div>

      {editing ? (
        <form className="goal-edit" onSubmit={saveEdit}>
          <input
            className="field-input"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Goal name"
            maxLength={60}
          />
          <input
            className="field-input num"
            type="number"
            step="0.01"
            min="0"
            value={draft.target_amount}
            onChange={(e) => setDraft((d) => ({ ...d, target_amount: e.target.value }))}
            placeholder="Target amount"
          />
          <input
            className="field-input"
            type="date"
            value={draft.deadline || ''}
            onChange={(e) => setDraft((d) => ({ ...d, deadline: e.target.value }))}
          />
          <div className="form-actions">
            <button className="btn-secondary btn-sm" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" type="submit" disabled={busy}>
              {busy ? '…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <>
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
            <span className={reached ? 'pct alert-pos' : 'pct'}>
              {reached ? 'Reached 🎉' : `${pct}%`}
            </span>
            {days !== null && (
              <span className="goal-days">
                {days >= 0 ? `${days} days left` : `${Math.abs(days)} days overdue`}
              </span>
            )}
          </div>

          {!reached && perMonth != null && (
            <div className="goal-permonth num">
              Save <strong>{CURRENCY} {formatAmount(perMonth)}/mo</strong> to reach this by the deadline
            </div>
          )}
          {!reached && perMonth == null && goal.deadline && days != null && days <= 0 && (
            <div className="goal-permonth">
              Deadline passed — {CURRENCY} {formatAmount(remaining)} still to go
            </div>
          )}

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
        </>
      )}
    </div>
  );
}
