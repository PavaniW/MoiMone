import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { monthRange, currentPeriod } from '../lib/period.js';
import { DEFAULT_CURRENCY } from '../services/parser.js';
import { answerFinanceQuestion } from '../services/finance-chat.js';

const router = Router();

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Sum expenses per category + overall income/expense totals for a set of rows.
function summarize(rows) {
  const byCategory = {};
  let totalIncome = 0;
  let totalExpense = 0;
  let totalSaved = 0;
  for (const t of rows) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      totalIncome += amt;
    } else if (t.type === 'savings' || (t.type === 'transfer' && t.goal_id)) {
      totalSaved += amt;
    } else if (t.type === 'expense') {
      totalExpense += amt;
      byCategory[t.category] = (byCategory[t.category] || 0) + amt;
    }
  }
  const rounded = {};
  for (const [k, v] of Object.entries(byCategory)) rounded[k] = round(v);
  return {
    totalIncome: round(totalIncome),
    totalExpense: round(totalExpense),
    totalSaved: round(totalSaved),
    available: round(totalIncome - totalExpense - totalSaved),
    byCategory: rounded,
  };
}

// Assemble a compact summary of the user's finances for the LLM. Covers this
// month and last month (per-category totals), current-month budgets with spend,
// savings goals, and a capped list of recent transactions for merchant-level
// questions. Everything is scoped to the spaces this user belongs to.
async function buildContext(req, spaceIds) {
  const { month, year } = currentPeriod();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const thisRange = monthRange(month, year);
  const prevRange = monthRange(prevMonth, prevYear);

  // One query for everything from the start of last month onward.
  const { data: txns, error: txErr } = await supabase
    .from('transactions')
    .select('amount, type, category, merchant, payment_method, transaction_date, goal_id')
    .in('space_id', spaceIds)
    .gte('transaction_date', prevRange.start)
    .order('transaction_date', { ascending: false });
  if (txErr) throw new Error(txErr.message);

  const inRange = (t, r) => t.transaction_date >= r.start && t.transaction_date < r.end;
  const thisMonthTx = txns.filter((t) => inRange(t, thisRange));
  const lastMonthTx = txns.filter((t) => inRange(t, prevRange));

  const thisSummary = summarize(thisMonthTx);

  // Budgets for the current month, with how much has been spent against each.
  const { data: budgetRows, error: bErr } = await supabase
    .from('budgets')
    .select('category, monthly_limit')
    .in('space_id', spaceIds)
    .eq('month', month)
    .eq('year', year);
  if (bErr) throw new Error(bErr.message);
  const budgets = (budgetRows || []).map((b) => {
    const limit = Number(b.monthly_limit) || 0;
    const spent = thisSummary.byCategory[b.category] || 0;
    return { category: b.category, limit: round(limit), spent: round(spent), remaining: round(limit - spent) };
  });

  // Savings goals.
  const { data: goalRows, error: gErr } = await supabase
    .from('goals')
    .select('name, target_amount, current_amount, deadline')
    .in('space_id', spaceIds);
  if (gErr) throw new Error(gErr.message);
  const goals = (goalRows || []).map((g) => ({
    name: g.name,
    target: round(g.target_amount),
    saved: round(g.current_amount),
    deadline: g.deadline || null,
  }));

  const monthLabel = (m, y) => `${String(m).padStart(2, '0')}/${y}`;

  return {
    today: new Date().toISOString().slice(0, 10),
    currency: DEFAULT_CURRENCY,
    thisMonth: { label: monthLabel(month, year), ...thisSummary },
    lastMonth: { label: monthLabel(prevMonth, prevYear), ...summarize(lastMonthTx) },
    budgets,
    goals,
    recentTransactions: thisMonthTx
      .concat(lastMonthTx)
      .slice(0, 50)
      .map((t) => ({
        date: t.transaction_date.slice(0, 10),
        amount: round(t.amount),
        type: t.type,
        category: t.category,
        merchant: t.merchant || 'Unknown',
      })),
  };
}

// POST /api/chat — in-app AI finance chat.
// Body: { "message": "Am I on track with my food budget this month?" }
router.post('/', async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) {
      const err = new Error('message is required');
      err.status = 400;
      throw err;
    }
    // Scope to the space the user is viewing, if they belong to it; else all.
    const requested = req.body?.space;
    const spaceIds = requested && req.spaceIds.includes(requested) ? [requested] : req.spaceIds;
    const context = await buildContext(req, spaceIds);
    const answer = await answerFinanceQuestion(message, context);
    res.json({ answer });
  } catch (err) {
    next(err);
  }
});

export default router;
