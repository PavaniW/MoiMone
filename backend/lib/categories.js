import { supabase } from './supabase.js';

// The starter set every new account is seeded with (name, icon, color).
// Keep in sync with supabase/recategorize.sql (the migration for existing users).
export const DEFAULT_CATEGORIES = [
  { name: 'Groceries', icon: '🛒', color: '#FF6B6B' },
  { name: 'Eating Out', icon: '🍽️', color: '#F4845F' },
  { name: 'Coffee & Snacks', icon: '☕', color: '#C08552' },
  { name: 'Transport', icon: '🚗', color: '#4ECDC4' },
  { name: 'Clothing', icon: '👗', color: '#45B7D1' },
  { name: 'Beauty & Grooming', icon: '💄', color: '#E27396' },
  { name: 'Gifts & Celebrations', icon: '🎁', color: '#B5179E' },
  { name: 'Travel', icon: '✈️', color: '#2A9D8F' },
  { name: 'Entertainment', icon: '🎬', color: '#FFB703' },
  { name: 'Subscriptions', icon: '📱', color: '#6A4C93' },
  { name: 'Phone & Internet', icon: '📶', color: '#577590' },
  { name: 'Utilities', icon: '💡', color: '#96CEB4' },
  { name: 'Health', icon: '💊', color: '#DDA0DD' },
  { name: 'Household', icon: '🏠', color: '#8D6E63' },
  { name: 'Salary', icon: '💰', color: '#90EE90' },
  { name: 'Other Income', icon: '💵', color: '#57CC99' },
  { name: 'Other', icon: '📦', color: '#D3D3D3' },
];

// "Other" is the parser's fallback category — it must always exist and keep its
// name, so we block deleting/renaming it.
export const PROTECTED_CATEGORY = 'Other';

// Return a user's categories, seeding the defaults on first access. Seeding is
// idempotent: the (user_id, name) unique constraint + ignoreDuplicates makes
// concurrent first-time requests safe.
export async function listUserCategories(userId) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, icon, color')
    .eq('user_id', userId)
    .order('name');
  if (error) throw new Error(error.message);
  if (data && data.length) return data;

  // First access for this user — seed defaults, then read back.
  const rows = DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id: userId }));
  const { error: seedErr } = await supabase
    .from('categories')
    .upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true });
  if (seedErr) throw new Error(seedErr.message);

  const { data: seeded, error: reErr } = await supabase
    .from('categories')
    .select('id, name, icon, color')
    .eq('user_id', userId)
    .order('name');
  if (reErr) throw new Error(reErr.message);
  return seeded || [];
}

// Just the category names for a user — used to tell the parser which categories
// are valid for this account.
export async function userCategoryNames(userId) {
  const cats = await listUserCategories(userId);
  return cats.map((c) => c.name);
}
