import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { formatAmount, CURRENCY } from '../lib/format.js';

// "Where the money went" — a donut by category with a legend + center total.
export default function SpendingChart({ data }) {
  const total = data.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="pie-chart">
      <div className="pie-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((row) => (
                <Cell key={row.category} fill={row.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, n) => [`${CURRENCY} ${formatAmount(v)}`, n]}
              contentStyle={{ fontSize: '0.8rem', borderRadius: 8, border: '1px solid var(--line)' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pie-center">
          <span className="pie-center-label">total</span>
          <span className="pie-center-value num">
            {CURRENCY} {formatAmount(total)}
          </span>
        </div>
      </div>

      <ul className="pie-legend">
        {data.map((d) => (
          <li key={d.category}>
            <span className="pie-dot" style={{ background: d.color }} />
            <span className="pie-cat">{d.category}</span>
            <span className="pie-amt num">{formatAmount(d.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
