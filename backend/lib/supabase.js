import { createClient } from '@supabase/supabase-js';

// Server-side client. Uses the service-role key so the backend can read/write
// regardless of row-level security. NEVER expose this key to the frontend.
//
// The real client is created lazily on first use so that importing this module
// (e.g. when the server boots without a configured .env) never throws — only
// an actual DB call will, with a clear message.
let client = null;

function init() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!client) client = init();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }
);
