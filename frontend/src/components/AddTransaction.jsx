import { useState } from 'react';
import { api } from '../lib/api.js';

// Today as yyyy-mm-dd for the date input default.
function today() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY = (categories) => ({
  type: 'expense',
  amount: '',
  merchant: '',
  category: categories[0]?.name || 'Other',
  transaction_date: today(),
  description: '',
  payment_method: '',
  card_last4: '',
});

// Manual transaction entry form. Posts to /api/transactions and hands the saved
// row back to the parent via onCreated so the list can update without a refetch.
export default function AddTransaction({ categories = [], onCreated }) {
  const [form, setForm] = useState(() => EMPTY(categories));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(null);

    if (!Number(form.amount)) {
      setError('Enter an amount.');
      return;
    }

    setSaving(true);
    try {
      const created = await api.createTransaction({
        type: form.type,
        amount: Number(form.amount),
        merchant: form.merchant.trim() || null,
        category: form.category,
        transaction_date: form.transaction_date,
        description: form.description.trim() || null,
        payment_method: form.payment_method || null,
        card_last4: form.card_last4.trim() || null,
      });
      setForm(EMPTY(categories));
      onCreated?.(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="entry-form" onSubmit={submit}>
      <div className="seg">
        <button
          type="button"
          className={form.type === 'expense' ? 'seg-btn active' : 'seg-btn'}
          onClick={() => setForm((f) => ({ ...f, type: 'expense' }))}
        >
          Expense
        </button>
        <button
          type="button"
          className={form.type === 'income' ? 'seg-btn active' : 'seg-btn'}
          onClick={() => setForm((f) => ({ ...f, type: 'income' }))}
        >
          Income
        </button>
      </div>

      <div className="field-grid">
        <label className="field">
          <span className="field-label">Amount</span>
          <input
            className="field-input num"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={form.amount}
            onChange={set('amount')}
            placeholder="0.00"
          />
        </label>

        <label className="field">
          <span className="field-label">Merchant</span>
          <input
            className="field-input"
            type="text"
            value={form.merchant}
            onChange={set('merchant')}
            placeholder="e.g. Keells"
          />
        </label>

        <label className="field">
          <span className="field-label">Category</span>
          <select className="field-input" value={form.category} onChange={set('category')}>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.icon ? `${c.icon}  ` : ''}
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Date</span>
          <input
            className="field-input num"
            type="date"
            value={form.transaction_date}
            onChange={set('transaction_date')}
          />
        </label>

        <label className="field">
          <span className="field-label">Paid with</span>
          <select className="field-input" value={form.payment_method} onChange={set('payment_method')}>
            <option value="">—</option>
            <option value="credit">Credit card</option>
            <option value="debit">Debit card</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Card last 4</span>
          <input
            className="field-input num"
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={form.card_last4}
            onChange={set('card_last4')}
            placeholder="4521"
            disabled={form.payment_method !== 'credit' && form.payment_method !== 'debit'}
          />
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add entry'}
        </button>
      </div>
    </form>
  );
}
