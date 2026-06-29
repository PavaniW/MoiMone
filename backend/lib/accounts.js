import { supabase } from './supabase.js';

// Balances are DERIVED, never mutated in place: a card's current balance is its
// opening_balance plus the sum of its transactions' effects. This makes a missed
// or failed update structurally impossible — the balance is always exactly the
// sum of the records.

// Effect of the transactions on each of the given card ids:
//   expense → −amount (from card_id)
//   income  → +amount (to card_id)
//   transfer→ −amount from card_id, +amount to to_card_id
async function effectsByCard(cardIds) {
  const map = Object.fromEntries(cardIds.map((id) => [id, 0]));
  if (!cardIds.length) return map;
  const list = cardIds.join(',');
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, type, card_id, to_card_id')
    .or(`card_id.in.(${list}),to_card_id.in.(${list})`);
  if (error) throw new Error(error.message);
  for (const t of data || []) {
    const amt = Number(t.amount) || 0;
    if (t.card_id && map[t.card_id] !== undefined) {
      map[t.card_id] += t.type === 'income' ? amt : -amt; // income +, expense/transfer-from −
    }
    if (t.to_card_id && map[t.to_card_id] !== undefined) {
      map[t.to_card_id] += amt; // transfer destination +
    }
  }
  return map;
}

// The user's cards, each with its derived current `balance`.
export async function cardsWithBalances(userId) {
  const { data: cards, error } = await supabase
    .from('cards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const list = cards || [];
  const fx = await effectsByCard(list.map((c) => c.id));
  return list.map((c) => ({
    ...c,
    balance: Math.round((Number(c.opening_balance || 0) + (fx[c.id] || 0)) * 100) / 100,
  }));
}

// Set a card's CURRENT balance to an exact figure — used by a manual edit in the
// app and by an SMS "available balance" (both mean "the true balance is X"). We
// store the opening so that opening + effects == X.
export async function setCardBalance(cardId, target, userId) {
  if (!cardId || target == null || target === '') return;
  const fx = await effectsByCard([cardId]);
  const opening = Math.round((Number(target) - (fx[cardId] || 0)) * 100) / 100;
  await supabase
    .from('cards')
    .update({ opening_balance: opening, opening_set_at: new Date().toISOString() })
    .eq('id', cardId)
    .eq('user_id', userId);
}

// The user's accounts as {id, nickname, bank, type}, for name-matching a parsed
// transfer ("from HSBC to Sampath") back to real account ids.
export async function userAccounts(userId) {
  const { data } = await supabase
    .from('cards')
    .select('id, nickname, bank, type')
    .eq('user_id', userId);
  return data || [];
}

// Match a free-text account name to one of the user's accounts. Case-insensitive:
// exact nickname/bank first, then substring either direction (so "HSBC" finds
// "HSBC Visa"). Returns the account row or null.
export function matchAccountByName(accounts, name) {
  const q = String(name ?? '').trim().toLowerCase();
  if (!q) return null;
  const norm = (s) => String(s || '').trim().toLowerCase();
  let hit = accounts.find((a) => norm(a.nickname) === q || norm(a.bank) === q);
  if (hit) return hit;
  return (
    accounts.find((a) => {
      const n = norm(a.nickname);
      const b = norm(a.bank);
      return (n && (n.includes(q) || q.includes(n))) || (b && (b.includes(q) || q.includes(b)));
    }) || null
  );
}

// Ensure the user has a "Cash" account; returns its id. Seeded on first access.
export async function ensureCashAccount(userId) {
  const { data } = await supabase
    .from('cards')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'cash')
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id;
  const { data: created, error } = await supabase
    .from('cards')
    .insert({ user_id: userId, nickname: 'Cash', type: 'cash', opening_balance: 0, opening_set_at: new Date().toISOString() })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}
