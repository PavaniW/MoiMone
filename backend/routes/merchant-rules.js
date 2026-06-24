import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { normalizeMerchant } from '../lib/merchant-rules.js';

const router = Router();

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// GET /api/merchant-rules — this user's learned merchant → category rules.
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('merchant_rules')
      .select('id, merchant, category')
      .eq('user_id', req.user.id)
      .order('merchant');
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/merchant-rules — add/update a rule { merchant, category }.
router.post('/', async (req, res, next) => {
  try {
    const merchant = normalizeMerchant(req.body?.merchant);
    const category = String(req.body?.category || '').trim();
    if (!merchant) throw badRequest('merchant is required');
    if (!category) throw badRequest('category is required');

    const { data, error } = await supabase
      .from('merchant_rules')
      .upsert({ user_id: req.user.id, merchant, category }, { onConflict: 'user_id,merchant' })
      .select('id, merchant, category')
      .single();
    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/merchant-rules/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('merchant_rules')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw new Error(error.message);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
