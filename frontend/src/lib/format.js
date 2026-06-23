const CURRENCY = 'LKR';

// "1,240.50" — grouped, always 2 decimals, no symbol (symbol set in markup).
export function formatAmount(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
}

export function formatMoney(value) {
  return `${CURRENCY} ${formatAmount(value)}`;
}

// "18 Jun" from an ISO date string.
export function formatDay(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

const METHOD_LABEL = { credit: 'Credit', debit: 'Debit', cash: 'Cash', other: 'Other' };

// "Credit ••4521" / "Debit" / "Cash" / "" — a short label for the payment card.
export function formatCard(payment_method, card_last4) {
  if (!payment_method) return '';
  const label = METHOD_LABEL[payment_method] || payment_method;
  return card_last4 ? `${label} ••${card_last4}` : label;
}

// Stable key for grouping spend by card, e.g. "credit:4521" or "cash".
export function cardKey(payment_method, card_last4) {
  if (!payment_method) return 'unknown';
  return card_last4 ? `${payment_method}:${card_last4}` : payment_method;
}

export { CURRENCY };
