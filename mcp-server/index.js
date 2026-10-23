#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// MoiMone Finance MCP server.
// Exposes the user's finance data (balances, spending, budgets, goals) as tools
// any MCP-compatible client (Claude Desktop, Claude Code, Cursor, …) can call.
//
// Read-only. Uses the Supabase service-role key, so it must run locally/trusted
// (same model as the MoiMone backend). Balances are DERIVED from transactions,
// exactly as the app computes them, so this never drifts from the dashboard.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_EMAIL = process.env.MOIMONE_USER_EMAIL;
const CURRENCY = process.env.MOIMONE_CURRENCY || 'LKR';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !USER_EMAIL) {
  console.error('Missing config: set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and MOIMONE_USER_EMAIL.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Resolve the user + the spaces they belong to (cached after first lookup).
let USER = null;
async function getUser() {
  if (USER) return USER;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, personal_space_id')
    .eq('email', USER_EMAIL)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error(`No MoiMone profile found for ${USER_EMAIL}`);
  const { data: members } = await supabase
    .from('space_members')
    .select('space_id')
    .eq('user_id', profile.id);
  const spaceIds = (members || []).map((m) => m.space_id);
  USER = { id: profile.id, spaceIds: spaceIds.length ? spaceIds : [profile.personal_space_id] };
  return USER;
}

function currentPeriod() {
  const d = new Date();
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}
function monthRange(month, year) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, month, 1)).toISOString(),
  };
}

// Per-category + overall totals for a set of transaction rows (mirrors the app).
function summarize(rows) {
  const byCategory = {};
  let totalIncome = 0, totalExpense = 0, totalSaved = 0;
  for (const t of rows) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') totalIncome += amt;
    else if (t.type === 'transfer' && t.goal_id) totalSaved += amt;
    else if (t.type === 'expense') {
      totalExpense += amt;
      byCategory[t.category] = (byCategory[t.category] || 0) + amt;
    }
  }
  const cats = {};
  for (const [k, v] of Object.entries(byCategory)) cats[k] = round(v);
  return {
    totalIncome: round(totalIncome),
    totalExpense: round(totalExpense),
    totalSaved: round(totalSaved),
    net: round(totalIncome - totalExpense - totalSaved),
    byCategory: cats,
  };
}

// Derived account balances: opening_balance + sum of transaction effects.
async function accountBalances(userId) {
  const { data: cards, error } = await supabase.from('cards').select('*').eq('user_id', userId);
  if (error) throw new Error(error.message);
  const list = cards || [];
  const ids = list.map((c) => c.id);
  const effects = Object.fromEntries(ids.map((id) => [id, 0]));
  if (ids.length) {
    const inList = ids.join(',');
    const { data: tx } = await supabase
      .from('transactions')
      .select('amount, type, card_id, to_card_id')
      .or(`card_id.in.(${inList}),to_card_id.in.(${inList})`);
    for (const t of tx || []) {
      const amt = Number(t.amount) || 0;
      if (t.card_id && effects[t.card_id] !== undefined) effects[t.card_id] += t.type === 'income' ? amt : -amt;
      if (t.to_card_id && effects[t.to_card_id] !== undefined) effects[t.to_card_id] += amt;
    }
  }
  return list.map((c) => ({
    name: c.nickname,
    type: c.type,
    balance: round((Number(c.opening_balance) || 0) + (effects[c.id] || 0)),
  }));
}

const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

const server = new McpServer({ name: 'moimone-finance', version: '1.0.0' });

server.tool(
  'financial_overview',
  'Full snapshot of the finances: spendable-now balance, per-account balances, this month and last month (totals + spending by category), current-month budgets with spend, and savings goals.',
  {},
  async () => {
    const { id, spaceIds } = await getUser();
    const { month, year } = currentPeriod();
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const thisR = monthRange(month, year);
    const prevR = monthRange(prevMonth, prevYear);

    const { data: txns, error } = await supabase
      .from('transactions')
      .select('amount, type, category, merchant, transaction_date, goal_id')
      .in('space_id', spaceIds)
      .gte('transaction_date', prevR.start)
      .order('transaction_date', { ascending: false });
    if (error) throw new Error(error.message);

    const inR = (t, r) => t.transaction_date >= r.start && t.transaction_date < r.end;
    const thisSum = summarize((txns || []).filter((t) => inR(t, thisR)));
    const lastSum = summarize((txns || []).filter((t) => inR(t, prevR)));

    const { data: budgetRows } = await supabase
      .from('budgets').select('category, monthly_limit')
      .in('space_id', spaceIds).eq('month', month).eq('year', year);
    const budgets = (budgetRows || []).map((b) => {
      const limit = round(b.monthly_limit);
      const spent = thisSum.byCategory[b.category] || 0;
      return { category: b.category, limit, spent: round(spent), remaining: round(limit - spent) };
    });

    const { data: goalRows } = await supabase
      .from('goals').select('name, target_amount, current_amount, deadline').in('space_id', spaceIds);
    const goals = (goalRows || []).map((g) => ({
      name: g.name, target: round(g.target_amount), saved: round(g.current_amount), deadline: g.deadline || null,
    }));

    const accounts = await accountBalances(id);
    const availableNow = round(
      accounts.filter((a) => a.type === 'debit' || a.type === 'cash').reduce((s, a) => s + a.balance, 0)
    );
    const label = (m, y) => `${String(m).padStart(2, '0')}/${y}`;

    return ok({
      today: new Date().toISOString().slice(0, 10),
      currency: CURRENCY,
      availableNow,
      accounts,
      thisMonth: { label: label(month, year), ...thisSum },
      lastMonth: { label: label(prevMonth, prevYear), ...lastSum },
      budgets,
      goals,
    });
  }
);

server.tool(
  'spending_by_category',
  'Spending broken down by category for a given month (defaults to the current month).',
  { month: z.number().int().min(1).max(12).optional(), year: z.number().int().optional() },
  async ({ month, year }) => {
    const { spaceIds } = await getUser();
    const now = currentPeriod();
    const m = month || now.month, y = year || now.year;
    const r = monthRange(m, y);
    const { data } = await supabase
      .from('transactions')
      .select('amount, type, category, goal_id, transaction_date')
      .in('space_id', spaceIds)
      .gte('transaction_date', r.start)
      .lt('transaction_date', r.end);
    return ok({ month: `${String(m).padStart(2, '0')}/${y}`, currency: CURRENCY, ...summarize(data || []) });
  }
);

server.tool(
  'budget_status',
  'Current-month budgets with how much has been spent and what remains in each (flags any over budget).',
  {},
  async () => {
    const { spaceIds } = await getUser();
    const { month, year } = currentPeriod();
    const r = monthRange(month, year);
    const { data: tx } = await supabase
      .from('transactions').select('amount, type, category, goal_id')
      .in('space_id', spaceIds).gte('transaction_date', r.start).lt('transaction_date', r.end);
    const spent = summarize(tx || []).byCategory;
    const { data: budgetRows } = await supabase
      .from('budgets').select('category, monthly_limit')
      .in('space_id', spaceIds).eq('month', month).eq('year', year);
    const budgets = (budgetRows || []).map((b) => {
      const limit = round(b.monthly_limit);
      const s = spent[b.category] || 0;
      return { category: b.category, limit, spent: round(s), remaining: round(limit - s), over: s > limit };
    });
    return ok({ month: `${String(month).padStart(2, '0')}/${year}`, currency: CURRENCY, budgets });
  }
);

server.tool(
  'account_balances',
  'Current balance of each account, plus the total spendable right now (debit + cash).',
  {},
  async () => {
    const { id } = await getUser();
    const accounts = await accountBalances(id);
    const availableNow = round(
      accounts.filter((a) => a.type === 'debit' || a.type === 'cash').reduce((s, a) => s + a.balance, 0)
    );
    return ok({ currency: CURRENCY, availableNow, accounts });
  }
);

server.tool(
  'recent_transactions',
  'The most recent transactions, newest first, optionally filtered by category.',
  { limit: z.number().int().min(1).max(100).optional(), category: z.string().optional() },
  async ({ limit, category }) => {
    const { spaceIds } = await getUser();
    let q = supabase
      .from('transactions')
      .select('transaction_date, amount, type, category, merchant')
      .in('space_id', spaceIds)
      .order('transaction_date', { ascending: false })
      .limit(limit || 20);
    if (category) q = q.eq('category', category);
    const { data } = await q;
    const transactions = (data || []).map((t) => ({
      date: t.transaction_date.slice(0, 10),
      amount: round(t.amount),
      type: t.type,
      category: t.category,
      merchant: t.merchant || 'Unknown',
    }));
    return ok({ currency: CURRENCY, count: transactions.length, transactions });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('MoiMone Finance MCP server running (stdio).');
