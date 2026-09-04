import { Router } from 'express';
import twilio from 'twilio';
import { supabase } from '../lib/supabase.js';
import { spendingReport } from '../lib/summaries.js';

const router = Router();

// GET /cron/weekly-summary — triggered by Vercel Cron on a schedule (Sunday
// evening). Sends every user with a linked WhatsApp number their weekly
// spending report. Not under /api, so it skips requireAuth; instead it's gated
// by CRON_SECRET, which Vercel Cron sends as `Authorization: Bearer <secret>`.
//
// Note: on the Twilio *sandbox*, an outbound message only delivers if the user
// messaged the bot within the last 24h — so a push is reliable only alongside
// the daily keep-alive, or on a production WhatsApp sender.
router.get('/weekly-summary', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.authorization || '') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_NUMBER; // e.g. "whatsapp:+14155238886"
  if (!sid || !token || !from) {
    return res.status(500).json({ error: 'Twilio is not configured (set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_NUMBER)' });
  }
  const client = twilio(sid, token);

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('whatsapp_number, personal_space_id')
    .not('whatsapp_number', 'is', null);
  if (error) return res.status(500).json({ error: error.message });

  const results = [];
  for (const p of profiles || []) {
    if (!p.whatsapp_number || !p.personal_space_id) continue;
    const to = p.whatsapp_number.startsWith('whatsapp:') ? p.whatsapp_number : `whatsapp:${p.whatsapp_number}`;
    try {
      const bodyText = await spendingReport(p.personal_space_id, 'week');
      await client.messages.create({ from, to, body: bodyText });
      results.push({ to, ok: true });
    } catch (err) {
      results.push({ to, ok: false, error: err.message });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  res.json({ sent, attempted: results.length, results });
});

export default router;
