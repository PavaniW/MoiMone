-- Merchant memory / auto-learn.
-- Remembers how a user categorizes a given merchant, so future auto-imported
-- transactions (bank SMS / WhatsApp) from that merchant skip the LLM guess and
-- use the learned category. Per-user (matches categories + ingestion attribution).
--
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant TEXT NOT NULL,            -- normalized key: trimmed, lowercased
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, merchant)
);

CREATE INDEX IF NOT EXISTS idx_merchant_rules_user ON merchant_rules(user_id);

-- RLS on; backend service-role bypasses (same pattern as the other tables).
ALTER TABLE merchant_rules ENABLE ROW LEVEL SECURITY;
