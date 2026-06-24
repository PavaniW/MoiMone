import { supabase } from './supabase.js';

// Adjust an account's balance by delta (expense −, income +, transfer moves it).
export async function bumpAccount(cardId, delta, userId) {
  if (!cardId || !delta) return;
  const { data } = await supabase
    .from('cards')
    .select('balance')
    .eq('id', cardId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from('cards')
    .update({ balance: Math.round((Number(data.balance) + delta) * 100) / 100 })
    .eq('id', cardId)
    .eq('user_id', userId);
}

// Set an account's balance absolutely (from an SMS "available balance", or a
// manual set in the app). Balances can be negative (e.g. credit card debt).
export async function setAccountBalance(cardId, balance, userId) {
  if (!cardId) return;
  await supabase
    .from('cards')
    .update({ balance: Math.round(Number(balance) * 100) / 100 })
    .eq('id', cardId)
    .eq('user_id', userId);
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
    .insert({ user_id: userId, nickname: 'Cash', type: 'cash', balance: 0 })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}
