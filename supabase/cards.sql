-- Cards: each user's registered payment cards. Run AFTER multi-user.sql.
-- A card belongs to a person (not a space). Transactions can link to a card,
-- and incoming SMS auto-link by matching the last 4 digits.

CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,                 -- e.g. "HSBC Visa"
  bank TEXT,                              -- e.g. "HSBC"
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  last4 TEXT,                             -- used to auto-match bank SMS
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_user_last4 ON cards(user_id, last4);

-- Link a transaction to a registered card (kept alongside payment_method/card_last4,
-- which stay as a fallback for unmatched/manual cash/other entries).
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES cards(id) ON DELETE SET NULL;

-- RLS on; backend service-role bypasses (same pattern as the other tables).
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
