# MoiMone — Operations & Service Limits

Everything about running MoiMone in production: where it's hosted, the external
services it depends on, their free-tier limits, and the recurring gotchas (and
how to fix them). All services are on **free tiers with hard caps — none can
bill the card by surprise.**

---

## Hosting — Vercel (Hobby / free)

- **Live URL:** https://moi-mone.vercel.app
- Single project: static frontend + Express API as one serverless function,
  same-origin. Config in `vercel.json`. Auto-deploys on push to `main`.
- **Limits** (generous — a 2-person app won't approach them): 100 deploys/day,
  1,000,000 function invocations/mo, 100 GB bandwidth/mo, 60s max function
  duration. Exceeding → throttled, **never billed** (Hobby has no pay-as-you-go).
- **Policy:** non-commercial use only; repo must be personal (not a GitHub org).

### ⚠️ Gotcha: commit author must map to the GitHub owner
Vercel Hobby only deploys commits whose **author email** maps to the `PavaniW`
GitHub account. Use `pavanishadi25@gmail.com` (set in this repo's git config) —
**not** the work email `pavani@planyear.com`, which triggers
*"Deployment Blocked: author did not have contributing access."*
Fallback that always maps: `87935518+PavaniW@users.noreply.github.com`.

---

## External services

| Service | Role | Free-tier limit |
|---|---|---|
| **Supabase** | Postgres DB + Google auth | 500 MB DB · 50k users · 5 GB egress/mo · pauses after 1 week idle |
| **Groq** | AI parser + in-app chat | 30 req/min · 1,000 req/day · 12k tokens/min · **100k tokens/day** |
| **Twilio** | WhatsApp ingestion | Sandbox free · **join expires every 3 days** · 1 msg/3s |
| **Google OAuth** | Sign-in (via Supabase) | Free; "Testing" apps expire sessions ~weekly |
| **Anthropic** | *Fallback* AI only | Not active (we use Groq via `PARSER_PROVIDER=groq`) |

---

## ⚠️ Recurring gotchas (all free to fix, all fail silently)

### 1. Twilio sandbox join expires every 3 days
WhatsApp logging silently stops every 3 days. **Fix:** each person re-sends
`join north-gas` to `+1 415 523 8886` on WhatsApp. Permanent fix = register a
real WhatsApp Business sender (needs a WhatsApp Business Account + approval).

### 2. Supabase pauses after 1 week of inactivity
If neither of us opens the app for 7 days, the DB goes **offline** and the app
errors. **Data is NOT lost** — open the Supabase dashboard → **Restore** (~1–2
min) and everything is exactly as left. Only risk: leaving it paused for
*months* (Supabase may eventually clean up long-dead free projects), so restore
it when you're back from any long break. Opening the app weekly avoids pauses.

### 3. Groq: 100k tokens/day is the chat ceiling
Parsing bank SMS is tiny (~500 tokens each), so the 1,000 req/day easily covers
all texts. **Chat** sends recent-transaction context (~2–5k tokens/call), so
heavy days top out around ~25–40 questions. Over the limit → HTTP `429` (wait
and retry), not a charge.

### 4. Google OAuth "Testing" mode
If the Google Cloud OAuth consent screen is in **Testing** (not Published),
sessions can expire ~weekly. Publishing the consent screen removes this.

---

## Environment variables (Vercel → Settings → Environment Variables)

Set for **Production**, then **redeploy** (changes don't apply to the existing build).

**Backend (function):**
- `SUPABASE_URL` — Supabase project URL (⚠️ NOT the `VITE_`-prefixed one)
- `SUPABASE_SERVICE_ROLE_KEY` — secret
- `PARSER_PROVIDER` — `groq`
- `GROQ_API_KEY`
- `TWILIO_AUTH_TOKEN` (+ `TWILIO_ACCOUNT_SID`, `TWILIO_WHATSAPP_NUMBER`)

**Frontend (build-time):**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Do **NOT** set `VITE_API_URL` — keeps the frontend calling the API same-origin.

---

## Deploy / redeploy

- **Deploy:** push to `main` → Vercel auto-builds (commit author must be the
  gmail above).
- **Redeploy** (after env-var changes): Vercel → **Deployments → ⋯ → Redeploy**.

## Post-deploy URL config (when the domain changes)

1. **Supabase → Auth → URL Configuration → Site URL:** a **single** URL
   (`https://moi-mone.vercel.app`). ⚠️ Two URLs in this field → `500
   unexpected_failure` on login. Add the URL to **Redirect URLs** as `/**`.
2. **Twilio → WhatsApp Sandbox → "When a message comes in":**
   `https://moi-mone.vercel.app/webhook/whatsapp` (POST).
3. **iOS Shortcut (SMS):** POST to `https://moi-mone.vercel.app/webhook/sms`
   (see `shortcuts/BankSMS.md`).
