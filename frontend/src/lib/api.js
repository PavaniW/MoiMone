// Thin wrapper around the backend API.
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Transactions
  getTransactions: (params = '') => request(`/api/transactions${params}`),
  createTransaction: (data) =>
    request('/api/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id, data) =>
    request(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (id) => request(`/api/transactions/${id}`, { method: 'DELETE' }),

  // Budgets
  getBudgets: (params = '') => request(`/api/budgets${params}`),
  upsertBudget: (data) =>
    request('/api/budgets', { method: 'POST', body: JSON.stringify(data) }),

  // Goals
  getGoals: () => request('/api/goals'),
  createGoal: (data) => request('/api/goals', { method: 'POST', body: JSON.stringify(data) }),
  updateGoal: (id, data) =>
    request(`/api/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Categories
  getCategories: () => request('/api/categories'),

  // Chat
  chat: (message) => request('/api/chat', { method: 'POST', body: JSON.stringify({ message }) }),
};
