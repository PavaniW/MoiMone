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

export { CURRENCY };
