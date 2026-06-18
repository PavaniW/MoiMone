// Verifies the shared secret token sent by the iOS Shortcut / trusted webhooks.
// The token may arrive in the JSON body ({ "token": "..." }) or an
// `Authorization: Bearer <token>` header.
export function verifyWebhookToken(req, res, next) {
  const expected = process.env.WEBHOOK_SECRET_TOKEN;
  if (!expected) {
    return res.status(500).json({ error: 'WEBHOOK_SECRET_TOKEN not configured on server' });
  }

  const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const provided = req.body?.token || headerToken;

  if (provided !== expected) {
    return res.status(401).json({ error: 'Invalid or missing webhook token' });
  }

  next();
}
