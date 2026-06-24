import { useState } from 'react';
import { api } from '../lib/api.js';
import { Spinner } from './Loading.jsx';
import { useSpace } from '../space.jsx';

// Today as yyyy-mm-dd for the date input default.
function today() {
  return new Date().toISOString().slice(0, 10);
}

// Build the form state from an existing transaction (edit) or blank (create).
// `defaultSpace` is the space a new entry (or one without a space) belongs to.
function toForm(categories, t, defaultSpace) {
  if (!t) {
    return {
      type: 'expense',
      amount: '',
      merchant: '',
      category: categories[0]?.name || 'Other',
      transaction_date: today(),
      description: '',
      paidWith: '',
      space: defaultSpace || '',
      goal: '',
      from: '',
      to: '',
    };
  }
  return {
    type: t.type || 'expense',
    amount: t.amount != null ? String(t.amount) : '',
    merchant: t.merchant || '',
    category: t.category || categories[0]?.name || 'Other',
    transaction_date: (t.transaction_date || '').slice(0, 10) || today(),
    description: t.description || '',
    // A linked card wins; otherwise cash/other; otherwise none.
    paidWith: t.card_id
      ? `card:${t.card_id}`
      : t.payment_method === 'cash' || t.payment_method === 'other'
        ? t.payment_method
        : '',
    space: t.space_id || defaultSpace || '',
    goal: t.goal_id || '',
    from: t.type === 'transfer' ? t.card_id || '' : '',
    to: t.to_card_id || '',
  };
}

// Transaction form. Doubles as create (POST) and edit (PUT):
//   • create mode (no `initial`): saves a new row, calls onCreated(row)
//   • edit mode (`initial` set): updates that row, calls onUpdated(row)
// onCancel, when provided, renders a Cancel button (used by the edit modal).
export default function AddTransaction({ categories = [], cards = [], goals = [], spaceId = null, initial = null, onCreated, onUpdated, onCancel }) {
  const isEdit = Boolean(initial);
  const { spaces } = useSpace();
  const defaultSpace =
    initial?.space_id || spaceId || spaces.find((s) => s.kind === 'personal')?.id || spaces[0]?.id || '';
  const [form, setForm] = useState(() => toForm(categories, initial, defaultSpace));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [remember, setRemember] = useState(false); // teach merchant → category

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const isSavings = form.type === 'savings';
  const isTransfer = form.type === 'transfer';

  async function submit(e) {
    e.preventDefault();
    setError(null);

    if (!Number(form.amount)) {
      setError('Enter an amount.');
      return;
    }
    if (isTransfer && (!form.from || !form.to || form.from === form.to)) {
      setError('Pick two different accounts to transfer between.');
      return;
    }

    const payload = {
      type: form.type,
      amount: Number(form.amount),
      transaction_date: form.transaction_date,
      description: form.description.trim() || null,
    };

    if (isTransfer) {
      payload.card_id = form.from;
      payload.to_card_id = form.to;
    } else if (isSavings) {
      // Savings: set aside money, optionally linked to a goal. No card/category.
      payload.goal_id = form.goal || null;
    } else {
      payload.merchant = form.merchant.trim() || null;
      payload.category = form.category;
      payload.goal_id = null;
      // Resolve "Paid with": a registered card, or cash/other, or nothing.
      if (form.paidWith.startsWith('card:')) {
        payload.card_id = form.paidWith.slice(5);
      } else if (form.paidWith === 'cash' || form.paidWith === 'other') {
        payload.payment_method = form.paidWith;
        payload.card_id = null;
        payload.card_last4 = null;
      } else {
        payload.payment_method = null;
        payload.card_id = null;
        payload.card_last4 = null;
      }
    }

    setSaving(true);
    try {
      // Auto-learn: remember this merchant → category for future auto-imports.
      if (remember && form.merchant.trim() && form.category) {
        api.saveMerchantRule(form.merchant.trim(), form.category).catch(() => {});
      }
      if (isEdit) {
        const updated = await api.updateTransaction(initial.id, { ...payload, space_id: form.space });
        onUpdated?.(updated);
      } else {
        const created = await api.createTransaction({ ...payload, space_id: form.space || spaceId });
        setForm(toForm(categories, null, defaultSpace));
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
        <button
          type="button"
          className={form.type === 'savings' ? 'seg-btn active' : 'seg-btn'}
          onClick={() => setForm((f) => ({ ...f, type: 'savings' }))}
        >
          Savings
        </button>
        <button
          type="button"
          className={form.type === 'transfer' ? 'seg-btn active' : 'seg-btn'}
          onClick={() => setForm((f) => ({ ...f, type: 'transfer' }))}
        >
          Transfer
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

        {isTransfer && (
          <label className="field">
            <span className="field-label">From account</span>
            <select className="field-input" value={form.from} onChange={set('from')}>
              <option value="">—</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nickname}
                  {c.last4 ? ` ••${c.last4}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {isTransfer && (
          <label className="field">
            <span className="field-label">To account</span>
            <select className="field-input" value={form.to} onChange={set('to')}>
              <option value="">—</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nickname}
                  {c.last4 ? ` ••${c.last4}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {!isSavings && !isTransfer && (
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
        )}

        {!isSavings && !isTransfer && (
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
        )}

        {isSavings && (
          <label className="field">
            <span className="field-label">Goal (optional)</span>
            <select className="field-input" value={form.goal} onChange={set('goal')}>
              <option value="">— no goal —</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span className="field-label">Date</span>
          <input
            className="field-input num"
            type="date"
            value={form.transaction_date}
            onChange={set('transaction_date')}
          />
        </label>

        {!isSavings && !isTransfer && (
          <label className="field">
            <span className="field-label">Paid with</span>
            <select className="field-input" value={form.paidWith} onChange={set('paidWith')}>
              <option value="">—</option>
              {cards.map((c) => (
                <option key={c.id} value={`card:${c.id}`}>
                  {c.nickname}
                  {c.last4 ? ` ••${c.last4}` : ''}
                </option>
              ))}
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </label>
        )}

        {spaces.length > 1 && (
          <label className="field">
            <span className="field-label">Space</span>
            <select className="field-input" value={form.space} onChange={set('space')}>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.kind === 'personal' ? '👤 ' : '👥 '}
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="field" style={{ marginTop: '0.75rem' }}>
        <span className="field-label">Notes (optional)</span>
        <textarea
          className="field-input"
          rows={2}
          value={form.description}
          onChange={set('description')}
          placeholder="e.g. Hima's wedding gift, anniversary dinner…"
        />
      </label>

      {form.merchant.trim() && (
        <label className="remember-merchant">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>
            Remember: always file <strong>{form.merchant.trim()}</strong> under{' '}
            <strong>{form.category}</strong> for auto-imported messages
          </span>
        </label>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        {onCancel && (
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? <><Spinner size={14} />Saving…</> : isEdit ? 'Save changes' : 'Add entry'}
        </button>
      </div>
    </form>
  );
}
