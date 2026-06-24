import { Router } from 'express';
import { parseTransaction } from '../services/parser.js';
import { supabase } from '../lib/supabase.js';
import { userByIngestToken, matchUserCard } from '../lib/ingest.js';
import { userCategoryNames } from '../lib/categories.js';
import { categoryForMerchant } from '../lib/merchant-rules.js';
import { toLKR } from '../lib/fx.js';

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
    const parsed = await parseTransaction(text, { categories });

    // Learned merchant rule overrides the LLM's category guess, if any.
    const learned = await categoryForMerchant(who.userId, parsed.merchant);
    if (learned) parsed.category = learned;

    // Auto-link to one of the user's registered cards by last 4 digits.
    const card = await matchUserCard(who.userId, parsed.card_last4);

    // Convert foreign-currency amounts to LKR (we store everything in LKR).
    const fx = await toLKR(parsed.amount, parsed.currency);

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        amount: fx ? fx.lkr : parsed.amount,
        type: parsed.type,
        category: parsed.category,
        merchant: parsed.merchant,
        description: fx ? `Originally ${fx.currency} ${fx.original}` : null,
        payment_method: card ? card.type : parsed.payment_method,
        card_last4: parsed.card_last4,
        card_id: card ? card.id : null,
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

    res.status(201).json({ transaction: data, parsed });
  } catch (err) {
    next(err);
  }
});

export default router;
