import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts';
import { formatAmount } from '../lib/format.js';

// Ranked horizontal bars — "where the money went". One bar per category,
// colored by the category, with the amount printed at the bar's end.
export default function SpendingChart({ data }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 0, right: 64, bottom: 0, left: 8 }}
          barCategoryGap={10}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="category"
            axisLine={false}
            tickLine={false}
            width={108}
            tick={{ className: 'axis-label' }}
          />
          <Bar dataKey="amount" radius={[2, 2, 2, 2]} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.category} fill={row.color} />
            ))}
            <LabelList
              dataKey="amount"
              position="right"
              className="bar-amount"
              formatter={(v) => formatAmount(v)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
