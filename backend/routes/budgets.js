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

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// POST /api/budgets — create or update a budget for a category/month.
// Body: { category, monthly_limit, month?, year? } (period defaults to current).
// Upserts on the (category, month, year) unique key.
router.post('/', async (req, res, next) => {
  try {
    const fallback = currentPeriod();
    const { category, monthly_limit } = req.body || {};
    const month = Number(req.body?.month) || fallback.month;
    const year = Number(req.body?.year) || fallback.year;

    if (!category || !String(category).trim()) throw badRequest('category is required');
    const limit = Number(monthly_limit);
    if (!(limit > 0)) throw badRequest('monthly_limit must be a positive number');
    if (month < 1 || month > 12) throw badRequest('month must be 1–12');

    const { data, error } = await supabase
      .from('budgets')
      .upsert(
        { category: String(category).trim(), monthly_limit: limit, month, year },
        { onConflict: 'category,month,year' }
      )
      .select()
      .single();
    if (error) throw new Error(error.message);

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/budgets/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('budgets')
      .delete()
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Budget not found' });

    res.json({ deleted: data.id });
  } catch (err) {
    next(err);
  }
});

export default router;
