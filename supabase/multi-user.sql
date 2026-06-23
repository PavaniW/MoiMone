-- Multi-user migration: accounts + "spaces" (private/shared ledgers).
-- Run in the Supabase SQL Editor AFTER schema.sql (and add-card-tracking.sql).
-- Safe to re-run (IF NOT EXISTS / idempotent).
--
-- Model: every transaction/budget/goal belongs to a SPACE (a ledger) and records
-- WHO added it (created_by). Each user gets a private "personal" space on first
-- login; a shared space (Phase 2) is just another space both users are members of.

-- --- Profiles: one row per auth user (display + ingestion identity) ---
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  personal_space_id UUID,                 -- their private default ledger
  ingest_token TEXT UNIQUE,               -- secret for their iOS Shortcut
  whatsapp_number TEXT UNIQUE,            -- maps inbound WhatsApp -> this user
  created_at TIMESTAMPTZ DEFAULT now()
);

-- --- Spaces: a ledger (personal or shared) ---
CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal', 'shared')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- --- Membership: who can see/use a space ---
CREATE TABLE IF NOT EXISTS space_members (
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

-- --- Scope + attribution on the financial tables ---
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES spaces(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE budgets      ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES spaces(id);
ALTER TABLE budgets      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE goals        ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES spaces(id);
ALTER TABLE goals        ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_transactions_space ON transactions(space_id);
CREATE INDEX IF NOT EXISTS idx_budgets_space ON budgets(space_id);
CREATE INDEX IF NOT EXISTS idx_goals_space ON goals(space_id);

-- A budget is now unique per (space, category, month, year) rather than globally,
-- so personal and shared ledgers can each have their own "Food" budget.
ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_category_month_year_key;
ALTER TABLE budgets ADD CONSTRAINT budgets_space_category_month_year_key
  UNIQUE (space_id, category, month, year);

-- --- RLS: deny anon; backend service-role key bypasses (same as schema) ---
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;

-- --- One-time backfill of existing rows -------------------------------------
-- Run this block ONCE, AFTER you (the owner) have signed in for the first time
-- and BEFORE your fiancé signs in (so exactly one personal space exists).
-- It assigns every pre-existing row to that single personal space.
--
--   UPDATE transactions SET
--     space_id  = (SELECT id FROM spaces WHERE kind = 'personal'),
--     created_by = (SELECT created_by FROM spaces WHERE kind = 'personal')
--   WHERE space_id IS NULL;
--
--   UPDATE budgets SET
--     space_id  = (SELECT id FROM spaces WHERE kind = 'personal'),
--     created_by = (SELECT created_by FROM spaces WHERE kind = 'personal')
--   WHERE space_id IS NULL;
--
--   UPDATE goals SET
--     space_id  = (SELECT id FROM spaces WHERE kind = 'personal'),
--     created_by = (SELECT created_by FROM spaces WHERE kind = 'personal')
--   WHERE space_id IS NULL;
