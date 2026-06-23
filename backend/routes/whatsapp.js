import { Router } from 'express';
import twilio from 'twilio';
import { parseTransaction, DEFAULT_CURRENCY } from '../services/parser.js';
import { userCategoryNames } from '../lib/categories.js';
import { supabase } from '../lib/supabase.js';
import { monthRange, currentPeriod } from '../lib/period.js';
import { userByWhatsApp, matchUserCard } from '../lib/ingest.js';

const router = Router();
const { MessagingResponse } = twilio.twiml;

// Send a TwiML reply (what Twilio relays back to the WhatsApp user).
function reply(res, message) {
  const twiml = new MessagingResponse();
  twiml.message(message);
  res.type('text/xml').send(twiml.toString());
}

// Authenticate inbound requests so the endpoint is never open: require a valid
// Twilio signature, computed over the public webhook URL (rebuilt from the
// proxy's forwarding headers so it matches what Twilio signed). Set
// TWILIO_SKIP_VALIDATION=true to bypass while debugging a local tunnel.
function authenticate(req, res, next) {
  if (process.env.TWILIO_SKIP_VALIDATION === 'true') return next();

  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  if (!twilioToken) {
    console.warn('TWILIO_AUTH_TOKEN not set — rejecting WhatsApp webhook');
    return res.status(500).type('text/xml').send('<Response></Response>');
  }

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const url = `${proto}://${host}${req.originalUrl}`;
  const valid = twilio.validateRequest(
    twilioToken,
    req.headers['x-twilio-signature'],
    url,
    req.body || {}
  );
  if (!valid) {
    console.warn(`Twilio signature validation failed for ${url}`);
    return res.status(403).type('text/xml').send('<Response></Response>');
  }
  return next();
}

// "Budget remaining" line for the confirmation, scoped to this user's space.
async function budgetRemainingLine(category, spaceId) {
  const { month, year } = currentPeriod();
  const { data: budgets } = await supabase
    .from('budgets')
    .select('monthly_limit')
    .eq('space_id', spaceId)
    .eq('category', category)
    .eq('month', month)
    .eq('year', year)
    .limit(1);
  if (!budgets?.length) return '';

  const limit = Number(budgets[0].monthly_limit);
  const { start, end } = monthRange(month, year);
  const { data: txns } = await supabase
    .from('transactions')
    .select('amount')
    .eq('space_id', spaceId)
    .eq('type', 'expense')
    .eq('category', category)
    .gte('transaction_date', start)
    .lt('transaction_date', end);
  const spent = (txns || []).reduce((sum, t) => sum + Number(t.amount), 0);
  return ` Budget remaining: ${DEFAULT_CURRENCY} ${(limit - spent).toFixed(2)}.`;
}

// POST /webhook/whatsapp — Twilio posts inbound WhatsApp messages here
// (application/x-www-form-urlencoded; key fields: Body, From).
// Flow: parse the natural-language message with Claude → log the transaction →
// reply with a confirmation. (Question-answering is the in-app chat, Session 12.)
router.post('/whatsapp', authenticate, async (req, res) => {
  const body = (req.body?.Body || '').trim();
  if (!body) {
    return reply(res, 'Send me an expense like: "Spent 200 on groceries at Lulu".');
  }

  try {
    // Identify the user by their registered WhatsApp number.
    const who = await userByWhatsApp(req.body?.From);
    if (!who) {
      return reply(
        res,
        "⚠️ This number isn't linked to a MoiMone account yet. Add it under your profile in the app, then try again."
      );
    }

    const categories = await userCategoryNames(who.userId);
    const parsed = await parseTransaction(body, { categories });
    const card = await matchUserCard(who.userId, parsed.card_last4);

    const { error } = await supabase.from('transactions').insert({
      amount: parsed.amount,
      type: parsed.type,
      category: parsed.category,
      merchant: parsed.merchant,
      payment_method: card ? card.type : parsed.payment_method,
      card_last4: parsed.card_last4,
      card_id: card ? card.id : null,
      source: 'whatsapp',
      raw_text: body,
      created_by: who.userId,
      space_id: who.spaceId, // user's private space
    });
    if (error) throw new Error(error.message);

    const merchant =
      parsed.merchant && parsed.merchant !== 'Unknown' ? ` (${parsed.merchant})` : '';
    const sign = parsed.type === 'income' ? '+' : '';
    const remaining = await budgetRemainingLine(parsed.category, who.spaceId);

    reply(
      res,
      `✅ Logged: ${sign}${parsed.currency} ${parsed.amount} – ${parsed.category}${merchant}.${remaining}`
    );
  } catch (err) {
    console.error('whatsapp webhook error:', err.message);
    reply(res, `⚠️ Sorry, I couldn't log that. (${err.message})`);
  }
});

export default router;
