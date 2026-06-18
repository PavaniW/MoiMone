# Personal Finance Tracker — Full Architecture Blueprint
> Hand this document to Claude Code to kick off implementation

---

## What We're Building

A personal finance system that:
- **Automatically captures** transactions from bank SMS (via iOS Shortcut) and bank emails (via Gmail)
- **Tracks spending** by category with budgets per month
- **Monitors saving goals** with progress over time
- **Lets you chat** with your finances via a WhatsApp bot or in-app chat
- **Shows everything** on a clean personal dashboard

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React (Vite) | Fast, component-based, easy to extend |
| Backend | Node.js + Express | Lightweight, great for webhooks |
| Database | Supabase (Postgres) | Free tier, real-time, built-in auth |
| AI / Parsing | Claude API (claude-sonnet-4-6) | Parse SMS/email text, categorize, chat |
| SMS Ingestion | iOS Shortcut + Webhook | No App Store approval needed |
| Email Ingestion | Gmail API | Read bank notification emails |
| WhatsApp Bot | Twilio WhatsApp API | Easiest WhatsApp integration |
| Hosting | Vercel (frontend) + Railway (backend) | Free tiers, easy deploys |

---

## Project File Structure

```
finance-tracker/
├── frontend/                        # React app (Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx        # Main overview page
│   │   │   ├── Transactions.jsx     # Full transaction list + filters
│   │   │   ├── Budgets.jsx          # Monthly budget setup + progress
│   │   │   ├── Goals.jsx            # Saving goals tracker
│   │   │   └── Chat.jsx             # In-app AI chat interface
│   │   ├── components/
│   │   │   ├── SpendingChart.jsx    # Bar/pie charts per category
│   │   │   ├── BudgetBar.jsx        # Progress bar per budget
│   │   │   ├── GoalCard.jsx         # Individual saving goal card
│   │   │   ├── TransactionItem.jsx  # Single transaction row
│   │   │   └── AddTransaction.jsx   # Manual entry form
│   │   ├── lib/
│   │   │   ├── supabase.js          # Supabase client
│   │   │   └── api.js               # Backend API calls
│   │   └── App.jsx
│   └── package.json
│
├── backend/                         # Node.js + Express
│   ├── routes/
│   │   ├── transactions.js          # CRUD for transactions
│   │   ├── budgets.js               # CRUD for budgets
│   │   ├── goals.js                 # CRUD for saving goals
│   │   ├── webhook.js               # iOS Shortcut SMS endpoint
│   │   ├── gmail.js                 # Gmail polling + parsing
│   │   ├── whatsapp.js              # Twilio WhatsApp webhook
│   │   └── chat.js                  # In-app AI chat endpoint
│   ├── services/
│   │   ├── parser.js                # Claude-powered SMS/email parser
│   │   ├── categorizer.js           # Auto-categorize transactions
│   │   └── gmail-reader.js          # Gmail API integration
│   ├── middleware/
│   │   └── auth.js                  # Verify webhook tokens
│   ├── index.js                     # Express app entry point
│   └── package.json
│
├── supabase/
│   └── schema.sql                   # Full database schema (see below)
│
└── shortcuts/
    └── BankSMS.shortcut             # iOS Shortcut export instructions
```

---

## Database Schema (Supabase / Postgres)

```sql
-- Transactions: every income or expense
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  category TEXT NOT NULL,
  merchant TEXT,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('sms', 'email', 'whatsapp', 'manual')),
  raw_text TEXT,                    -- original SMS/email text for debugging
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Budgets: monthly spending limits per category
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  monthly_limit DECIMAL(10,2) NOT NULL,
  month INT NOT NULL,               -- 1–12
  year INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category, month, year)
);

-- Saving Goals
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,               -- e.g. "Emergency Fund", "New Laptop"
  target_amount DECIMAL(10,2) NOT NULL,
  current_amount DECIMAL(10,2) DEFAULT 0,
  deadline DATE,
  color TEXT,                       -- hex color for UI
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories list (can be seeded with defaults)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,        -- e.g. "Food", "Transport", "Shopping"
  icon TEXT,                        -- emoji or icon name
  color TEXT                        -- hex color
);

-- Seed default categories
INSERT INTO categories (name, icon, color) VALUES
  ('Food & Dining', '🍽️', '#FF6B6B'),
  ('Transport', '🚗', '#4ECDC4'),
  ('Shopping', '🛍️', '#45B7D1'),
  ('Utilities', '💡', '#96CEB4'),
  ('Entertainment', '🎬', '#FFEAA7'),
  ('Health', '💊', '#DDA0DD'),
  ('Salary', '💰', '#90EE90'),
  ('Other', '📦', '#D3D3D3');
```

---

## How Data Flows In

### Path 1: iOS Shortcut (Bank SMS)

```
Bank sends SMS → iOS Shortcut triggers automatically
→ Shortcut reads message text
→ Sends POST to your backend: { "text": "Your card was charged SAR 150 at Noon.com" }
→ Backend calls Claude API to parse:
    { amount: 150, merchant: "Noon.com", type: "expense", currency: "SAR" }
→ Categorizer maps "Noon.com" → "Shopping"
→ Saved to Supabase transactions table
→ Dashboard updates in real-time
```

**iOS Shortcut Setup (tell Claude Code to document this):**
1. Open Shortcuts app → Automation → New Automation
2. Trigger: "Message received from [Your Bank Name]"
3. Action: "Get Contents of [Message]"
4. Action: "Get contents of URL" (POST to your webhook URL)
5. Body: `{ "text": "[Message Content]", "token": "YOUR_SECRET_TOKEN" }`

### Path 2: Gmail Bank Emails

```
Bank sends email notification
→ Backend polls Gmail every 15 minutes (or on-demand)
→ Gmail API fetches unread emails from your bank's sender address
→ Email text sent to Claude API parser
→ Same flow as SMS above
```

### Path 3: WhatsApp Bot

```
You send WhatsApp message: "Spent 200 on groceries at Lulu"
→ Twilio receives it, forwards to your backend webhook
→ Claude parses the natural language
→ Saved to database
→ Bot replies: "✅ Logged: SAR 200 – Food & Dining (Lulu). Budget remaining: SAR 650"

You can also ask: "How much did I spend on food this month?"
→ Bot queries database, Claude formats the answer
→ Bot replies with summary
```

### Path 4: Manual Entry (always available as fallback)

Simple form in the app. Merchant, amount, category, date.

---

## Claude API Usage (the AI brain)

### 1. Transaction Parser
```
System: You are a financial transaction parser. Extract transaction data from SMS or email text.
Return ONLY valid JSON: { amount, currency, merchant, type, category, confidence }

User: "Your VISA card ending 4521 was used for SAR 85.50 at Starbucks Arabia on 18 Jun 2026"

Response: { "amount": 85.50, "currency": "SAR", "merchant": "Starbucks Arabia",
            "type": "expense", "category": "Food & Dining", "confidence": 0.98 }
```

### 2. Finance Chat
```
System: You are a personal finance assistant. The user's transaction data is provided.
Answer questions about spending, budgets, and financial habits concisely and helpfully.

User: "Am I on track with my food budget this month?"
→ Query DB first → Pass data to Claude → Return natural language answer
```

### 3. WhatsApp Natural Language Entry
```
System: Parse this WhatsApp message as a transaction. Return JSON or ask for clarification.

User: "paid rent 3000"
Response: { "amount": 3000, "category": "Utilities", "merchant": "Rent", "type": "expense" }
```

---

## Key Backend Endpoints

```
POST /webhook/sms          ← iOS Shortcut sends here
POST /webhook/whatsapp     ← Twilio sends here
GET  /api/transactions     ← Frontend fetches transactions
POST /api/transactions     ← Manual entry
GET  /api/budgets          ← Get budgets for current month
POST /api/budgets          ← Create/update a budget
GET  /api/goals            ← Get saving goals
PUT  /api/goals/:id        ← Update goal progress
POST /api/chat             ← In-app AI chat
GET  /api/gmail/sync       ← Manually trigger Gmail sync
```

---

## Environment Variables Needed

```
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Claude API
ANTHROPIC_API_KEY=

# Gmail (OAuth)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_BANK_SENDER=notifications@yourbank.com   ← your bank's email address

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Security
WEBHOOK_SECRET_TOKEN=     ← random string, put same in iOS Shortcut

# App
PORT=3000
FRONTEND_URL=http://localhost:5173
```

---

## Dashboard UI (what to build)

### Page 1: Dashboard
- Total spent this month (big number)
- Spending by category (bar or donut chart)
- Budget status bars (e.g. Food: ████░░ 73%)
- Recent transactions (last 5)
- Saving goals progress

### Page 2: Transactions
- Searchable, filterable list
- Filter by: date range, category, source (SMS/email/manual)
- Edit category if auto-categorized wrong
- Delete transaction

### Page 3: Budgets
- Set monthly limit per category
- Visual progress bars
- Alert when over 80% spent

### Page 4: Saving Goals
- Add goal: name, target amount, deadline
- Manual "add funds" button
- Progress bar + days remaining
- Estimated completion date

### Page 5: Chat
- Chat interface
- Ask questions: "What did I spend last week?", "Show my top 3 categories"
- Powered by Claude API with DB context

---

## Implementation Order (tell Claude Code to follow this)

1. **Supabase setup** — run schema.sql, confirm tables exist
2. **Backend skeleton** — Express app, routes stubbed, env vars wired
3. **Frontend skeleton** — Vite + React, routing, Supabase client
4. **Dashboard UI** — hardcoded mock data first, then wire to DB
5. **Manual transaction entry** — first real data flow
6. **Transaction list + filters** — search, filter, edit category
7. **Budgets page** — CRUD + progress bars
8. **Goals page** — CRUD + progress tracking
9. **Claude parser service** — SMS/email text → structured transaction
10. **iOS Shortcut webhook** — `/webhook/sms` endpoint + test with Postman first
11. **Gmail integration** — OAuth setup + email polling
12. **In-app chat** — `/api/chat` endpoint + Chat.jsx page
13. **WhatsApp bot** — Twilio setup + `/webhook/whatsapp` endpoint
14. **Polish + mobile responsive** — make it work on iPhone browser

---

## Prompts to Start Claude Code Sessions

### Session 1 — Foundation
```
I'm building a personal finance tracker. Here's the full architecture document: [paste this file]

Start with:
1. Initialize the project structure (frontend/ with Vite+React, backend/ with Express)
2. Create supabase/schema.sql with the exact schema from the document
3. Set up backend/index.js with Express and all route files stubbed out
4. Set up .env.example with all environment variables listed
```

### Session 2 — UI
```
Continuing my finance tracker (architecture doc attached). The backend skeleton is done.

Build the full frontend Dashboard page with:
- Monthly spending total
- Category breakdown chart (use Recharts)
- Budget progress bars
- Last 5 transactions list
Use mock data for now, we'll wire Supabase later.
```

### Session 3 — Parser
```
Build the Claude-powered transaction parser service (backend/services/parser.js).
It should accept raw SMS or email text and return structured JSON.
Also build the /webhook/sms endpoint that iOS Shortcut will POST to.
Include a test script I can run with sample bank SMS messages.
```

---

## Notes for Your Specific Setup

- **Currency**: Update parser prompt to expect your local currency (SAR, AED, etc.)
- **Bank SMS format**: Collect 3–5 real SMS examples from your bank and give them to Claude Code when building the parser — it'll train the prompt on your exact format
- **iPhone limitation**: iOS Shortcuts can only auto-trigger if the SMS comes from a saved contact. Save your bank as a contact first.
- **WhatsApp number**: Twilio gives you a sandbox number for free testing before going live

---

*Generated with Claude — June 2026*
