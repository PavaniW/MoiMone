import { Router } from 'express';

const router = Router();

// GET /api/gmail/sync — manually trigger a Gmail poll for bank emails.
// Flow (Session 11): gmail-reader.js fetches unread mail from GMAIL_BANK_SENDER
// → parser.js → categorizer.js → save. A scheduled job can hit the same path.
router.get('/sync', (_req, res) => {
  res.status(501).json({ error: 'Not implemented: Gmail sync' });
});

export default router;
