import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { monthRange, currentPeriod } from '../lib/period.js';

const router = Router();

// GET /api/budgets — budgets for a month (default current), each with a
// computed `spent` = sum of that category's expenses in the same month.
router.get('/', async (req, res, next) => {
  try {
    const fallback = currentPeriod();
    const month = Number(req.query.month) || fallback.month;
    const year = Number(req.query.year) || fallback.year;

    const { data: budgets, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('month', month)
      .eq('year', year)
      .order('category');
    if (error) throw new Error(error.message);

    const { start, end } = monthRange(month, year);
    const { data: txns, error: txErr } = await supabase
      .from('transactions')
      .select('category, amount')
      .eq('type', 'expense')
      .gte('transaction_date', start)
      .lt('transaction_date', end);
    if (txErr) throw new Error(txErr.message);

    const spentByCategory = {};
    for (const t of txns) {
      spentByCategory[t.category] = (spentByCategory[t.category] || 0) + Number(t.amount);
    }

    res.json(budgets.map((b) => ({ ...b, spent: spentByCategory[b.category] || 0 })));
  } catch (err) {
    next(err);
  }
});

// POST /api/budgets — create or update a budget for a category/month
router.post('/', (_req, res) => {
  res.status(501).json({ error: 'Not implemented: upsert budget' });
});

// DELETE /api/budgets/:id
router.delete('/:id', (_req, res) => {
  res.status(501).json({ error: 'Not implemented: delete budget' });
});

export default router;
