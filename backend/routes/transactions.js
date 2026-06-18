import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { monthRange } from '../lib/period.js';

const router = Router();

// GET /api/transactions — list transactions, newest first.
// Optional query: ?month=&year= (calendar-month filter), ?limit=, ?category=,
// ?source=, ?type=.
router.get('/', async (req, res, next) => {
  try {
    const { month, year, limit, category, source, type } = req.query;

    let query = supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: false });

    if (month && year) {
      const { start, end } = monthRange(month, year);
      query = query.gte('transaction_date', start).lt('transaction_date', end);
    }
    if (category) query = query.eq('category', category);
    if (source) query = query.eq('source', source);
    if (type) query = query.eq('type', type);
    if (limit) query = query.limit(Number(limit));

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/transactions — manual transaction entry
router.post('/', (_req, res) => {
  res.status(501).json({ error: 'Not implemented: create transaction' });
});

// PUT /api/transactions/:id — edit (e.g. fix auto-categorized category)
router.put('/:id', (_req, res) => {
  res.status(501).json({ error: 'Not implemented: update transaction' });
});

// DELETE /api/transactions/:id
router.delete('/:id', (_req, res) => {
  res.status(501).json({ error: 'Not implemented: delete transaction' });
});

export default router;
