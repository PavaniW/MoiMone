-- Sample data for local development. Run AFTER schema.sql (categories are
-- seeded there). Dates are in June 2026 so they show under "this month" when
-- the app's current month is June 2026; adjust the dates to your current month
-- otherwise. Safe to re-run: clears these three tables first.

TRUNCATE transactions, budgets, goals RESTART IDENTITY;

-- Transactions (newest first in the UI). Sample cards: credit ••4521, debit ••9912.
INSERT INTO transactions (amount, type, category, merchant, source, payment_method, card_last4, transaction_date) VALUES
  (9000.00, 'income',  'Salary',        'ACME Corp',         'manual',   NULL,     NULL,   '2026-06-01T09:00:00Z'),
  (85.50,   'expense', 'Food & Dining', 'Starbucks Arabia',  'sms',      'credit', '4521', '2026-06-18T08:15:00Z'),
  (210.00,  'expense', 'Food & Dining', 'Lulu Hypermarket',  'manual',   'debit',  '9912', '2026-06-17T19:30:00Z'),
  (149.99,  'expense', 'Shopping',      'Noon.com',          'sms',      'credit', '4521', '2026-06-16T13:05:00Z'),
  (32.25,   'expense', 'Transport',     'Uber',              'whatsapp', 'credit', '4521', '2026-06-15T22:40:00Z'),
  (199.00,  'expense', 'Utilities',     'STC',               'email',    'debit',  '9912', '2026-06-14T10:00:00Z'),
  (320.00,  'expense', 'Food & Dining', 'Carrefour',         'manual',   'debit',  '9912', '2026-06-10T18:20:00Z'),
  (540.00,  'expense', 'Shopping',      'Amazon.sa',         'sms',      'credit', '4521', '2026-06-08T15:45:00Z'),
  (95.00,   'expense', 'Entertainment', 'VOX Cinemas',       'manual',   'credit', '4521', '2026-06-07T20:10:00Z'),
  (120.00,  'expense', 'Health',        'Nahdi Pharmacy',    'manual',   'cash',   NULL,   '2026-06-06T11:30:00Z'),
  (180.00,  'expense', 'Transport',     'ADNOC Petrol',      'sms',      'debit',  '9912', '2026-06-03T07:50:00Z');

-- Budgets for June 2026
INSERT INTO budgets (category, monthly_limit, month, year) VALUES
  ('Food & Dining', 1600, 6, 2026),
  ('Shopping',      1000, 6, 2026),
  ('Utilities',      700, 6, 2026),
  ('Transport',      800, 6, 2026),
  ('Entertainment',  500, 6, 2026),
  ('Health',         400, 6, 2026);

-- Saving goals
INSERT INTO goals (name, target_amount, current_amount, deadline, color) VALUES
  ('Emergency Fund', 20000, 8200, '2026-12-31', '#2F6B4F'),
  ('New Laptop',      6000, 2400, '2026-09-01', '#C98A2B');
