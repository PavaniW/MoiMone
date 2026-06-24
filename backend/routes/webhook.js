import { Router } from 'express';
import { parseTransaction } from '../services/parser.js';
import { supabase } from '../lib/supabase.js';
import { userByIngestToken, matchUserCard } from '../lib/ingest.js';
import { userCategoryNames } from '../lib/categories.js';
import { categoryForMerchant } from '../lib/merchant-rules.js';
import { toLKR } from '../lib/fx.js';
import { goalsForSpace, matchGoal, addToGoal } from '../lib/goals.js';
import { setAccountBalance, bumpAccount } from '../lib/accounts.js';

const router = Router();

// POST /webhook/sms — iOS Shortcut posts raw bank SMS here.
// Body: { "text": "<sms body>", "token": "<your personal ingest token>" }
// The token (from GET /api/me, unique per user) identifies whose account this
// is, so the transaction lands in that user's private space. A bad/missing
// token is rejected.
router.post('/sms', async (req, res, next) => {
  const text = req.body?.text;
  const header = req.headers.authorization || '';
  const token = req.body?.token || (header.startsWith('Bearer ') ? header.slice(7) : null);

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Missing "text" in request body' });
  }

  try {
    const who = await userByIngestToken(token);
    if (!who) return res.status(401).json({ error: 'Invalid or missing ingest token' });

    const categories = await userCategoryNames(who.userId);
    const goals = await goalsForSpace(who.spaceId);
    const parsed = await parseTransaction(text, { categories, goals: goals.map((g) => g.name) });

    const isSavings = parsed.type === 'savings';
    const goal = isSavings ? matchGoal(goals, parsed.goal) : null;

    // Learned merchant rule overrides the LLM's category guess (non-savings only).
    let category = parsed.category;
    if (!isSavings) {
      const learned = await categoryForMerchant(who.userId, parsed.merchant);
      if (learned) category = learned;
    }

    // Auto-link to one of the user's registered cards by last 4 digits.
    const card = isSavings ? null : await matchUserCard(who.userId, parsed.card_last4);

    // Convert foreign-currency amounts to LKR (we store everything in LKR).
    const fx = await toLKR(parsed.amount, parsed.currency);
    const amount = fx ? fx.lkr : parsed.amount;

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        amount,
        type: parsed.type,
        category: isSavings ? 'Savings' : category,
        merchant: isSavings ? null : parsed.merchant,
        description: fx ? `Originally ${fx.currency} ${fx.original}` : null,
        payment_method: isSavings ? null : card ? card.type : parsed.payment_method,
        card_last4: isSavings ? null : parsed.card_last4,
        card_id: isSavings ? null : card ? card.id : null,
        goal_id: isSavings ? (goal ? goal.id : null) : null,
        source: 'sms',
        raw_text: text,
        created_by: who.userId,
        space_id: who.spaceId, // always the user's private space (never shared)
        // Use the date from the message when the parser found one; else default now().
        ...(parsed.date ? { transaction_date: parsed.date } : {}),
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase insert failed: ${error.message}`);

    // A linked saving contributes to the goal's progress.
    if (isSavings && goal) await addToGoal(goal.id, amount, who.spaceId);

    // Keep the linked account's balance fresh: the SMS "available balance" is
    // authoritative; otherwise adjust incrementally by the transaction.
    if (card) {
      if (parsed.account_balance != null) {
        await setAccountBalance(card.id, parsed.account_balance, who.userId);
      } else if (parsed.type === 'income') {
        await bumpAccount(card.id, amount, who.userId);
      } else if (parsed.type === 'expense') {
        await bumpAccount(card.id, -amount, who.userId);
      }
    }

    res.status(201).json({ transaction: data, parsed });
  } catch (err) {
    next(err);
  }
});

export default router;
