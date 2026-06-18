import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import transactionsRouter from './routes/transactions.js';
import budgetsRouter from './routes/budgets.js';
import goalsRouter from './routes/goals.js';
import categoriesRouter from './routes/categories.js';
import chatRouter from './routes/chat.js';
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

// --- API routes (frontend) ---
app.use('/api/transactions', transactionsRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/chat', chatRouter);
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

app.listen(PORT, () => {
  console.log(`🚀 Backend listening on http://localhost:${PORT}`);
});

export default app;
