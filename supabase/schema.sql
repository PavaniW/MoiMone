-- Personal Finance Tracker — database schema (Supabase / Postgres)
-- Run in the Supabase SQL editor, or: supabase db reset / psql -f schema.sql

-- Transactions: every income or expense
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  category TEXT NOT NULL,
  merchant TEXT,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('sms', 'email', 'whatsapp', 'manual')),
  raw_text TEXT,                    -- original SMS/email text for debugging
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Budgets: monthly spending limits per category
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  monthly_limit DECIMAL(10,2) NOT NULL,
  month INT NOT NULL,               -- 1–12
  year INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category, month, year)
);

-- Saving Goals
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,               -- e.g. "Emergency Fund", "New Laptop"
  target_amount DECIMAL(10,2) NOT NULL,
  current_amount DECIMAL(10,2) DEFAULT 0,
  deadline DATE,
  color TEXT,                       -- hex color for UI
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories list (can be seeded with defaults)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,        -- e.g. "Food", "Transport", "Shopping"
  icon TEXT,                        -- emoji or icon name
  color TEXT                        -- hex color
);

-- Seed default categories
INSERT INTO categories (name, icon, color) VALUES
  ('Food & Dining', '🍽️', '#FF6B6B'),
  ('Transport', '🚗', '#4ECDC4'),
  ('Shopping', '🛍️', '#45B7D1'),
  ('Utilities', '💡', '#96CEB4'),
  ('Entertainment', '🎬', '#FFEAA7'),
  ('Health', '💊', '#DDA0DD'),
  ('Salary', '💰', '#90EE90'),
  ('Other', '📦', '#D3D3D3');
