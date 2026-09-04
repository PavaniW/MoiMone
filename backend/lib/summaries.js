import { supabase } from './supabase.js';
import { monthRange, currentPeriod } from './period.js';
import { DEFAULT_CURRENCY } from '../services/parser.js';
import { cardsWithBalances } from './accounts.js';

// Shared WhatsApp report builders — used by the inbound bot commands and the
// scheduled weekly push (cron). Everything is stored in LKR.
const CUR = DEFAULT_CURRENCY;
const money = (n) =>
  `${CUR} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The date window for a report period: 'month' = current calendar month,
// anything else = the last 7 days.
function windowFor(period) {
  if (period === 'month') {
    const { month, year } = currentPeriod();
    const { start, end } = monthRange(month, year);
    const label = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return { start, end, label };
  }
  const end = new Date();
  const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString(), label: 'last 7 days' };
}

// A full spending report for a space: totals + a sorted by-category breakdown
// with each category's share of spending. period: 'week' (default) | 'month'.
export async function spendingReport(spaceId, period = 'week') {
  const { start, end, label } = windowFor(period);
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, type, category, goal_id')
    .eq('space_id', spaceId)
    .gte('transaction_date', start)
    .lt('transaction_date', end);
  if (error) throw new Error(error.message);

  let spent = 0;
  let income = 0;
  let saved = 0;
  let count = 0;
  const byCat = {};
  for (const t of data || []) {
    const a = Number(t.amount);
    if (t.type === 'income') {
      income += a;
    } else if (t.type === 'transfer') {
      if (t.goal_id) saved += a; // goal-tagged transfer = a saving; plain transfers just move money
    } else if (t.type === 'expense') {
      spent += a;
      count += 1;
      byCat[t.category] = (byCat[t.category] || 0) + a;
    }
  }

  const title = period === 'month' ? `📊 *Monthly report* · ${label}` : `📊 *Weekly report* · ${label}`;
  if (!spent && !income && !saved) return `${title}\n\nNothing logged yet.`;

  const lines = [title, ''];
  lines.push(`Spent   ${money(spent)}`);
  if (income) lines.push(`Income  ${money(income)}`);
  if (saved) lines.push(`Saved   ${money(saved)}`);

  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (cats.length) {
    lines.push('', '*Where it went*');
    for (const [name, amt] of cats) {
      const pct = spent ? Math.round((amt / spent) * 100) : 0;
      lines.push(`• ${name} — ${money(amt)} (${pct}%)`);
    }
    lines.push('', `${count} transaction${count === 1 ? '' : 's'}.`);
  }
  return lines.join('\n');
}

// Account balances for a user, plus the "available" (debit + cash) total that
// mirrors the dashboard's headline number.
export async function balancesReport(userId) {
  const cards = await cardsWithBalances(userId);
  if (!cards.length) return '💳 No accounts yet.';

  const lines = ['💳 *Account balances*', ''];
  let available = 0;
  for (const c of cards) {
    const bal = Number(c.balance || 0);
    if (c.type === 'debit' || c.type === 'cash') available += bal;
    const tag = c.last4 ? ` ••${c.last4}` : '';
    lines.push(`• ${c.nickname}${tag} — ${money(bal)}`);
  }
  lines.push('', `Available (debit + cash)  ${money(available)}`);
  return lines.join('\n');
}
