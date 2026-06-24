import { Router } from 'express';
import twilio from 'twilio';
import { parseTransaction, DEFAULT_CURRENCY } from '../services/parser.js';
import { userCategoryNames } from '../lib/categories.js';
import { categoryForMerchant } from '../lib/merchant-rules.js';
import { toLKR } from '../lib/fx.js';
import { goalsForSpace, matchGoal, addToGoal } from '../lib/goals.js';
import { setAccountBalance, bumpAccount } from '../lib/accounts.js';
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

// On-demand weekly summary: total spent in the last 7 days + top category.
async function weeklySummaryLine(spaceId) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('transactions')
    .select('amount, type, category')
    .eq('space_id', spaceId)
    .gte('transaction_date', since);

  let spent = 0;
  let saved = 0;
  const byCat = {};
  for (const t of data || []) {
    const a = Number(t.amount);
    if (t.type === 'savings') {
      saved += a;
      continue;
    }
    if (t.type !== 'expense') continue; // skip income + transfers
    spent += a;
    byCat[t.category] = (byCat[t.category] || 0) + a;
  }
  if (!spent && !saved) return '📊 This week: nothing logged yet.';
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const topPart = top ? `, top: ${top[0]} (${DEFAULT_CURRENCY} ${top[1].toFixed(2)})` : '';
  const savedPart = saved ? ` Saved ${DEFAULT_CURRENCY} ${saved.toFixed(2)}.` : '';
  return `📊 This week you've spent ${DEFAULT_CURRENCY} ${spent.toFixed(2)}${topPart}.${savedPart}`;
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

    // On-demand command: weekly summary.
    if (['summary', 'week', 'report'].includes(body.toLowerCase())) {
      return reply(res, await weeklySummaryLine(who.spaceId));
    }

    const categories = await userCategoryNames(who.userId);
    const goals = await goalsForSpace(who.spaceId);
    const parsed = await parseTransaction(body, { categories, goals: goals.map((g) => g.name) });

    const isSavings = parsed.type === 'savings';
    const goal = isSavings ? matchGoal(goals, parsed.goal) : null;

    // Learned merchant rule overrides the LLM's category guess (non-savings only).
    let category = parsed.category;
    if (!isSavings) {
      const learned = await categoryForMerchant(who.userId, parsed.merchant);
      if (learned) category = learned;
    }

    const card = isSavings ? null : await matchUserCard(who.userId, parsed.card_last4);

    // Convert foreign-currency amounts to LKR (we store everything in LKR).
    const fx = await toLKR(parsed.amount, parsed.currency);
    const amount = fx ? fx.lkr : parsed.amount;

    const { error } = await supabase.from('transactions').insert({
      amount,
      type: parsed.type,
      category: isSavings ? 'Savings' : category,
      merchant: isSavings ? null : parsed.merchant,
      description: fx ? `Originally ${fx.currency} ${fx.original}` : null,
      payment_method: isSavings ? null : card ? card.type : parsed.payment_method,
      card_last4: isSavings ? null : parsed.card_last4,
      card_id: isSavings ? null : card ? card.id : null,
      goal_id: isSavings ? (goal ? goal.id : null) : null,
      source: 'whatsapp',
      raw_text: body,
      created_by: who.userId,
      space_id: who.spaceId, // user's private space
      // Use the date from the message when the parser found one; else default now().
      ...(parsed.date ? { transaction_date: parsed.date } : {}),
    });
    if (error) throw new Error(error.message);

    const orig = fx ? ` (${fx.currency} ${fx.original})` : '';

    // Keep the linked account's balance fresh (same rule as the SMS webhook).
    if (card) {
      if (parsed.account_balance != null) {
        await setAccountBalance(card.id, parsed.account_balance, who.userId);
      } else if (parsed.type === 'income') {
        await bumpAccount(card.id, amount, who.userId);
      } else if (parsed.type === 'expense') {
        await bumpAccount(card.id, -amount, who.userId);
      }
    }

    if (isSavings) {
      if (goal) await addToGoal(goal.id, amount, who.spaceId);
      const toGoal = goal ? ` toward ${goal.name}` : '';
      return reply(res, `💰 Saved ${DEFAULT_CURRENCY} ${amount}${orig}${toGoal}.`);
    }

    const merchant =
      parsed.merchant && parsed.merchant !== 'Unknown' ? ` (${parsed.merchant})` : '';
    const sign = parsed.type === 'income' ? '+' : '';
    const remaining = await budgetRemainingLine(category, who.spaceId);

    reply(
      res,
      `✅ Logged: ${sign}${DEFAULT_CURRENCY} ${amount}${orig} – ${category}${merchant}.${remaining}`
    );
  } catch (err) {
    console.error('whatsapp webhook error:', err.message);
    reply(res, `⚠️ Sorry, I couldn't log that. (${err.message})`);
  }
});

export default router;
