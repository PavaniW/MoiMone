import { Router } from 'express';
import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase.js';

const router = Router();

// GET /api/me — the signed-in user, their profile (incl. ingest token for the
// iOS Shortcut), and the spaces they belong to. requireAuth has already run, so
// the personal space + profile are guaranteed to exist.
router.get('/', async (req, res, next) => {
  try {
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('email, display_name, personal_space_id, ingest_token, whatsapp_number')
      .eq('id', req.user.id)
      .single();
    if (pErr) throw new Error(pErr.message);

    const { data: spaces, error: sErr } = await supabase
      .from('spaces')
      .select('id, name, kind')
      .in('id', req.spaceIds)
      .order('kind'); // personal before shared
    if (sErr) throw new Error(sErr.message);

    res.json({
      user: { id: req.user.id, email: profile.email, name: profile.display_name },
      personalSpaceId: profile.personal_space_id,
      ingestToken: profile.ingest_token,
      whatsappNumber: profile.whatsapp_number,
      spaces,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/me/ingest-token — rotate the ingest token (e.g. if it leaked).
// The old token stops working immediately; the iOS Shortcut must be updated.
router.post('/ingest-token', async (req, res, next) => {
  try {
    const token = randomBytes(24).toString('hex');
    const { error } = await supabase
      .from('profiles')
      .update({ ingest_token: token })
      .eq('id', req.user.id);
    if (error) throw new Error(error.message);
    res.json({ ingestToken: token });
  } catch (err) {
    next(err);
  }
});

export default router;
