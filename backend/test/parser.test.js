import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileAmount,
  reconcileBalance,
  cleanDate,
  normalize,
  CATEGORIES,
} from '../services/parser.js';

// --- reconcileAmount: trust the model's number only if it appears in the text ---
test('reconcileAmount keeps the model amount when it matches the text', () => {
  assert.equal(reconcileAmount('Spent LKR 1,500 at Lulu', 1500), 1500);
});

test('reconcileAmount falls back to the first currency figure when the model misreads', () => {
  // Model said 1600, but the only figure in the text is 1,500 → use 1500.
  assert.equal(reconcileAmount('Spent LKR 1,500 at Lulu', 1600), 1500);
});

test('reconcileAmount keeps the model amount when the text has no currency figure', () => {
  assert.equal(reconcileAmount('spent 500 on lunch', 500), 500);
});

// --- reconcileBalance: only honor a stated balance ---
test('reconcileBalance honors a balance when the message mentions one', () => {
  assert.equal(reconcileBalance('Purchase 500. Avl Bal 20000', 20000), 20000);
});

test('reconcileBalance drops a balance the message never stated', () => {
  assert.equal(reconcileBalance('Purchase 500 at Lulu', 20000), null);
});

// --- cleanDate: valid ISO, or null for missing/implausible ---
test('cleanDate accepts a valid date', () => {
  assert.match(cleanDate('2026-01-05'), /^2026-01-05/);
});

test('cleanDate rejects empty, garbage, and out-of-range years', () => {
  assert.equal(cleanDate(''), null);
  assert.equal(cleanDate('not a date'), null);
  assert.equal(cleanDate('1850-01-01'), null);
});

// --- normalize: guarantee a safe, consistent shape regardless of model output ---
test('normalize coerces a messy model object into a valid transaction', () => {
  const out = normalize(
    { amount: -50, type: 'weird', category: 'Nope', payment_method: 'btc', card_last4: '12345', confidence: 5 },
    ['Food & Dining']
  );
  assert.equal(out.amount, 50); // absolute value
  assert.equal(out.type, 'expense'); // unknown type → expense
  assert.equal(out.category, 'Other'); // category not in the allowed list
  assert.equal(out.payment_method, 'other'); // unknown method
  assert.equal(out.card_last4, null); // 5 digits is not a valid last-4
  assert.equal(out.confidence, 0.5); // out-of-range confidence → default
});

test('normalize keeps valid values intact', () => {
  const out = normalize(
    { amount: 1200, type: 'income', category: 'Salary', payment_method: 'debit', card_last4: '4521', confidence: 0.9 },
    CATEGORIES
  );
  assert.equal(out.amount, 1200);
  assert.equal(out.type, 'income');
  assert.equal(out.category, 'Salary');
  assert.equal(out.payment_method, 'debit');
  assert.equal(out.card_last4, '4521');
  assert.equal(out.confidence, 0.9);
});
