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
      type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
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
      date: {
        type: 'string',
        description:
          'The date the transaction occurred, in ISO 8601 (YYYY-MM-DD), if the message states one; otherwise an empty string',
      },
      goal: {
        type: 'string',
        description:
          'For type "transfer", the savings goal named in the message matched to the provided goal list (exact name); otherwise an empty string',
      },
      from_account: {
        type: 'string',
        description:
          'For a transfer, the source account the money moved FROM, matched to one of the provided account names if possible; otherwise an empty string',
      },
      to_account: {
        type: 'string',
        description:
          'For a transfer, the destination account the money moved TO, matched to one of the provided account names if possible; otherwise an empty string',
      },
      account_balance: {
        type: 'string',
        description:
          'The account\'s available/remaining balance if the message states one (e.g. "Avl Bal 45,000"), digits only; otherwise an empty string',
      },
      confidence: { type: 'number', description: 'Confidence in the extraction from 0 to 1' },
    },
    required: ['amount', 'currency', 'merchant', 'type', 'category', 'payment_method', 'card_last4', 'date', 'goal', 'from_account', 'to_account', 'account_balance', 'confidence'],
  };
}

const SYSTEM_PROMPT = `You are a financial transaction parser. Extract structured data from a single bank SMS, WhatsApp message, or email notification.

Rules:
- amount: the transaction amount as a positive number (no currency symbol, no thousands separators).
- currency: the currency code if stated (e.g. LKR, SAR, USD); otherwise default to ${DEFAULT_CURRENCY}.
- merchant: the merchant or payee name. If none is stated, use "Unknown".
- type: "income" for money received (salary, refund, deposit, credit); "expense" for money spent (purchase, payment, withdrawal, debit, charge); "transfer" for moving money between the user's own accounts (e.g. "moved 50000 from HSBC to Sampath") OR setting money aside toward a savings goal (e.g. "save 20000 for wedding", "set aside 5000 for emergency", "put away 10k"). A transfer is not spending.
- category: choose the single best fit from the allowed list. Use "Salary" only for clear salary/payroll income. Use "Other" when nothing fits.
- goal: only for type "transfer" — if the message names a savings goal that matches one of the provided goals, return that goal's exact name; otherwise an empty string.
- from_account / to_account: only for type "transfer" — the source and destination account names, matched to one of the provided account names where possible; empty string if not stated.
- payment_method: "credit" if a credit card was used; "debit" for a debit card or a direct account/current/savings debit; "cash" for cash; otherwise "other".
- card_last4: the last 4 digits of the card or account if the message states them (e.g. "card ending 4521"), otherwise an empty string.
- date: the date the transaction occurred as stated in the message, in ISO 8601 (YYYY-MM-DD). The message may write it as DD/MM/YYYY, DD-MMM-YY, etc. — convert it. Use the provided current date to fill in a missing year. If no date is stated, use an empty string (do NOT guess today's date).
- account_balance: the available/remaining account balance if the message states one (look for "Avl Bal", "Available balance", "Bal:", "Balance"); strip currency symbols and separators; otherwise an empty string.
- confidence: your confidence in the overall extraction, from 0 to 1.

Return only the structured object — no commentary.`;

// Pull every currency-tagged amount out of the raw text, e.g. "LKR 3,388.01",
// "Rs. 1,650", "USD 50.00", "$12.30". Banks always write the figure this way,
// so these are far more reliable than the LLM's reading of the number.
function amountCandidates(text) {
  const re = /(?:LKR|Rs\.?|USD|EUR|GBP|SAR|AED|INR|\$|€|£|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
  const out = [];
  let m;
  while ((m = re.exec(String(text || '')))) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

// The amount is the one number that must be exact. Trust the LLM's *choice*
// (it correctly tells the purchase amount apart from an available balance) only
// when that value actually appears in the message; if the model's number isn't
// in the text it misread it, so fall back to the first currency amount (the
// purchase figure precedes any balance in bank SMS). With no currency figure at
// all (e.g. a typed "spent 500"), keep the model's number.
function reconcileAmount(rawText, modelAmount) {
  const cands = amountCandidates(rawText);
  if (!cands.length) return modelAmount;
  if (cands.some((c) => Math.abs(c - modelAmount) < 0.005)) return modelAmount;
  console.warn(
    `parser: amount mismatch — model said ${modelAmount}, text shows ${cands.join(', ')}; using ${cands[0]}`
  );
  return cands[0];
}

// Validate a model-supplied date → ISO string, or null if absent/implausible.
function cleanDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (year < 2000 || year > 2100) return null; // guard against invented dates
  return d.toISOString();
}

// Guarantee a valid, consistent shape regardless of which model produced it.
// `categories` is the list considered valid; anything else falls back to "Other".
function normalize(p, categories) {
  const amount = Math.abs(Number(p?.amount)) || 0;
  const type = p?.type === 'income' ? 'income' : p?.type === 'transfer' ? 'transfer' : 'expense';
  const category = categories.includes(p?.category) ? p.category : 'Other';
  const merchant = (p?.merchant && String(p.merchant).trim()) || 'Unknown';
  const currency = (p?.currency && String(p.currency).trim()) || DEFAULT_CURRENCY;
  const payment_method = PAYMENT_METHODS.includes(p?.payment_method) ? p.payment_method : 'other';
  const digits = String(p?.card_last4 ?? '').replace(/\D/g, '');
  const card_last4 = digits.length === 4 ? digits : null;
  const date = cleanDate(p?.date);
  const goal = (p?.goal && String(p.goal).trim()) || null;
  const from_account = (p?.from_account && String(p.from_account).trim()) || null;
  const to_account = (p?.to_account && String(p.to_account).trim()) || null;
  const balRaw = String(p?.account_balance ?? '').replace(/[^\d.-]/g, '');
  const account_balance = balRaw && Number.isFinite(Number(balRaw)) ? Number(balRaw) : null;
  let confidence = Number(p?.confidence);
  if (!(confidence >= 0 && confidence <= 1)) confidence = 0.5;
  return { amount, currency, merchant, type, category, payment_method, card_last4, date, goal, from_account, to_account, account_balance, confidence };
}

function chooseProvider() {
  const explicit = (process.env.PARSER_PROVIDER || '').toLowerCase();
  if (explicit) return explicit;
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return 'ollama';
}

// Context line prepended to the message: today's date, the user's savings goals
// and accounts (so the model can resolve partial dates, match a goal, and map a
// transfer's "from"/"to" to the user's real account names).
function preamble(today, goals, accounts) {
  const g = goals && goals.length ? ` The user's savings goals: ${goals.join(', ')}.` : '';
  const a = accounts && accounts.length ? ` The user's accounts: ${accounts.join(', ')}.` : '';
  return `Today is ${today}.${g}${a}`;
}

// --- Claude provider ---
let anthropic;
async function parseWithClaude(rawText, categories, today, goals, accounts) {
  if (!anthropic) anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `${preamble(today, goals, accounts)}\n\n${rawText}` }],
    output_config: { format: { type: 'json_schema', schema: buildTransactionSchema(categories) } },
  });
  if (response.stop_reason === 'refusal') throw new Error('model refused to parse the message');
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('no text block in model response');
  return JSON.parse(textBlock.text);
}

// --- Groq provider (free hosted, OpenAI-compatible) ---
async function parseWithGroq(rawText, categories, today, goals, accounts) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const jsonInstruction = `Return a JSON object with exactly these keys: amount (number), currency (string), merchant (string), type ("expense", "income" or "transfer"), category (one of: ${categories.join(', ')}), payment_method (one of: credit, debit, cash, other), card_last4 (string: the card's last 4 digits, or "" if not stated), date (string: the transaction date as ISO YYYY-MM-DD if the message states one, else ""), goal (string: for a transfer, the matching goal name, else ""), from_account (string: for a transfer, the source account name, else ""), to_account (string: for a transfer, the destination account name, else ""), account_balance (string: the available balance if stated, digits only, else ""), confidence (number 0-1).`;

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
          { role: 'user', content: `${preamble(today, goals, accounts)}\n\n${rawText}` },
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
async function parseWithOllama(rawText, categories, today, goals, accounts) {
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
          { role: 'user', content: `${preamble(today, goals, accounts)}\n\n${rawText}` },
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
 * @param {{categories?: string[], goals?: string[], accounts?: string[]}} [options] -
 *   categories restricts the valid category set; goals are the user's savings goal
 *   names (so the model can match a "save X for Y" transfer); accounts are the
 *   user's account names (so it can map a transfer's from/to). All fall back sensibly.
 * @returns {Promise<{amount:number,currency:string,merchant:string,type:'expense'|'income'|'transfer',category:string,payment_method:'credit'|'debit'|'cash'|'other',card_last4:string|null,date:string|null,goal:string|null,from_account:string|null,to_account:string|null,account_balance:number|null,confidence:number}>}
 */
export async function parseTransaction(rawText, { categories, goals, accounts } = {}) {
  if (!rawText || !rawText.trim()) {
    throw new Error('parseTransaction: rawText is empty');
  }
  const allowed = Array.isArray(categories) && categories.length ? categories : CATEGORIES;
  const goalNames = Array.isArray(goals) ? goals : [];
  const accountNames = Array.isArray(accounts) ? accounts : [];
  const today = new Date().toISOString().slice(0, 10);
  const provider = chooseProvider();
  let raw;
  if (provider === 'ollama') raw = await parseWithOllama(rawText, allowed, today, goalNames, accountNames);
  else if (provider === 'groq') raw = await parseWithGroq(rawText, allowed, today, goalNames, accountNames);
  else if (provider === 'claude') raw = await parseWithClaude(rawText, allowed, today, goalNames, accountNames);
  else throw new Error(`Unknown PARSER_PROVIDER "${provider}" (use "ollama", "groq", or "claude")`);
  const result = normalize(raw, allowed);
  // The amount must be exact — verify it against the raw text, don't just trust
  // the LLM's reading of the number.
  result.amount = reconcileAmount(rawText, result.amount);
  return result;
}
