import Anthropic from '@anthropic-ai/sdk';

// Transaction parser. Accepts raw bank SMS / WhatsApp / email text and returns
// structured transaction JSON. Three interchangeable providers:
//
//   • 'ollama' — free local model (e.g. llama3.2) via the Ollama daemon. Local dev.
//   • 'groq'   — free hosted LLM API (OpenAI-compatible). Good for deployment.
//   • 'claude' — Anthropic claude-sonnet-4-6 (needs ANTHROPIC_API_KEY).
//
// Selected by PARSER_PROVIDER; if unset, auto-detects in this order:
// GROQ_API_KEY → groq, ANTHROPIC_API_KEY → claude, else → ollama.
// Output from every provider is normalized to the same shape.

const CLAUDE_MODEL = 'claude-sonnet-4-6';

// Default currency for amounts that arrive without an explicit code.
export const DEFAULT_CURRENCY = 'LKR';

// Must stay in sync with the transactions.payment_method CHECK in schema.sql.
export const PAYMENT_METHODS = ['credit', 'debit', 'cash', 'other'];

// Must stay in sync with the `categories` table seed in supabase/schema.sql.
export const CATEGORIES = [
  'Food & Dining',
  'Transport',
  'Shopping',
  'Utilities',
  'Entertainment',
  'Health',
  'Salary',
  'Other',
];

// Built per-call so the category enum reflects the user's own (possibly
// customized) category list rather than only the built-in defaults.
function buildTransactionSchema(categories) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      amount: { type: 'number', description: 'Transaction amount as a positive number' },
      currency: { type: 'string', description: 'Currency code, e.g. LKR, SAR, USD' },
      merchant: { type: 'string', description: 'Merchant or payee name; "Unknown" if not stated' },
      type: { type: 'string', enum: ['expense', 'income'] },
      category: { type: 'string', enum: categories },
      payment_method: {
        type: 'string',
        enum: ['credit', 'debit', 'cash', 'other'],
        description: 'Which instrument paid: credit card, debit card, cash, or other',
      },
      card_last4: {
        type: 'string',
        description: 'Last 4 digits of the card if stated, otherwise an empty string',
      },
      confidence: { type: 'number', description: 'Confidence in the extraction from 0 to 1' },
    },
    required: ['amount', 'currency', 'merchant', 'type', 'category', 'payment_method', 'card_last4', 'confidence'],
  };
}

const SYSTEM_PROMPT = `You are a financial transaction parser. Extract structured data from a single bank SMS, WhatsApp message, or email notification.

Rules:
- amount: the transaction amount as a positive number (no currency symbol, no thousands separators).
- currency: the currency code if stated (e.g. LKR, SAR, USD); otherwise default to ${DEFAULT_CURRENCY}.
- merchant: the merchant or payee name. If none is stated, use "Unknown".
- type: "income" for money received (salary, refund, deposit, credit); "expense" for money spent (purchase, payment, withdrawal, debit, charge).
- category: choose the single best fit from the allowed list. Use "Salary" only for clear salary/payroll income. Use "Other" when nothing fits.
- payment_method: "credit" if a credit card was used; "debit" for a debit card or a direct account/current/savings debit; "cash" for cash; otherwise "other".
- card_last4: the last 4 digits of the card or account if the message states them (e.g. "card ending 4521"), otherwise an empty string.
- confidence: your confidence in the overall extraction, from 0 to 1.

Return only the structured object — no commentary.`;

// Guarantee a valid, consistent shape regardless of which model produced it.
// `categories` is the list considered valid; anything else falls back to "Other".
function normalize(p, categories) {
  const amount = Math.abs(Number(p?.amount)) || 0;
  const type = p?.type === 'income' ? 'income' : 'expense';
  const category = categories.includes(p?.category) ? p.category : 'Other';
  const merchant = (p?.merchant && String(p.merchant).trim()) || 'Unknown';
  const currency = (p?.currency && String(p.currency).trim()) || DEFAULT_CURRENCY;
  const payment_method = PAYMENT_METHODS.includes(p?.payment_method) ? p.payment_method : 'other';
  const digits = String(p?.card_last4 ?? '').replace(/\D/g, '');
  const card_last4 = digits.length === 4 ? digits : null;
  let confidence = Number(p?.confidence);
  if (!(confidence >= 0 && confidence <= 1)) confidence = 0.5;
  return { amount, currency, merchant, type, category, payment_method, card_last4, confidence };
}

function chooseProvider() {
  const explicit = (process.env.PARSER_PROVIDER || '').toLowerCase();
  if (explicit) return explicit;
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return 'ollama';
}

// --- Claude provider ---
let anthropic;
async function parseWithClaude(rawText, categories) {
  if (!anthropic) anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: rawText }],
    output_config: { format: { type: 'json_schema', schema: buildTransactionSchema(categories) } },
  });
  if (response.stop_reason === 'refusal') throw new Error('model refused to parse the message');
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('no text block in model response');
  return JSON.parse(textBlock.text);
}

// --- Groq provider (free hosted, OpenAI-compatible) ---
async function parseWithGroq(rawText, categories) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const jsonInstruction = `Return a JSON object with exactly these keys: amount (number), currency (string), merchant (string), type ("expense" or "income"), category (one of: ${categories.join(', ')}), payment_method (one of: credit, debit, cash, other), card_last4 (string: the card's last 4 digits, or "" if not stated), confidence (number 0-1).`;

  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n${jsonInstruction}` },
          { role: 'user', content: rawText },
        ],
      }),
    });
  } catch {
    throw new Error('cannot reach Groq API (check network / GROQ_API_KEY)');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Groq request failed (${res.status}): ${detail}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned an empty response');
  return JSON.parse(content);
}

// --- Ollama provider (local, free) ---
async function parseWithOllama(rawText, categories) {
  const base = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.2';

  let res;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: buildTransactionSchema(categories),
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: rawText },
        ],
      }),
    });
  } catch {
    throw new Error(`cannot reach Ollama at ${base} — is it running? (try: ollama serve)`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 404) throw new Error(`Ollama model "${model}" not found — run: ollama pull ${model}`);
    throw new Error(`Ollama request failed (${res.status}): ${detail}`);
  }
  const data = await res.json();
  const content = data?.message?.content;
  if (!content) throw new Error('Ollama returned an empty response');
  return JSON.parse(content);
}

/**
 * Parse a raw message into a structured transaction.
 * @param {string} rawText
 * @param {{categories?: string[]}} [options] - categories restricts the valid
 *   category set (e.g. a user's own list). Falls back to the built-in defaults.
 * @returns {Promise<{amount:number,currency:string,merchant:string,type:'expense'|'income',category:string,payment_method:'credit'|'debit'|'cash'|'other',card_last4:string|null,confidence:number}>}
 */
export async function parseTransaction(rawText, { categories } = {}) {
  if (!rawText || !rawText.trim()) {
    throw new Error('parseTransaction: rawText is empty');
  }
  const allowed = Array.isArray(categories) && categories.length ? categories : CATEGORIES;
  const provider = chooseProvider();
  let raw;
  if (provider === 'ollama') raw = await parseWithOllama(rawText, allowed);
  else if (provider === 'groq') raw = await parseWithGroq(rawText, allowed);
  else if (provider === 'claude') raw = await parseWithClaude(rawText, allowed);
  else throw new Error(`Unknown PARSER_PROVIDER "${provider}" (use "ollama", "groq", or "claude")`);
  return normalize(raw, allowed);
}
