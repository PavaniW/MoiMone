import 'dotenv/config';
import { pathToFileURL } from 'url';
import express from 'express';
import cors from 'cors';

import { requireAuth } from './middleware/requireAuth.js';
import meRouter from './routes/me.js';
import spacesRouter from './routes/spaces.js';
import cardsRouter from './routes/cards.js';
import transactionsRouter from './routes/transactions.js';
import budgetsRouter from './routes/budgets.js';
import goalsRouter from './routes/goals.js';
import categoriesRouter from './routes/categories.js';
import merchantRulesRouter from './routes/merchant-rules.js';
import chatRouter from './routes/chat.js';
import dashboardRouter from './routes/dashboard.js';
import gmailRouter from './routes/gmail.js';
import webhookRouter from './routes/webhook.js';
import whatsappRouter from './routes/whatsapp.js';

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  })
);
// Twilio posts application/x-www-form-urlencoded; iOS Shortcut + frontend post JSON.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Health check ---
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'finance-tracker-backend' });
});

// --- API routes (frontend) — all require a signed-in user ---
app.use('/api', requireAuth);
app.use('/api/me', meRouter);
app.use('/api/spaces', spacesRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/merchant-rules', merchantRulesRouter);
app.use('/api/chat', chatRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/gmail', gmailRouter);

// --- Inbound webhooks ---
// webhookRouter  → POST /webhook/sms      (iOS Shortcut)
// whatsappRouter → POST /webhook/whatsapp (Twilio)
app.use('/webhook', webhookRouter);
app.use('/webhook', whatsappRouter);

// --- 404 fallback ---
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Error handler ---
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Serverless hosts (Vercel, Netlify) import this module and invoke the exported
// app per request, so we only start a long-lived listener when the file is run
// directly (local dev: `node index.js` / `npm run dev`).
const isDirectRun = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isDirectRun) {
  app.listen(PORT, () => {
    console.log(`🚀 Backend listening on http://localhost:${PORT}`);
  });
}

export default app;
