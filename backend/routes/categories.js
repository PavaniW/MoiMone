import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// GET /api/categories — list categories (name, icon, color) for the UI.
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
