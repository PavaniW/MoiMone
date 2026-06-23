# iOS Shortcut — Bank SMS → MoiMone

Auto-forwards a bank SMS to your account. The transaction is attributed to **you**
via your personal **ingest token** (each user has their own).

> ⚠️ iOS often only auto-runs message automations when the sender is a **saved
> contact** — save your bank's SMS sender to Contacts first. Using "Message
> Contains" (a word always in the bank's texts) is the most reliable trigger.

## Get your ingest token
It's unique and private to you (write-only — it can only add transactions to your
account, nothing else). The app returns it from `GET /api/me` once you're signed
in. Keep it secret; it can be rotated if ever needed.

## Build the automation
1. **Shortcuts app → Automation → ＋ → New Personal Automation**
2. Trigger: **Message** → **Message Contains** = a word always in your bank texts
   (e.g. your bank's name, or `LKR`). Choose **Run Immediately**.
3. Add action **Get Contents of URL**:
   - **URL**: `https://moimone.netlify.app/webhook/sms`
   - **Show More** → **Method**: `POST`
   - **Headers**: `Content-Type` = `application/json`
   - **Request Body**: `JSON`
     - `text`  (Text) → the **Shortcut Input** variable (the SMS content)
     - `token` (Text) → your personal ingest token
4. **Done.**

## Test
Send yourself (or have someone send) a message containing your trigger word:

```bash
curl -X POST https://moimone.netlify.app/webhook/sms \
  -H 'Content-Type: application/json' \
  -d '{"text":"Your card was debited LKR 450.00 at Cargills","token":"<YOUR_INGEST_TOKEN>"}'
```

A `201` response with the parsed transaction means it worked — check the
dashboard. A `401` means the token is wrong.
