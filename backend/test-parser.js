import 'dotenv/config';
import { parseTransaction } from './services/parser.js';

// Sample bank notifications to exercise the parser. Replace these with 3–5 real
// messages from your bank to tune the prompt to your exact SMS format.
const SAMPLES = [
  'Your VISA card ending 4521 was used for SAR 85.50 at Starbucks Arabia on 18 Jun 2026',
  'Your card was charged SAR 150 at Noon.com',
  'Purchase of AED 42.00 at Careem. Avl bal AED 1,203.10',
  'Salary credited: SAR 9,000.00 from ACME CORP to your account ****1234',
  'You paid SAR 199 to STC for your monthly bill',
  'ATM withdrawal SAR 500 at Al Rajhi Bank ATM',
];

function fmt(p) {
  const sign = p.type === 'income' ? '+' : '-';
  return `${sign}${p.currency} ${p.amount}  |  ${p.merchant}  →  ${p.category}  (conf ${p.confidence})`;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('✗ ANTHROPIC_API_KEY is not set. Add it to backend/.env first.');
    process.exit(1);
  }

  console.log(`Parsing ${SAMPLES.length} sample messages...\n`);
  let failures = 0;

  for (const text of SAMPLES) {
    try {
      const parsed = await parseTransaction(text);
      console.log(`• ${text}`);
      console.log(`  ${fmt(parsed)}\n`);
    } catch (err) {
      failures += 1;
      console.error(`• ${text}`);
      console.error(`  ✗ ${err.message}\n`);
    }
  }

  if (failures) {
    console.error(`${failures}/${SAMPLES.length} failed.`);
    process.exit(1);
  }
  console.log('All samples parsed.');
}

main();
