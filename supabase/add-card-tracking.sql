-- Migration: track which card a transaction used (credit / debit) and its
-- last 4 digits. Run in the Supabase SQL Editor on a database that was already
-- created from an earlier schema.sql. Safe to re-run (IF NOT EXISTS).
--
-- Fresh installs don't need this — schema.sql already includes both columns.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IN ('credit', 'debit', 'cash', 'other')),
  ADD COLUMN IF NOT EXISTS card_last4 TEXT;
