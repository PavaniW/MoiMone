# iOS Shortcut — Bank SMS → Webhook

Auto-forwards bank SMS to the backend `/webhook/sms` endpoint.

> ⚠️ iOS Shortcuts can only auto-trigger on an incoming message if the sender is
> a **saved contact**. Save your bank's SMS sender as a contact first.

## Setup

1. **Shortcuts app → Automation tab → New Automation (＋).**
2. Trigger: **Message** → "Message Contains" or "Sender is [Your Bank]". Set
   **Run Immediately** (no confirmation).
3. Add action **Get Contents of URL**:
   - **URL**: `https://<your-backend>/webhook/sms`
   - **Method**: `POST`
   - **Request Body**: `JSON`
     - `text`  → (Shortcut variable) the message content
     - `token` → your `WEBHOOK_SECRET_TOKEN`
4. Save. Send yourself a test SMS, or test the endpoint first with curl:

```bash
curl -X POST http://localhost:3000/webhook/sms \
  -H 'Content-Type: application/json' \
  -d '{"text":"Your card was charged SAR 150 at Noon.com","token":"YOUR_SECRET_TOKEN"}'
```

Until the parser is implemented (Session 3) this returns `501 Not implemented`,
which still confirms the token check and routing work.
