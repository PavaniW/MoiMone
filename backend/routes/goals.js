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

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// POST /api/goals — create a saving goal.
// Body: { name, target_amount, current_amount?, deadline?, color? }.
router.post('/', async (req, res, next) => {
  try {
    const { name, target_amount, current_amount, deadline, color } = req.body || {};

    if (!name || !String(name).trim()) throw badRequest('name is required');
    const target = Number(target_amount);
    if (!(target > 0)) throw badRequest('target_amount must be a positive number');

    const row = {
      name: String(name).trim(),
      target_amount: target,
      current_amount: current_amount !== undefined ? Math.max(0, Number(current_amount) || 0) : 0,
      deadline: deadline || null,
      color: color ? String(color).trim() : null,
    };

    const { data, error } = await supabase.from('goals').insert(row).select().single();
    if (error) throw new Error(error.message);

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/goals/:id — update goal progress (add funds, edit target, etc.).
// Only provided fields change. Use `add_funds` to increment current_amount.
router.put('/:id', async (req, res, next) => {
  try {
    const { name, target_amount, current_amount, add_funds, deadline, color } = req.body || {};
    const updates = {};

    if (name !== undefined) {
      if (!String(name).trim()) throw badRequest('name cannot be empty');
      updates.name = String(name).trim();
    }
    if (target_amount !== undefined) {
      const target = Number(target_amount);
      if (!(target > 0)) throw badRequest('target_amount must be a positive number');
      updates.target_amount = target;
    }
    if (current_amount !== undefined) updates.current_amount = Math.max(0, Number(current_amount) || 0);
    if (deadline !== undefined) updates.deadline = deadline || null;
    if (color !== undefined) updates.color = color ? String(color).trim() : null;

    // "Add funds" increments the current saved amount; resolved against the row.
    const delta = Number(add_funds);
    if (add_funds !== undefined && !Number.isNaN(delta)) {
      const { data: goal, error: readErr } = await supabase
        .from('goals')
        .select('current_amount')
        .eq('id', req.params.id)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!goal) return res.status(404).json({ error: 'Goal not found' });
      updates.current_amount = Math.max(0, Number(goal.current_amount) + delta);
    }

    if (!Object.keys(updates).length) throw badRequest('no fields to update');

    const { data, error } = await supabase
      .from('goals')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Goal not found' });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/goals/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('goals')
      .delete()
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Goal not found' });

    res.json({ deleted: data.id });
  } catch (err) {
    next(err);
  }
});

export default router;
