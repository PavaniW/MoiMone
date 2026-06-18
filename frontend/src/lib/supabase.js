import { createClient } from '@supabase/supabase-js';

// Browser client — uses the public anon key. Real reads/writes should go
// through the backend API for anything sensitive.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url || '', anonKey || '');
