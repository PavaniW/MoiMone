import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase.js';

// Ensure the user has a profile + a private "Personal" space, returning its id.
// Race-safe: the profile row (PK = user id) is claimed first as a per-user lock,
// so concurrent first-login requests can't create duplicate spaces. The loser of
// the race just waits for the winner to finish.
async function ensurePersonalSpace(user) {
  // Fast path — already set up.
  const existing = await supabase
    .from('profiles')
    .select('personal_space_id')
    .eq('id', user.id)
    .maybeSingle();
  if (existing.data?.personal_space_id) return existing.data.personal_space_id;

  // Claim the profile row (only one concurrent request can win this insert).
  const { error: claimErr } = await supabase.from('profiles').insert({
    id: user.id,
    email: user.email,
    display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
    ingest_token: randomBytes(24).toString('hex'),
  });

  if (!claimErr) {
    // Won the claim — create the personal space, membership, then link it.
    const { data: space, error: se } = await supabase
      .from('spaces')
      .insert({ name: 'Personal', kind: 'personal', created_by: user.id })
      .select('id')
      .single();
    if (se) throw new Error(`bootstrap space: ${se.message}`);

    const { error: me } = await supabase
      .from('space_members')
      .upsert({ space_id: space.id, user_id: user.id, role: 'owner' }, { onConflict: 'space_id,user_id' });
    if (me) throw new Error(`bootstrap member: ${me.message}`);

    await supabase.from('profiles').update({ personal_space_id: space.id }).eq('id', user.id);
    return space.id;
  }

  // 23505 = unique violation → another request is mid-bootstrap. Poll for it.
  if (claimErr.code !== '23505') throw new Error(`bootstrap profile: ${claimErr.message}`);
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 120));
    const { data } = await supabase
      .from('profiles')
      .select('personal_space_id')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.personal_space_id) return data.personal_space_id;
  }
  throw new Error('account setup is taking too long — please retry');
}

// Verify the Supabase (Google) session on every API request. On success sets:
//   req.user, req.personalSpaceId, req.spaceIds (all spaces the user can access)
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

    const personalSpaceId = await ensurePersonalSpace(user);

    const { data: members, error: mErr } = await supabase
      .from('space_members')
      .select('space_id')
      .eq('user_id', user.id);
    if (mErr) throw new Error(mErr.message);
    const spaceIds = (members || []).map((m) => m.space_id);

    req.user = user;
    req.personalSpaceId = personalSpaceId;
    req.spaceIds = spaceIds.length ? spaceIds : [personalSpaceId];
    next();
  } catch (err) {
    next(err);
  }
}
