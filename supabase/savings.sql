-- Historical migration. The goal_id column it adds (step 2) is still in use,
-- but the 'savings' TYPE it introduced (step 1) was later removed — a saving is
-- now a transfer tagged with a goal. The type constraint is superseded by
-- accounts.sql and then drop-savings-type.sql; only run step 2 on a fresh DB.
-- Run once in the Supabase SQL editor.

-- 1. (OBSOLETE — superseded by drop-savings-type.sql) Allowed type = 'savings'.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check CHECK (type IN ('expense', 'income', 'savings'));

-- 2. Optional link to the goal this saving feeds.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_goal ON transactions(goal_id);
