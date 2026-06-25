import { Router } from 'express';
import twilio from 'twilio';
import { parseTransaction, DEFAULT_CURRENCY } from '../services/parser.js';
import { userCategoryNames } from '../lib/categories.js';
import { categoryForMerchant } from '../lib/merchant-rules.js';
import { toLKR } from '../lib/fx.js';
import { goalsForSpace, matchGoal, addToGoal } from '../lib/goals.js';
import { setAccountBalance, bumpAccount, userAccounts, matchAccountByName } from '../lib/accounts.js';
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
    .select('amount, type, category, goal_id')
    .eq('space_id', spaceId)
    .gte('transaction_date', since);

  let spent = 0;
  let saved = 0;
  const byCat = {};
  for (const t of data || []) {
    const a = Number(t.amount);
    if (t.type === 'transfer') {
      if (t.goal_id) saved += a; // goal-tagged transfer = a saving
      continue; // plain transfers just move money between accounts
    }
    if (t.type !== 'expense') continue; // skip income
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
    const accounts = await userAccounts(who.userId);
    const parsed = await parseTransaction(body, {
      categories,
      goals: goals.map((g) => g.name),
      accounts: accounts.map((a) => a.nickname),
    });

    // Convert foreign-currency amounts to LKR (we store everything in LKR).
    const fx = await toLKR(parsed.amount, parsed.currency);
    const amount = fx ? fx.lkr : parsed.amount;
    const orig = fx ? ` (${fx.currency} ${fx.original})` : '';
    const description = fx ? `Originally ${fx.currency} ${fx.original}` : null;
    const base = { amount, description, source: 'whatsapp', raw_text: body, created_by: who.userId, space_id: who.spaceId };
    const dated = parsed.date ? { transaction_date: parsed.date } : {};

    // --- Transfer: between accounts and/or toward a goal (a "saving") ---
    if (parsed.type === 'transfer') {
      const goal = matchGoal(goals, parsed.goal);
      const fromAcct = matchAccountByName(accounts, parsed.from_account);
      const toAcct = matchAccountByName(accounts, parsed.to_account);
      const { error } = await supabase.from('transactions').insert({
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
      });
      if (error) throw new Error(error.message);
      if (fromAcct) await bumpAccount(fromAcct.id, -amount, who.userId);
      if (toAcct) await bumpAccount(toAcct.id, amount, who.userId);
      if (goal) await addToGoal(goal.id, amount, who.spaceId);

      if (goal) {
        return reply(res, `💰 Saved ${DEFAULT_CURRENCY} ${amount}${orig} toward ${goal.name}.`);
      }
      const route = fromAcct && toAcct ? ` (${fromAcct.nickname} → ${toAcct.nickname})` : '';
      return reply(res, `🔁 Transferred ${DEFAULT_CURRENCY} ${amount}${orig}${route}.`);
    }

    // --- Expense / income ---
    // Learned merchant rule overrides the LLM's category guess.
    let category = parsed.category;
    const learned = await categoryForMerchant(who.userId, parsed.merchant);
    if (learned) category = learned;

    const card = await matchUserCard(who.userId, parsed.card_last4);

    const { error } = await supabase.from('transactions').insert({
      ...base,
      ...dated,
      type: parsed.type,
      category,
      merchant: parsed.merchant,
      payment_method: card ? card.type : parsed.payment_method,
      card_last4: parsed.card_last4,
      card_id: card ? card.id : null,
      goal_id: null,
    });
    if (error) throw new Error(error.message);

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
