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

// Reject a request with a 400 the error handler will surface to the client.
function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// POST /api/transactions — manual transaction entry.
// Body: { amount, type, category, merchant?, description?, transaction_date? }.
router.post('/', async (req, res, next) => {
  try {
    const { amount, type, category, merchant, description, transaction_date } = req.body || {};

    const value = Math.abs(Number(amount));
    if (!value) throw badRequest('amount must be a non-zero number');
    if (type !== 'expense' && type !== 'income') {
      throw badRequest("type must be 'expense' or 'income'");
    }
    if (!category || !String(category).trim()) throw badRequest('category is required');

    const row = {
      amount: value,
      type,
      category: String(category).trim(),
      merchant: merchant ? String(merchant).trim() : null,
      description: description ? String(description).trim() : null,
      source: 'manual',
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
    const { amount, type, category, merchant, description, transaction_date } = req.body || {};
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

    if (!Object.keys(updates).length) throw badRequest('no fields to update');

    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', req.params.id)
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
