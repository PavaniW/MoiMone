import { supabase } from './supabase.js';

// Normalize a merchant name to a stable lookup key.
export function normalizeMerchant(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Return the learned category for a user's merchant, or null if none.
// Resilient: merchant rules are an enhancement, so any failure (e.g. the table
// not migrated yet) falls back to null rather than breaking ingestion.
export async function categoryForMerchant(userId, merchant) {
  const key = normalizeMerchant(merchant);
  if (!key || key === 'unknown') return null;
  try {
    const { data, error } = await supabase
      .from('merchant_rules')
      .select('category')
      .eq('user_id', userId)
      .eq('merchant', key)
      .maybeSingle();
    if (error) throw error;
    return data?.category || null;
  } catch (err) {
    console.warn('merchant rule lookup skipped:', err.message);
    return null;
  }
}

// Remember (upsert) how this user categorizes a merchant.
export async function rememberMerchant(userId, merchant, category) {
  const key = normalizeMerchant(merchant);
  if (!key || key === 'unknown' || !category) return;
  const { error } = await supabase
    .from('merchant_rules')
    .upsert({ user_id: userId, merchant: key, category }, { onConflict: 'user_id,merchant' });
  if (error) throw new Error(error.message);
}
