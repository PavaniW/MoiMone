import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase.js';

// First-login setup: create the user's private "Personal" space, make them its
// owner, and create their profile (with a secret ingest token for the iOS
// Shortcut). Returns the personal space id. Idempotent enough for our needs —
// only runs when the user has no profile yet.
async function bootstrap(user) {
  const { data: space, error: e1 } = await supabase
    .from('spaces')
    .insert({ name: 'Personal', kind: 'personal', created_by: user.id })
    .select('id')
    .single();
  if (e1) throw new Error(`bootstrap space: ${e1.message}`);

  const { error: e2 } = await supabase
    .from('space_members')
    .insert({ space_id: space.id, user_id: user.id, role: 'owner' });
  if (e2) throw new Error(`bootstrap membership: ${e2.message}`);

  const { error: e3 } = await supabase.from('profiles').insert({
    id: user.id,
    email: user.email,
    display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
    personal_space_id: space.id,
    ingest_token: randomBytes(24).toString('hex'),
  });
  if (e3) throw new Error(`bootstrap profile: ${e3.message}`);

  return space.id;
}

// Verify the Supabase (Google) session on every API request. On success sets:
//   req.user            — the Supabase user (id, email, ...)
//   req.personalSpaceId — their private default ledger
//   req.spaceIds        — all spaces they can read/write (personal + shared)
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    const user = data.user;

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('personal_space_id')
      .eq('id', user.id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);

    let personalSpaceId;
    let spaceIds;
    if (!profile) {
      personalSpaceId = await bootstrap(user);
      spaceIds = [personalSpaceId];
    } else {
      personalSpaceId = profile.personal_space_id;
      const { data: members, error: mErr } = await supabase
        .from('space_members')
        .select('space_id')
        .eq('user_id', user.id);
      if (mErr) throw new Error(mErr.message);
      spaceIds = (members || []).map((m) => m.space_id);
      if (!spaceIds.length) spaceIds = [personalSpaceId];
    }

    req.user = user;
    req.personalSpaceId = personalSpaceId;
    req.spaceIds = spaceIds;
    next();
  } catch (err) {
    next(err);
  }
}
