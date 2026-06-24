-- Recategorize existing accounts to the new personal category set.
-- Categories are per-user; transactions/budgets store `category` as TEXT, so
-- renames/remaps update those columns too (otherwise old rows would orphan).
-- Idempotent enough to run once. Run in the Supabase SQL editor.
--
-- Keep in sync with backend/lib/categories.js (DEFAULT_CATEGORIES).

BEGIN;

-- 1. Rename: Food & Dining -> Eating Out (sit-down meals, dates, friends).
UPDATE transactions SET category = 'Eating Out' WHERE category = 'Food & Dining';
UPDATE budgets      SET category = 'Eating Out' WHERE category = 'Food & Dining';
UPDATE categories SET name = 'Eating Out', icon = '🍽️', color = '#F4845F'
  WHERE name = 'Food & Dining';

-- 2. Drop Shopping -> its history becomes Groceries.
UPDATE transactions SET category = 'Groceries' WHERE category = 'Shopping';
UPDATE budgets      SET category = 'Groceries' WHERE category = 'Shopping';
DELETE FROM categories WHERE name = 'Shopping';

-- 3. Refresh icon/colour on the kept categories to match the new palette.
UPDATE categories SET icon = '🚗', color = '#4ECDC4' WHERE name = 'Transport';
UPDATE categories SET icon = '🎬', color = '#FFB703' WHERE name = 'Entertainment';
UPDATE categories SET icon = '💡', color = '#96CEB4' WHERE name = 'Utilities';
UPDATE categories SET icon = '💊', color = '#DDA0DD' WHERE name = 'Health';
UPDATE categories SET icon = '💰', color = '#90EE90' WHERE name = 'Salary';
UPDATE categories SET icon = '📦', color = '#D3D3D3' WHERE name = 'Other';

-- 4. Add the new categories to every existing account (skip if already present).
INSERT INTO categories (user_id, name, icon, color)
SELECT p.id, c.name, c.icon, c.color
FROM profiles p
CROSS JOIN (VALUES
  ('Groceries',            '🛒', '#FF6B6B'),
  ('Coffee & Snacks',      '☕', '#C08552'),
  ('Clothing',             '👗', '#45B7D1'),
  ('Beauty & Grooming',    '💄', '#E27396'),
  ('Gifts & Celebrations', '🎁', '#B5179E'),
  ('Travel',               '✈️', '#2A9D8F'),
  ('Subscriptions',        '📱', '#6A4C93'),
  ('Phone & Internet',     '📶', '#577590'),
  ('Household',            '🏠', '#8D6E63'),
  ('Other Income',         '💵', '#57CC99')
) AS c(name, icon, color)
ON CONFLICT (user_id, name) DO NOTHING;

COMMIT;
