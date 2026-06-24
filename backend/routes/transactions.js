import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { monthRange } from '../lib/period.js';
import { PAYMENT_METHODS } from '../services/parser.js';
import { targetSpace } from '../lib/scope.js';
import { bumpAccount } from '../lib/accounts.js';

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

const TYPES = ['expense', 'income', 'savings', 'transfer'];

// Apply (sign +1) or reverse (sign -1) a transaction's effect on account balances.
// expense lowers its account, income raises it, transfer moves between accounts.
async function applyBalanceEffect(t, sign, userId) {
  const amt = Number(t.amount) * sign;
  if (t.type === 'expense' && t.card_id) await bumpAccount(t.card_id, -amt, userId);
  else if (t.type === 'income' && t.card_id) await bumpAccount(t.card_id, amt, userId);
  else if (t.type === 'transfer') {
    if (t.card_id) await bumpAccount(t.card_id, -amt, userId);
    if (t.to_card_id) await bumpAccount(t.to_card_id, amt, userId);
  }
}

// Validate a goal_id belongs to one of the user's spaces; returns its id or null.
async function resolveGoalId(req, goalId) {
  if (!goalId) return null;
  const { data, error } = await supabase
    .from('goals')
    .select('id')
    .eq('id', goalId)
    .in('space_id', req.spaceIds)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw badRequest('goal not found');
  return data.id;
}

// Adjust a goal's saved amount by delta (savings transactions feed goal progress).
async function bumpGoal(goalId, delta, spaceIds) {
  if (!goalId || !delta) return;
  const { data: g } = await supabase
    .from('goals')
    .select('current_amount')
    .eq('id', goalId)
    .in('space_id', spaceIds)
    .maybeSingle();
  if (!g) return;
  const next = Math.max(0, Number(g.current_amount) + delta);
  await supabase.from('goals').update({ current_amount: next }).eq('id', goalId).in('space_id', spaceIds);
}

// GET /api/transactions — list transactions in the user's spaces, newest first.
// Optional query: ?month=&year=, ?limit=, ?category=, ?source=, ?type=, ?space=.
router.get('/', async (req, res, next) => {
  try {
    const { month, year, limit, category, source, type, space, from, to } = req.query;

    let query = supabase
      .from('transactions')
      // Embed the linked card (resolves a partner's card in a shared space) and
      // the linked goal (so savings rows can show "Savings → <goal>").
      .select('*, card:cards!card_id(nickname, last4, color, type), to_account:cards!to_card_id(nickname), goal:goals(name)')
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
    if (!TYPES.includes(type)) throw badRequest("type must be 'expense', 'income', 'savings' or 'transfer'");

    // --- Transfer: move money between two of the user's accounts ---
    if (type === 'transfer') {
      const toId = req.body?.to_card_id;
      if (!card_id || !toId) throw badRequest('a transfer needs a from and a to account');
      if (card_id === toId) throw badRequest('the from and to accounts must be different');
      await resolveCard(req, card_id); // validate ownership of both
      await resolveCard(req, toId);
      const trow = {
        amount: value,
        type: 'transfer',
        category: 'Transfer',
        merchant: null,
        description: description ? String(description).trim() : null,
        payment_method: null,
        card_id, // from
        to_card_id: toId, // to
        source: 'manual',
        space_id: targetSpace(req, req.body?.space_id),
        created_by: req.user.id,
      };
      if (transaction_date) trow.transaction_date = new Date(transaction_date).toISOString();
      const { data, error } = await supabase.from('transactions').insert(trow).select().single();
      if (error) throw new Error(error.message);
      await applyBalanceEffect(data, +1, req.user.id);
      return res.status(201).json(data);
    }

    if (payment_method != null && payment_method !== '' && !PAYMENT_METHODS.includes(payment_method)) {
      throw badRequest(`payment_method must be one of: ${PAYMENT_METHODS.join(', ')}`);
    }

    const isSavings = type === 'savings';
    // Savings are money set aside (no card), optionally feeding a goal.
    const goalId = isSavings ? await resolveGoalId(req, req.body?.goal_id) : null;
    const cat = isSavings ? String(category || '').trim() || 'Savings' : String(category || '').trim();
    if (!cat) throw badRequest('category is required');

    // A chosen card sets the method + last4; otherwise use the raw fields (cash/other).
    const card = isSavings ? null : await resolveCard(req, card_id);

    const row = {
      amount: value,
      type,
      category: cat,
      merchant: merchant ? String(merchant).trim() : null,
      description: description ? String(description).trim() : null,
      payment_method: isSavings ? null : card ? card.type : payment_method || null,
      card_last4: isSavings ? null : card ? card.last4 : cleanLast4(card_last4),
      card_id: isSavings ? null : card ? card.id : null,
      goal_id: goalId,
      source: 'manual',
      space_id: targetSpace(req, req.body?.space_id),
      created_by: req.user.id,
    };
    if (transaction_date) row.transaction_date = new Date(transaction_date).toISOString();

    const { data, error } = await supabase.from('transactions').insert(row).select().single();
    if (error) throw new Error(error.message);

    // Linked savings contribute to the goal's progress.
    if (isSavings && goalId) await bumpGoal(goalId, value, req.spaceIds);
    // Expense/income adjust the linked account's balance.
    await applyBalanceEffect(data, +1, req.user.id);

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

    // Load the existing row first (need its old type/amount/goal for goal sync).
    const { data: old, error: oldErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', req.params.id)
      .in('space_id', req.spaceIds)
      .maybeSingle();
    if (oldErr) throw new Error(oldErr.message);
    if (!old) return res.status(404).json({ error: 'Transaction not found' });

    const updates = {};

    if (amount !== undefined) {
      const value = Math.abs(Number(amount));
      if (!value) throw badRequest('amount must be a non-zero number');
      updates.amount = value;
    }
    if (type !== undefined) {
      if (!TYPES.includes(type)) throw badRequest("type must be 'expense', 'income' or 'savings'");
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
    if (req.body?.goal_id !== undefined) {
      updates.goal_id = req.body.goal_id ? await resolveGoalId(req, req.body.goal_id) : null;
    }
    if (req.body?.to_card_id !== undefined) {
      updates.to_card_id = req.body.to_card_id ? (await resolveCard(req, req.body.to_card_id)).id : null;
    }
    if (req.body?.space_id !== undefined) updates.space_id = targetSpace(req, req.body.space_id);

    // Resolve the post-update type; a non-savings entry can't hold a goal/card link.
    const finalType = updates.type ?? old.type;
    if (finalType === 'savings') {
      updates.card_id = null;
      updates.payment_method = null;
      updates.card_last4 = null;
    } else {
      updates.goal_id = null;
    }

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

    // Re-sync goal progress: remove the old savings contribution, add the new one.
    if (old.type === 'savings' && old.goal_id) await bumpGoal(old.goal_id, -Number(old.amount), req.spaceIds);
    if (data.type === 'savings' && data.goal_id) await bumpGoal(data.goal_id, Number(data.amount), req.spaceIds);

    // Re-sync account balances: reverse the old effect, apply the new one.
    await applyBalanceEffect(old, -1, req.user.id);
    await applyBalanceEffect(data, +1, req.user.id);

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

    // Deleting a linked savings entry removes its contribution from the goal.
    if (data.type === 'savings' && data.goal_id) await bumpGoal(data.goal_id, -Number(data.amount), req.spaceIds);
    // Reverse its effect on account balances.
    await applyBalanceEffect(data, -1, req.user.id);

    res.json({ deleted: data.id });
  } catch (err) {
    next(err);
  }
});

export default router;
