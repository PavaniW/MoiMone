import { supabase } from './supabase.js';

// Thin wrapper around the backend API.
// Default: same-origin in production (the API is a serverless function on the
// same domain, reached via /api/*), and the local Express server during dev. Set
// VITE_API_URL to override — e.g. when the backend is hosted separately.
const BASE =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '');

async function request(path, options = {}) {
  // Attach the signed-in user's access token so the backend can identify them.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (res.status === 401) {
    // Session missing/expired — drop it so the app shows the login screen.
    await supabase.auth.signOut();
    throw new Error('Your session expired — please sign in again.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Current user + their spaces + ingest token
  me: () => request('/api/me'),
  regenerateIngestToken: () => request('/api/me/ingest-token', { method: 'POST' }),
  updateWhatsApp: (number) =>
    request('/api/me/whatsapp', { method: 'PUT', body: JSON.stringify({ number }) }),

  // Spaces (personal / shared household)
  getSpaces: () => request('/api/spaces'),
  createSpace: (name) => request('/api/spaces', { method: 'POST', body: JSON.stringify({ name }) }),
  addSpaceMember: (spaceId, email) =>
    request(`/api/spaces/${spaceId}/members`, { method: 'POST', body: JSON.stringify({ email }) }),
  removeSpaceMember: (spaceId, userId) =>
    request(`/api/spaces/${spaceId}/members/${userId}`, { method: 'DELETE' }),

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
  deleteBudget: (id) => request(`/api/budgets/${id}`, { method: 'DELETE' }),

  // Goals
  getGoals: (params = '') => request(`/api/goals${params}`),
  createGoal: (data) => request('/api/goals', { method: 'POST', body: JSON.stringify(data) }),
  updateGoal: (id, data) =>
    request(`/api/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGoal: (id) => request(`/api/goals/${id}`, { method: 'DELETE' }),

  // Cards
  getCards: () => request('/api/cards'),
  createCard: (data) => request('/api/cards', { method: 'POST', body: JSON.stringify(data) }),
  updateCard: (id, data) => request(`/api/cards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCard: (id) => request(`/api/cards/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: () => request('/api/categories'),
  createCategory: (data) =>
    request('/api/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) =>
    request(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/api/categories/${id}`, { method: 'DELETE' }),

  // Chat
  chat: (message) => request('/api/chat', { method: 'POST', body: JSON.stringify({ message }) }),
};
