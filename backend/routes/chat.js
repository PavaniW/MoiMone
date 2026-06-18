import { Router } from 'express';

const router = Router();

// POST /api/chat — in-app AI finance chat.
// Body: { "message": "Am I on track with my food budget this month?" }
// Flow (Session 12): query DB for context → Claude → natural language answer.
router.post('/', (_req, res) => {
  res.status(501).json({ error: 'Not implemented: AI finance chat' });
});

export default router;
