-- Savings as a third transaction type, optionally linked to a goal.
-- A "savings" transaction is money set aside — not income, not spending. When
-- linked to a goal, it contributes to that goal's progress.
-- Run once in the Supabase SQL editor.

-- 1. Allow type = 'savings' alongside expense/income.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check CHECK (type IN ('expense', 'income', 'savings'));

-- 2. Optional link to the goal this saving feeds.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_goal ON transactions(goal_id);
