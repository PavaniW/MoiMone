import { formatAmount } from '../lib/format.js';

// Progress bar for one category budget. Turns sienna past 80% spent (the
// blueprint's alert threshold).
export default function BudgetBar({ category, monthly_limit, spent, color }) {
  const pct = Math.round((spent / monthly_limit) * 100);
  const overThreshold = pct >= 80;
  const fillColor = overThreshold ? 'var(--sienna)' : color;

  return (
    <div className="budget-row">
      <div className="budget-top">
        <span className="budget-name">{category}</span>
        <span className="budget-figures">
          <span className="num">{formatAmount(spent)}</span> / {formatAmount(monthly_limit)}
          {'  '}
          <span className={overThreshold ? 'pct alert' : 'pct'}>{pct}%</span>
        </span>
      </div>
      <div className="track">
        <div
          className="fill"
          style={{ width: `${Math.min(pct, 100)}%`, background: fillColor }}
        />
      </div>
      {overThreshold && <span className="budget-alert">Over 80% — ease up</span>}
    </div>
  );
}
