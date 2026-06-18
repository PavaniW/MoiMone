-- Row-Level Security (RLS). Run in the Supabase SQL Editor AFTER schema.sql.
--
-- How this works with our architecture:
--   • The BACKEND connects with the Supabase secret / service_role key, which
--     BYPASSES RLS — so the API keeps full read/write access. Nothing to change
--     there.
--   • Enabling RLS with NO public policies means the anon / publishable key
--     (and anyone hitting Supabase's public REST API directly) gets ZERO access
--     by default. That's exactly what we want for a backend-only app: all reads
--     and writes go through the authenticated backend, never straight from a
--     browser.
--
-- If you later add direct client-side Supabase access (e.g. per-user logins),
-- add explicit policies below (e.g. USING (auth.uid() = user_id)).

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories    ENABLE ROW LEVEL SECURITY;

-- No policies are defined on purpose → anon/public is denied all access.
-- (Do NOT use FORCE ROW LEVEL SECURITY — that would also block the backend's
--  service_role key, which we rely on.)
