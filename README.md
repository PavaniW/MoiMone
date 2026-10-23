# Personal Finance Tracker

Captures transactions from bank SMS, Gmail, and WhatsApp; tracks budgets and
saving goals; and lets you chat with your finances. See
[`finance-tracker-blueprint.md`](./finance-tracker-blueprint.md) for the full
architecture.

## Structure

```
backend/    Node.js + Express API and webhooks
frontend/   Vite + React dashboard
supabase/   schema.sql (run in the Supabase SQL editor)
shortcuts/  iOS Shortcut setup for bank SMS forwarding
```

## Getting started

### 1. Database
Open the Supabase SQL editor and run `supabase/schema.sql`, then the other
migration files (`multi-user.sql`, `cards.sql`, `merchant-rules.sql`, …) and
finally **`policies.sql`**.

> **Security:** `policies.sql` turns on Row-Level Security. The backend uses the
> service-role key (which bypasses RLS), but enabling RLS with no public policies
> ensures the browser's anon key can't read or write any table directly. Don't
> skip it.

### 2. Backend
```bash
cd backend
npm install
cp ../.env.example .env   # then fill in real values
npm run dev               # http://localhost:3000
```

### 3. Frontend
```bash
cd frontend
npm install
cp .env.example .env      # then fill in VITE_ values
npm run dev               # http://localhost:5173
```

## Status

Core data flow is live. Implemented:
- **Transactions** — list/filter, manual add, inline category edit, delete
- **Budgets** — set monthly limits, progress bars, delete
- **Goals** — create, add funds, progress + days remaining, delete
- **Dashboard** — monthly summary, spending chart, budgets, recent entries
- **Ingestion** — SMS webhook + WhatsApp bot via the Claude/Groq/Ollama parser

Still stubbed (return `501`): `/api/chat` (in-app AI chat) and `/api/gmail/sync`
(Gmail polling) — build them following the blueprint's implementation order.
