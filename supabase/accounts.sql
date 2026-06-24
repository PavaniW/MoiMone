-- Accounts & balances.
-- Generalize "cards" into accounts: credit / debit / cash / bank, each with a
-- running balance. Add a "transfer" transaction type that moves money between
-- two accounts (excluded from spending/income). Run once in the Supabase SQL editor.

-- 1. Account kinds + balance on the cards (accounts) table.
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_type_check;
ALTER TABLE cards ADD CONSTRAINT cards_type_check CHECK (type IN ('credit', 'debit', 'cash', 'bank'));
ALTER TABLE cards ADD COLUMN IF NOT EXISTS balance DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- 2. Transfers: new transaction type + a destination account.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check CHECK (type IN ('expense', 'income', 'savings', 'transfer'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_card_id UUID REFERENCES cards(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_to_card ON transactions(to_card_id);
