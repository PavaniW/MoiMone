-- Remove the obsolete 'savings' transaction type.
--
-- A "saving" is no longer its own type — it's a transfer tagged with a goal
-- (saving = money moved toward a goal). The type set is therefore just
-- expense / income / transfer. This supersedes supabase/savings.sql, whose
-- 'savings' type is now unused.
--
-- Safe to run once the last type='savings' row is gone (the app no longer
-- creates them). If any remain, convert or delete them first, otherwise the
-- new CHECK will fail to validate.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check CHECK (type IN ('expense', 'income', 'transfer'));
