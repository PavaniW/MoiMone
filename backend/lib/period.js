// Half-open ISO timestamp bounds [start, end) for a 1–12 month and year.
// Used to filter TIMESTAMPTZ columns by calendar month.
export function monthRange(month, year) {
  const m = Number(month);
  const y = Number(year);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  return { start, end };
}

// Current month/year (server local time) as a fallback when not supplied.
export function currentPeriod() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}
