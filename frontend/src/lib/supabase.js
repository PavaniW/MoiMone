import { createClient } from '@supabase/supabase-js';

// Browser AUTH client — handles Google sign-in, session persistence, and token
// refresh. Uses ONLY the public anon key (safe to ship to the browser); the
// service-role key stays on the backend. All app data still goes through our
// own API, which verifies the token this client provides.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// True only when both env vars are present. Lets the UI show a clear setup
// message instead of crashing if they're missing (placeholders keep
// createClient from throwing).
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
