// Currency conversion to LKR for incoming foreign-currency transactions.
// MoiMone stores everything in LKR (no per-row currency column), so when a bank
// SMS / WhatsApp message is in another currency we convert at ingest.
//
// Uses the free, key-less open.er-api.com with a 12h in-memory cache. Any
// failure returns null so ingestion falls back to the original amount.

const cache = new Map(); // CUR -> { rate, ts }
const TTL_MS = 12 * 60 * 60 * 1000;

async function rateToLKR(currency) {
  const cur = String(currency || '').toUpperCase();
  if (!cur || cur === 'LKR') return 1;

  const hit = cache.get(cur);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.rate;

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${cur}`);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.LKR;
    if (!rate || !Number.isFinite(rate)) return null;
    cache.set(cur, { rate, ts: Date.now() });
    return rate;
  } catch {
    return null;
  }
}

/**
 * Convert an amount to LKR. Returns null when no conversion is needed (already
 * LKR / unknown) or the rate lookup fails — callers keep the original amount.
 * @returns {Promise<null | { lkr:number, rate:number, original:number, currency:string }>}
 */
export async function toLKR(amount, currency) {
  const cur = String(currency || '').toUpperCase();
  if (!cur || cur === 'LKR') return null;
  const rate = await rateToLKR(cur);
  if (!rate) return null;
  return {
    lkr: Math.round(Number(amount) * rate * 100) / 100,
    rate,
    original: Number(amount),
    currency: cur,
  };
}
