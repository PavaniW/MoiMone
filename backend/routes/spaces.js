import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// GET /api/spaces — the spaces this user belongs to, each with its members
// (name + email, and which one is you). Personal space(s) first.
router.get('/', async (req, res, next) => {
  try {
    const { data: spaces, error: sErr } = await supabase
      .from('spaces')
      .select('id, name, kind, created_by')
      .in('id', req.spaceIds)
      .order('kind'); // 'personal' < 'shared'
    if (sErr) throw new Error(sErr.message);

    const { data: members, error: mErr } = await supabase
      .from('space_members')
      .select('space_id, user_id, role')
      .in('space_id', req.spaceIds);
    if (mErr) throw new Error(mErr.message);

    const ids = [...new Set((members || []).map((m) => m.user_id))];
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    if (pErr) throw new Error(pErr.message);
    const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

    const out = (spaces || []).map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      isOwner: s.created_by === req.user.id,
      members: (members || [])
        .filter((m) => m.space_id === s.id)
        .map((m) => ({
          userId: m.user_id,
          role: m.role,
          name: byId[m.user_id]?.display_name || byId[m.user_id]?.email || 'Member',
          email: byId[m.user_id]?.email || null,
          isYou: m.user_id === req.user.id,
        })),
    }));
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// POST /api/spaces — create a shared household space; creator becomes owner.
// Body: { name? }.
router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim() || 'Shared';
    const { data: space, error } = await supabase
      .from('spaces')
      .insert({ name, kind: 'shared', created_by: req.user.id })
      .select('id, name, kind')
      .single();
    if (error) throw new Error(error.message);

    const { error: mErr } = await supabase
      .from('space_members')
      .insert({ space_id: space.id, user_id: req.user.id, role: 'owner' });
    if (mErr) throw new Error(mErr.message);

    res.status(201).json(space);
  } catch (err) {
    next(err);
  }
});

// POST /api/spaces/:id/members — add a member by email. The target must have
// signed in at least once (so a profile exists). Body: { email }.
router.post('/:id/members', async (req, res, next) => {
  try {
    const spaceId = req.params.id;
    if (!req.spaceIds.includes(spaceId)) throw badRequest('not your space');

    // Only the owner can add members (matches the UI).
    const { data: space, error: spErr } = await supabase
      .from('spaces')
      .select('created_by')
      .eq('id', spaceId)
      .maybeSingle();
    if (spErr) throw new Error(spErr.message);
    if (!space || space.created_by !== req.user.id) {
      throw badRequest('only the owner can add members');
    }

    const email = String(req.body?.email || '').trim();
    if (!email) throw badRequest('email is required');

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .ilike('email', email)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) {
      throw badRequest('No MoiMone account with that email. Ask them to sign in once first, then try again.');
    }
    if (profile.id === req.user.id) throw badRequest("That's your own account — you're already a member.");

    const { error: insErr } = await supabase
      .from('space_members')
      .upsert(
        { space_id: spaceId, user_id: profile.id, role: 'member' },
        { onConflict: 'space_id,user_id', ignoreDuplicates: true }
      );
    if (insErr) throw new Error(insErr.message);

    res.status(201).json({
      userId: profile.id,
      name: profile.display_name || profile.email,
      email: profile.email,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/spaces/:id/members/:userId — leave a shared space (yourself), or
// remove someone if you're the owner. Personal spaces can't be modified.
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const spaceId = req.params.id;
    if (!req.spaceIds.includes(spaceId)) throw badRequest('not your space');

    const { data: space, error: sErr } = await supabase
      .from('spaces')
      .select('kind, created_by')
      .eq('id', spaceId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!space) throw badRequest('space not found');
    if (space.kind === 'personal') throw badRequest("you can't modify your personal space");

    const target = req.params.userId;
    const isOwner = space.created_by === req.user.id;
    if (target !== req.user.id && !isOwner) throw badRequest('only the owner can remove other members');

    // The owner can't abandon a space that still has other members (would orphan it).
    if (target === req.user.id && isOwner) {
      const { count } = await supabase
        .from('space_members')
        .select('*', { count: 'exact', head: true })
        .eq('space_id', spaceId);
      if ((count || 0) > 1) {
        throw badRequest('You own this space — remove the other members before leaving.');
      }
    }

    const { error } = await supabase
      .from('space_members')
      .delete()
      .eq('space_id', spaceId)
      .eq('user_id', target);
    if (error) throw new Error(error.message);

    res.json({ removed: target });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/spaces/:id — owner deletes a shared space AND everything in it.
// (space_id has no ON DELETE CASCADE on the data tables, so remove child rows
// first; space_members cascades when the space row is deleted.)
router.delete('/:id', async (req, res, next) => {
  try {
    const spaceId = req.params.id;
    if (!req.spaceIds.includes(spaceId)) throw badRequest('not your space');

    const { data: space, error: sErr } = await supabase
      .from('spaces')
      .select('kind, created_by')
      .eq('id', spaceId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!space) throw badRequest('space not found');
    if (space.kind === 'personal') throw badRequest("you can't delete your personal space");
    if (space.created_by !== req.user.id) throw badRequest('only the owner can delete this space');

    for (const table of ['transactions', 'budgets', 'goals']) {
      const { error } = await supabase.from(table).delete().eq('space_id', spaceId);
      if (error) throw new Error(error.message);
    }
    const { error: delErr } = await supabase.from('spaces').delete().eq('id', spaceId);
    if (delErr) throw new Error(delErr.message);

    res.json({ deleted: spaceId });
  } catch (err) {
    next(err);
  }
});

export default router;
