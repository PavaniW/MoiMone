import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { monthRange, currentPeriod } from '../lib/period.js';
import { cardsWithBalances } from '../lib/accounts.js';

const router = Router();

// GET /api/dashboard — everything the dashboard needs in ONE request, so the
// page pays the auth cost and round-trip once instead of five times. This is
// pure plumbing: it runs the SAME queries the individual endpoints run and
// returns the SAME shapes — no calculations happen here (the frontend's build()
// is unchanged). Query: ?space=&from=&to=&month=&year=
router.get('/', async (req, res, next) => {
  try {
    const fallback = currentPeriod();
    const month = Number(req.query.month) || fallback.month;
    const year = Number(req.query.year) || fallback.year;
    const { from, to } = req.query;
    // Scope to the requested space if the user belongs to it, else their personal space.
    const space =
      req.query.space && req.spaceIds.includes(req.query.space) ? req.query.space : req.personalSpaceId;

    const embed =
      '*, card:cards!card_id(nickname, last4, color, type), to_account:cards!to_card_id(nickname), goal:goals(name)';

    // Window transactions (6-month trend + this month) — same as GET /transactions?from=&to=.
    let windowQ = supabase.from('transactions').select(embed).eq('space_id', space).order('transaction_date', { ascending: false });
    if (from) windowQ = windowQ.gte('transaction_date', from);
    if (to) windowQ = windowQ.lt('transaction_date', to);

    const { start, end } = monthRange(month, year);

    const [categories, cards, windowTxns, recent, budgetRows, monthExpenses] = await Promise.all([
      supabase.from('categories').select('*').eq('user_id', req.user.id).order('name'),
      cardsWithBalances(req.user.id),
      windowQ,
      supabase.from('transactions').select(embed).eq('space_id', space).order('transaction_date', { ascending: false }).limit(5),
      supabase.from('budgets').select('*').eq('space_id', space).eq('month', month).eq('year', year).order('category'),
      supabase.from('transactions').select('category, amount').eq('space_id', space).eq('type', 'expense').gte('transaction_date', start).lt('transaction_date', end),
    ]);

    for (const r of [categories, windowTxns, recent, budgetRows, monthExpenses]) {
      if (r.error) throw new Error(r.error.message);
    }

    // Attach each budget's spent — identical computation to GET /budgets.
    const spentByCategory = {};
    for (const t of monthExpenses.data) spentByCategory[t.category] = (spentByCategory[t.category] || 0) + Number(t.amount);
    const budgets = budgetRows.data.map((b) => ({ ...b, spent: spentByCategory[b.category] || 0 }));

    res.json({
      categories: categories.data,
      cards,
      transactions: windowTxns.data,
      recent: recent.data,
      budgets,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
