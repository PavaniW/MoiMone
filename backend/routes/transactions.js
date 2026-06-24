import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { monthRange } from '../lib/period.js';
import { PAYMENT_METHODS } from '../services/parser.js';
import { targetSpace } from '../lib/scope.js';

const router = Router();

// Normalize a card field to exactly 4 digits, or null.
function cleanLast4(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 4 ? digits : null;
}

// Resolve a card_id the user owns into { type, last4 } so the transaction's
// payment_method/card_last4 stay consistent with the registered card.
async function resolveCard(req, cardId) {
  if (!cardId) return null;
  const { data, error } = await supabase
    .from('cards')
    .select('id, type, last4')
    .eq('id', cardId)
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const e = new Error('card not found');
    e.status = 400;
    throw e;
  }
  return data;
}

// Reject a request with a 400 the error handler will surface to the client.
function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// GET /api/transactions — list transactions in the user's spaces, newest first.
// Optional query: ?month=&year=, ?limit=, ?category=, ?source=, ?type=, ?space=.
router.get('/', async (req, res, next) => {
  try {
    const { month, year, limit, category, source, type, space, from, to } = req.query;

    let query = supabase
      .from('transactions')
      // Embed the linked card so it resolves even when it belongs to another
      // member of a shared space (the viewer doesn't own that card).
      .select('*, card:cards(nickname, last4, color, type)')
      .in('space_id', req.spaceIds) // only spaces this user belongs to
      .order('transaction_date', { ascending: false });

    if (space) {
      if (!req.spaceIds.includes(space)) throw badRequest('invalid space');
      query = query.eq('space_id', space);
    }
    if (month && year) {
      const { start, end } = monthRange(month, year);
      query = query.gte('transaction_date', start).lt('transaction_date', end);
    }
    // Explicit date-range window (used by the dashboard's 6-month trend).
    if (from) query = query.gte('transaction_date', from);
    if (to) query = query.lt('transaction_date', to);
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

// POST /api/transactions — manual transaction entry.
// Body: { amount, type, category, merchant?, description?, transaction_date? }.
router.post('/', async (req, res, next) => {
  try {
    const { amount, type, category, merchant, description, transaction_date, payment_method, card_last4, card_id } =
      req.body || {};

    const value = Math.abs(Number(amount));
    if (!value) throw badRequest('amount must be a non-zero number');
    if (type !== 'expense' && type !== 'income') {
      throw badRequest("type must be 'expense' or 'income'");
    }
    if (!category || !String(category).trim()) throw badRequest('category is required');
    if (payment_method != null && payment_method !== '' && !PAYMENT_METHODS.includes(payment_method)) {
      throw badRequest(`payment_method must be one of: ${PAYMENT_METHODS.join(', ')}`);
    }

    // A chosen card sets the method + last4; otherwise use the raw fields (cash/other).
    const card = await resolveCard(req, card_id);

    const row = {
      amount: value,
      type,
      category: String(category).trim(),
      merchant: merchant ? String(merchant).trim() : null,
      description: description ? String(description).trim() : null,
      payment_method: card ? card.type : payment_method || null,
      card_last4: card ? card.last4 : cleanLast4(card_last4),
      card_id: card ? card.id : null,
      source: 'manual',
      space_id: targetSpace(req, req.body?.space_id),
      created_by: req.user.id,
    };
    if (transaction_date) row.transaction_date = new Date(transaction_date).toISOString();

    const { data, error } = await supabase.from('transactions').insert(row).select().single();
    if (error) throw new Error(error.message);

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/transactions/:id — edit (e.g. fix auto-categorized category).
// Only the provided fields are changed.
router.put('/:id', async (req, res, next) => {
  try {
    const { amount, type, category, merchant, description, transaction_date, payment_method, card_last4, card_id } =
      req.body || {};
    const updates = {};

    if (amount !== undefined) {
      const value = Math.abs(Number(amount));
      if (!value) throw badRequest('amount must be a non-zero number');
      updates.amount = value;
    }
    if (type !== undefined) {
      if (type !== 'expense' && type !== 'income') {
        throw badRequest("type must be 'expense' or 'income'");
      }
      updates.type = type;
    }
    if (category !== undefined) {
      if (!String(category).trim()) throw badRequest('category cannot be empty');
      updates.category = String(category).trim();
    }
    if (merchant !== undefined) updates.merchant = merchant ? String(merchant).trim() : null;
    if (description !== undefined) {
      updates.description = description ? String(description).trim() : null;
    }
    if (transaction_date !== undefined) {
      updates.transaction_date = new Date(transaction_date).toISOString();
    }
    if (payment_method !== undefined) {
      if (payment_method != null && payment_method !== '' && !PAYMENT_METHODS.includes(payment_method)) {
        throw badRequest(`payment_method must be one of: ${PAYMENT_METHODS.join(', ')}`);
      }
      updates.payment_method = payment_method || null;
    }
    if (card_last4 !== undefined) updates.card_last4 = cleanLast4(card_last4);
    // A chosen card overrides method/last4; an empty card_id clears the link.
    if (card_id !== undefined) {
      if (card_id) {
        const card = await resolveCard(req, card_id);
        updates.card_id = card.id;
        updates.payment_method = card.type;
        updates.card_last4 = card.last4;
      } else {
        updates.card_id = null;
      }
    }
    // Moving an entry between spaces (e.g. Personal -> Shared).
    if (req.body?.space_id !== undefined) updates.space_id = targetSpace(req, req.body.space_id);

    if (!Object.keys(updates).length) throw badRequest('no fields to update');

    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', req.params.id)
      .in('space_id', req.spaceIds) // can only edit rows in your own spaces
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Transaction not found' });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', req.params.id)
      .in('space_id', req.spaceIds) // can only delete rows in your own spaces
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Transaction not found' });

    res.json({ deleted: data.id });
  } catch (err) {
    next(err);
  }
});

export default router;
