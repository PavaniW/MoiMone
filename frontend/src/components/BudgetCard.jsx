import { useState } from 'react';
import { formatAmount, CURRENCY } from '../lib/format.js';

const FALLBACK_COLOR = '#9A9384';

// Card for one category budget: progress bar, % spent, inline edit of the
// monthly limit, and delete — same interaction as GoalCard.
export default function BudgetCard({ budget, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const limit = Number(budget.monthly_limit);
  const spent = Number(budget.spent);
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  const overThreshold = pct >= 80;
  const color = budget.color || FALLBACK_COLOR;
  const fillColor = overThreshold ? 'var(--sienna)' : color;

  function startEdit() {
    setDraft(String(limit));
    setEditing(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!(Number(draft) > 0)) return;
    setBusy(true);
    try {
      await onEdit(budget, Number(draft));
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
          {budget.category}
        </span>
        <span className="goal-actions">
          <button className="row-edit" title="Edit limit" onClick={startEdit}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
          <button className="row-del" title="Delete budget" onClick={() => onDelete(budget.id)}>
            ✕
          </button>
        </span>
      </div>

      {editing ? (
        <form className="goal-edit" onSubmit={saveEdit}>
          <input
            className="field-input num"
            type="number"
            step="0.01"
            min="0"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Monthly limit (${CURRENCY})`}
            autoFocus
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
              {CURRENCY} {formatAmount(spent)}
            </span>
            <span className="goal-target"> / {formatAmount(limit)}</span>
          </div>

          <div className="track">
            <div className="fill" style={{ width: `${Math.min(pct, 100)}%`, background: fillColor }} />
          </div>

          <div className="goal-meta">
            <span className={overThreshold ? 'pct alert' : 'pct'}>{pct}%</span>
            {overThreshold && <span className="goal-days">Over 80% — ease up</span>}
          </div>
        </>
      )}
    </div>
  );
}
