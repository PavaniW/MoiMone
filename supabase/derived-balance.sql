-- Account balances are now DERIVED, never mutated in place.
--
-- A card's current balance = opening_balance + the sum of its transactions'
-- effects (expense −, income +, transfer from−/to+). This makes the balance
-- impossible to desync from the records: a missed or failed update can't happen,
-- because there is no separate balance to update — it's computed on read.
--
-- The old `cards.balance` column is left in place (vestigial) so nothing breaks;
-- it is no longer read for the current balance.
--
-- Run once in the Supabase SQL editor. After running it, the app's one-off
-- backfill sets opening_balance for existing cards so displayed balances don't
-- change (opening_balance = old balance − sum of effects).
ALTER TABLE cards ADD COLUMN IF NOT EXISTS opening_balance NUMERIC NOT NULL DEFAULT 0;
-- When the balance was last set/reconciled (shown as "balance set <when>").
ALTER TABLE cards ADD COLUMN IF NOT EXISTS opening_set_at TIMESTAMPTZ;
