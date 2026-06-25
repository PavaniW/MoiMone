import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatAmount, CURRENCY } from '../lib/format.js';
import Loading, { Spinner } from '../components/Loading.jsx';
import BackLink from '../components/BackLink.jsx';

const SWATCHES = ['#2f6b4f', '#b0563c', '#45B7D1', '#DDA0DD', '#FFC857', '#4ECDC4'];
const EMPTY = { nickname: '', bank: '', type: 'credit', last4: '', color: SWATCHES[0], balance: '' };

// Accounts manager — cards, bank accounts and cash are all "accounts" (one
// `cards` table). Register each once; bank SMS auto-link by last 4 digits,
// manual entry and transfers let you pick from these.
export default function Cards() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [cards, setCards] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [editBalId, setEditBalId] = useState(null); // account whose balance is being edited
  const [balDraft, setBalDraft] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getCards()
      .then((data) => active && (setCards(data), setStatus('ready')))
      .catch((err) => active && (setError(err.message), setStatus('error')));
    return () => {
      active = false;
    };
  }, []);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!form.nickname.trim()) return setError('Give the account a name.');

    setSaving(true);
    try {
      const created = await api.createCard({
        nickname: form.nickname.trim(),
        bank: form.bank.trim() || null,
        type: form.type,
        last4: form.last4.trim() || null,
        color: form.color,
        balance: form.balance === '' ? 0 : Number(form.balance),
      });
      setCards((c) => [...c, created]);
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startBal(c) {
    setError(null);
    setBalDraft(String(c.balance ?? 0));
    setEditBalId(c.id);
  }

  async function saveBal(c) {
    const n = Number(balDraft);
    if (Number.isNaN(n)) return setError('Enter a number.');
    try {
      const updated = await api.updateCard(c.id, { balance: n });
      setCards((cs) => cs.map((x) => (x.id === c.id ? updated : x)));
      setEditBalId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this account? Past transactions keep their details; they just won’t be linked to a named account.')) {
      return;
    }
    const prev = cards;
    setCards((c) => c.filter((x) => x.id !== id));
    try {
      await api.deleteCard(id);
    } catch (err) {
      setCards(prev);
      setError(err.message);
    }
  }

  if (status === 'loading') return <Loading label="Loading accounts…" />;
  if (status === 'error') {
    return (
      <div className="dash-state">
        <p className="dash-state-title">Couldn’t load accounts</p>
        <p className="dash-state-detail">{error}</p>
      </div>
    );
  }

  return (
    <section>
      <BackLink />
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Wallet</div>
          <h2 className="stmt-title">Accounts</h2>
        </div>
        <span className="stmt-period num">{cards.length}</span>
      </header>

      <p className="setup-intro">
        Your accounts — cards, bank accounts and cash. Register each once: bank SMS auto-match by
        the last 4 digits, manual entry lets you pick one, and you can move money between them with
        a Transfer. Spending and balances are tracked per account.
      </p>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Add an Account</h3>
        </div>
        <form className="entry-form" onSubmit={submit}>
          <div className="seg">
            {['credit', 'debit', 'bank'].map((t) => (
              <button
                key={t}
                type="button"
                className={form.type === t ? 'seg-btn active' : 'seg-btn'}
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                style={{ textTransform: 'capitalize' }}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="field-grid">
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="field-input"
                type="text"
                value={form.nickname}
                onChange={set('nickname')}
                placeholder="e.g. HSBC Visa, Sampath Savings, Cash"
              />
            </label>
            <label className="field">
              <span className="field-label">Bank (optional)</span>
              <input
                className="field-input"
                type="text"
                value={form.bank}
                onChange={set('bank')}
                placeholder="e.g. HSBC"
              />
            </label>
            <label className="field">
              <span className="field-label">Last 4 digits</span>
              <input
                className="field-input num"
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={form.last4}
                onChange={set('last4')}
                placeholder="4521"
              />
            </label>
            <label className="field">
              <span className="field-label">Opening balance</span>
              <input
                className="field-input num"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={form.balance}
                onChange={set('balance')}
                placeholder="0.00"
              />
            </label>
            <label className="field">
              <span className="field-label">Color</span>
              <div className="swatches">
                {SWATCHES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={form.color === c ? 'swatch active' : 'swatch'}
                    style={{ background: c }}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    aria-label={`color ${c}`}
                  />
                ))}
              </div>
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? <><Spinner size={14} />Saving…</> : 'Add account'}
            </button>
          </div>
        </form>
      </div>

      {cards.length ? (
        <div className="goal-grid">
          {cards.map((c) => (
            <div className="goal-card" key={c.id}>
              <div className="goal-head">
                <span className="goal-name">
                  <span className="cat-dot" style={{ background: c.color || '#9A9384' }} />
                  {c.nickname}
                </span>
                <button className="row-del" title="Delete account" onClick={() => remove(c.id)}>
                  ✕
                </button>
              </div>
              <div className="card-meta num">
                {c.bank ? `${c.bank} · ` : ''}
                {c.type}
                {c.last4 ? ` ••${c.last4}` : ''}
              </div>
              {editBalId === c.id ? (
                <div className="card-bal-edit">
                  <input
                    className="field-input num"
                    type="number"
                    step="0.01"
                    value={balDraft}
                    onChange={(e) => setBalDraft(e.target.value)}
                    autoFocus
                  />
                  <button className="btn-primary btn-sm" type="button" onClick={() => saveBal(c)}>
                    Save
                  </button>
                  <button className="btn-secondary btn-sm" type="button" onClick={() => setEditBalId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className={`card-bal num ${Number(c.balance) < 0 ? 'neg' : ''}`}
                  title="Tap to set balance"
                  onClick={() => startBal(c)}
                >
                  {CURRENCY} {formatAmount(Number(c.balance || 0))}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-empty">No accounts yet — add your first above.</p>
      )}
    </section>
  );
}
