import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function cleanLast4(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 4 ? digits : null;
}

// GET /api/cards — the signed-in user's registered cards.
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/cards — register a card. Body: { nickname, type, last4?, bank?, color? }.
router.post('/', async (req, res, next) => {
  try {
    const { nickname, type, last4, bank, color } = req.body || {};
    if (!nickname || !String(nickname).trim()) throw badRequest('nickname is required');
    if (type !== 'credit' && type !== 'debit') throw badRequest("type must be 'credit' or 'debit'");

    const { data, error } = await supabase
      .from('cards')
      .insert({
        user_id: req.user.id,
        nickname: String(nickname).trim(),
        type,
        last4: cleanLast4(last4),
        bank: bank ? String(bank).trim() : null,
        color: color ? String(color).trim() : null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/cards/:id — edit a card (only your own).
router.put('/:id', async (req, res, next) => {
  try {
    const { nickname, type, last4, bank, color } = req.body || {};
    const updates = {};
    if (nickname !== undefined) {
      if (!String(nickname).trim()) throw badRequest('nickname cannot be empty');
      updates.nickname = String(nickname).trim();
    }
    if (type !== undefined) {
      if (type !== 'credit' && type !== 'debit') throw badRequest("type must be 'credit' or 'debit'");
      updates.type = type;
    }
    if (last4 !== undefined) updates.last4 = cleanLast4(last4);
    if (bank !== undefined) updates.bank = bank ? String(bank).trim() : null;
    if (color !== undefined) updates.color = color ? String(color).trim() : null;
    if (!Object.keys(updates).length) throw badRequest('no fields to update');

    const { data, error } = await supabase
      .from('cards')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Card not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cards/:id (transactions keep their denormalized method/last4).
router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cards')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Card not found' });
    res.json({ deleted: data.id });
  } catch (err) {
    next(err);
  }
});

export default router;
