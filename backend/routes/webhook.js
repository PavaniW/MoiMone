import { Router } from 'express';
import { verifyWebhookToken } from '../middleware/auth.js';
import { parseTransaction } from '../services/parser.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

// POST /webhook/sms — iOS Shortcut posts raw bank SMS here.
// Body: { "text": "<sms body>", "token": "<WEBHOOK_SECRET_TOKEN>" }
// Flow: verify token → parse with Claude → store in transactions.
router.post('/sms', verifyWebhookToken, async (req, res, next) => {
  const text = req.body?.text;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Missing "text" in request body' });
  }

  try {
    const parsed = await parseTransaction(text);

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        amount: parsed.amount,
        type: parsed.type,
        category: parsed.category,
        merchant: parsed.merchant,
        payment_method: parsed.payment_method,
        card_last4: parsed.card_last4,
        source: 'sms',
        raw_text: text,
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
