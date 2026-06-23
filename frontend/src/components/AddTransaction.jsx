import { useState } from 'react';
import { api } from '../lib/api.js';

// Today as yyyy-mm-dd for the date input default.
function today() {
  return new Date().toISOString().slice(0, 10);
}

// Build the form state from an existing transaction (edit) or blank (create).
function toForm(categories, t) {
  if (!t) {
    return {
      type: 'expense',
      amount: '',
      merchant: '',
      category: categories[0]?.name || 'Other',
      transaction_date: today(),
      description: '',
      payment_method: '',
      card_last4: '',
    };
  }
  return {
    type: t.type || 'expense',
    amount: t.amount != null ? String(t.amount) : '',
    merchant: t.merchant || '',
    category: t.category || categories[0]?.name || 'Other',
    transaction_date: (t.transaction_date || '').slice(0, 10) || today(),
    description: t.description || '',
    payment_method: t.payment_method || '',
    card_last4: t.card_last4 || '',
  };
}

// Transaction form. Doubles as create (POST) and edit (PUT):
//   • create mode (no `initial`): saves a new row, calls onCreated(row)
//   • edit mode (`initial` set): updates that row, calls onUpdated(row)
// onCancel, when provided, renders a Cancel button (used by the edit modal).
export default function AddTransaction({ categories = [], initial = null, onCreated, onUpdated, onCancel }) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState(() => toForm(categories, initial));
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

    const payload = {
      type: form.type,
      amount: Number(form.amount),
      merchant: form.merchant.trim() || null,
      category: form.category,
      transaction_date: form.transaction_date,
      description: form.description.trim() || null,
      payment_method: form.payment_method || null,
      card_last4: form.card_last4.trim() || null,
    };

    setSaving(true);
    try {
      if (isEdit) {
        const updated = await api.updateTransaction(initial.id, payload);
        onUpdated?.(updated);
      } else {
        const created = await api.createTransaction(payload);
        setForm(toForm(categories, null));
        onCreated?.(created);
      }
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
        {onCancel && (
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add entry'}
        </button>
      </div>
    </form>
  );
}
