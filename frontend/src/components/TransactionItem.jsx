import { formatAmount, formatDay, CURRENCY } from '../lib/format.js';

// One greenbar ledger row. Income is shown in ledger-green with a leading +.
export default function TransactionItem({ transaction }) {
  const { transaction_date, merchant, category, source, type, amount, color } = transaction;
  const isIncome = type === 'income';
  // A saving is a goal-tagged transfer; a plain transfer just moves money.
  const isSaving = type === 'transfer' && transaction.goal_id;
  const isTransfer = type === 'transfer' && !transaction.goal_id;
  const name = isSaving
    ? `Savings → ${transaction.goal?.name || 'Goal'}`
    : isTransfer
      ? 'Transfer'
      : merchant || '—';

  return (
    <div className="ledger-row body">
      <span className="ledger-date num">{formatDay(transaction_date)}</span>
      <span className="ledger-merchant">
        <span className="cat-dot" style={{ background: color }} />
        <span className="merchant-name" title={name}>{name}</span>
      </span>
      <span className="ledger-cat">{category}</span>
      <span className="src-tag">{source}</span>
      <span className={`ledger-amount ${isIncome ? 'income' : isSaving ? 'saved' : isTransfer ? 'transfer' : 'expense'}`}>
        {isIncome ? '+' : isSaving ? '⇢' : isTransfer ? '⇄' : '−'}
        <span className="sym">{CURRENCY}</span>
        {formatAmount(amount)}
      </span>
    </div>
  );
}
