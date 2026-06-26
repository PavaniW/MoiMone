import { Router } from 'express';
import { parseTransaction } from '../services/parser.js';
import { supabase } from '../lib/supabase.js';
import { userByIngestToken, matchUserCard } from '../lib/ingest.js';
import { userCategoryNames } from '../lib/categories.js';
import { categoryForMerchant } from '../lib/merchant-rules.js';
import { toLKR } from '../lib/fx.js';
import { goalsForSpace, matchGoal, addToGoal } from '../lib/goals.js';
import { setCardBalance, userAccounts, matchAccountByName, ensureCashAccount } from '../lib/accounts.js';

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
    const accounts = await userAccounts(who.userId);
    const parsed = await parseTransaction(text, {
      categories,
      goals: goals.map((g) => g.name),
      accounts: accounts.map((a) => a.nickname),
    });

    // Convert foreign-currency amounts to LKR (we store everything in LKR).
    const fx = await toLKR(parsed.amount, parsed.currency);
    const amount = fx ? fx.lkr : parsed.amount;
    const description = fx ? `Originally ${fx.currency} ${fx.original}` : null;
    const base = { amount, description, source: 'sms', raw_text: text, created_by: who.userId, space_id: who.spaceId };
    const dated = parsed.date ? { transaction_date: parsed.date } : {};

    // --- Transfer: between accounts and/or toward a goal (a "saving") ---
    if (parsed.type === 'transfer') {
      const goal = matchGoal(goals, parsed.goal);
      const fromAcct = matchAccountByName(accounts, parsed.from_account);
      const toAcct = matchAccountByName(accounts, parsed.to_account);
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          ...base,
          ...dated,
          type: 'transfer',
          category: 'Transfer',
          merchant: null,
          payment_method: null,
          card_last4: null,
          card_id: fromAcct?.id ?? null,
          to_card_id: toAcct?.id ?? null,
          goal_id: goal?.id ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(`Supabase insert failed: ${error.message}`);
      // Account balances are derived from the records; only goal progress is tracked.
      if (goal) await addToGoal(goal.id, amount, who.spaceId);
      return res.status(201).json({ transaction: data, parsed });
    }

    // --- Expense / income ---
    // Learned merchant rule overrides the LLM's category guess.
    let category = parsed.category;
    const learned = await categoryForMerchant(who.userId, parsed.merchant);
    if (learned) category = learned;

    // Auto-link to one of the user's registered cards by last 4 digits.
    let card = await matchUserCard(who.userId, parsed.card_last4);
    // Cash spending links to the user's Cash account so its balance stays accurate.
    if (!card && parsed.payment_method === 'cash') {
      card = { id: await ensureCashAccount(who.userId), type: 'cash', last4: null };
    }
    // No card number, but the message named a card type ("from debit card"):
    // link to the user's sole account of that type so its balance updates.
    if (!card && (parsed.payment_method === 'debit' || parsed.payment_method === 'credit')) {
      const matches = (await userAccounts(who.userId)).filter((a) => a.type === parsed.payment_method);
      if (matches.length === 1) card = matches[0];
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        ...base,
        ...dated,
        type: parsed.type,
        category,
        merchant: parsed.merchant,
        payment_method: card ? card.type : parsed.payment_method,
        card_last4: parsed.card_last4,
        card_id: card ? card.id : null,
        goal_id: null,
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase insert failed: ${error.message}`);

    // Balance is derived from the transaction itself. Only an SMS-stated
    // "available balance" needs action — reconcile the account to the bank's
    // figure (it's authoritative).
    if (card && parsed.account_balance != null) {
      await setCardBalance(card.id, parsed.account_balance, who.userId);
    }

    res.status(201).json({ transaction: data, parsed });
  } catch (err) {
    next(err);
  }
});

export default router;
