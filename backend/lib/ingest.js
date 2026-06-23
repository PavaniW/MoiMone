import { supabase } from './supabase.js';

// Resolve the owning user + their personal space from an iOS-Shortcut ingest
// token. Each user has a unique token (profiles.ingest_token); their Shortcut
// sends it, so we know whose account a forwarded SMS belongs to.
export async function userByIngestToken(token) {
  if (!token) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, personal_space_id')
    .eq('ingest_token', token)
    .maybeSingle();
  return data ? { userId: data.id, spaceId: data.personal_space_id } : null;
}

// Resolve the user from an inbound WhatsApp sender (e.g. "whatsapp:+9477...").
export async function userByWhatsApp(from) {
  if (!from) return null;
  const number = String(from).replace(/^whatsapp:/, '').trim();
  const { data } = await supabase
    .from('profiles')
    .select('id, personal_space_id')
    .eq('whatsapp_number', number)
    .maybeSingle();
  return data ? { userId: data.id, spaceId: data.personal_space_id } : null;
}
