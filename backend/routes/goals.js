import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// GET /api/goals — list saving goals, oldest first.
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/goals — create a saving goal
router.post('/', (_req, res) => {
  res.status(501).json({ error: 'Not implemented: create goal' });
});

// PUT /api/goals/:id — update goal progress (add funds, edit target, etc.)
router.put('/:id', (_req, res) => {
  res.status(501).json({ error: 'Not implemented: update goal' });
});

// DELETE /api/goals/:id
router.delete('/:id', (_req, res) => {
  res.status(501).json({ error: 'Not implemented: delete goal' });
});

export default router;
