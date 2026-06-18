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
Open the Supabase SQL editor and run `supabase/schema.sql`.

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

Foundation scaffold (Session 1). All API routes and services are stubbed and
return `501 Not implemented`; build them out following the implementation order
in the blueprint.
