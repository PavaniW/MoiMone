-- Per-user categories.
-- Originally `categories` was a single global table (UNIQUE on name) shared by
-- everyone. This migration makes categories private to each account, matching
-- the rest of MoiMone's private-by-default model. Defaults are seeded per user
-- by the backend on first access (see backend/lib/categories.js), so we just
-- drop the old global rows here.
--
-- Run once in the Supabase SQL editor.

-- 1. Ownership + bookkeeping columns.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- 2. Drop the old global "name must be unique" rule.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;

-- 3. Remove the original ownerless seed rows (each user is seeded their own).
DELETE FROM categories WHERE user_id IS NULL;

-- 4. Names are now unique per user, not globally.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_user_name_key;
ALTER TABLE categories ADD CONSTRAINT categories_user_name_key UNIQUE (user_id, name);

-- 5. Fast lookups by owner.
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
