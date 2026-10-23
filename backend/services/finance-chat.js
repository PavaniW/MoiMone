import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CURRENCY } from './parser.js';

// In-app finance chat. Given the user's question and a compact summary of their
// own financial data (the CONTEXT block, assembled in routes/chat.js), produce a
// short natural-language answer.
//
// Reuses the same three interchangeable providers as the parser, selected the
// same way (PARSER_PROVIDER, else GROQ_API_KEY → groq, ANTHROPIC_API_KEY →
// claude, else local ollama). Unlike the parser, this returns free text, not a
// JSON-schema object.

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are MoiMone, a friendly personal-finance assistant built into the user's budgeting app.

You answer questions about the user's OWN money — spending, budgets, savings goals — using ONLY the figures in the CONTEXT block you are given. The context already contains the user's transactions, per-category totals, budgets, and goals.

The totals are ALREADY CALCULATED for you in the context — do not recompute or estimate them:
- "how much do I have / can I spend right now / my balance" = availableNow (spendable: debit + cash). Per-account balances are in accounts[].
- "this month total spent" = thisMonth.totalExpense
- "this month total income" = thisMonth.totalIncome
- "this month net / left over / saved up" = thisMonth.net (income − spent − saved; a monthly flow, NOT a balance)
- "spent on <category> this month" = thisMonth.byCategory["<category>"] (0 if the category is absent)
- last month uses the lastMonth object the same way
Only fall back to summing recentTransactions for merchant-level questions ("how much at Lulu?").

Rules:
- Lead with the direct answer, then one short supporting detail. Keep it to a few sentences.
- Use the EXACT figures from the context. Never use a number that does not appear in the context. If a figure is 0, say 0 — do not invent a value.
- Prefix amounts with the context's currency code and use thousands separators (e.g. the code followed by the number).
- Use the provided today's date to interpret "this month", "last month", "recently".
- If the context lacks the data to answer, say so plainly. NEVER invent numbers, merchants, or dates.
- Don't mention "context", "data", "JSON", or that you're an AI. Just talk like a helpful money assistant.`;

function chooseProvider() {
  const explicit = (process.env.PARSER_PROVIDER || '').toLowerCase();
  if (explicit) return explicit;
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return 'ollama';
}

function buildUserMessage(question, context) {
  return `CONTEXT (the user's financial data):\n${JSON.stringify(context, null, 2)}\n\nUSER QUESTION: ${question}`;
}

// --- Claude provider ---
let anthropic;
async function chatWithClaude(question, context) {
  if (!anthropic) anthropic = new Anthropic();
  const response = await anthropic.messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: 700,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(question, context) }],
    },
    { timeout: 25000 }
  );
  if (response.stop_reason === 'refusal') throw new Error('the assistant declined to answer that');
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('no text block in model response');
  return textBlock.text.trim();
}

// --- Groq provider (free hosted, OpenAI-compatible) ---
async function chatWithGroq(question, context) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(question, context) },
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
  return content.trim();
}

// --- Ollama provider (local, free) ---
async function chatWithOllama(question, context) {
  const base = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.2';

  let res;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.3 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(question, context) },
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
  return content.trim();
}

/**
 * Answer a finance question from a pre-assembled context summary.
 * @param {string} question - the user's natural-language question
 * @param {object} context - compact summary of the user's financial data
 * @returns {Promise<string>} natural-language answer
 */
export async function answerFinanceQuestion(question, context) {
  if (!question || !question.trim()) throw new Error('answerFinanceQuestion: question is empty');
  const provider = chooseProvider();
  if (provider === 'ollama') return chatWithOllama(question, context);
  if (provider === 'groq') return chatWithGroq(question, context);
  if (provider === 'claude') return chatWithClaude(question, context);
  throw new Error(`Unknown PARSER_PROVIDER "${provider}" (use "ollama", "groq", or "claude")`);
}
