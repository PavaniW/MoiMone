import { formatAmount, formatDay, CURRENCY } from '../lib/format.js';

// One greenbar ledger row. Income is shown in ledger-green with a leading +.
export default function TransactionItem({ transaction }) {
  const { transaction_date, merchant, category, source, type, amount, color } = transaction;
  const isIncome = type === 'income';
  const isSaving = type === 'savings';

  return (
    <div className="ledger-row body">
      <span className="ledger-date num">{formatDay(transaction_date)}</span>
      <span className="ledger-merchant">
        <span className="cat-dot" style={{ background: color }} />
        {merchant}
      </span>
      <span className="ledger-cat">{category}</span>
      <span className="src-tag">{source}</span>
      <span className={`ledger-amount ${isIncome ? 'income' : isSaving ? 'saved' : 'expense'}`}>
        {isIncome ? '+' : isSaving ? '⇢' : '−'}
        <span className="sym">{CURRENCY}</span>
        {formatAmount(amount)}
      </span>
    </div>
  );
}
