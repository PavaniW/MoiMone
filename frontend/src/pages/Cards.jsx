import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const SWATCHES = ['#2f6b4f', '#b0563c', '#45B7D1', '#DDA0DD', '#FFC857', '#4ECDC4'];
const EMPTY = { nickname: '', bank: '', type: 'credit', last4: '', color: SWATCHES[0] };

// Cards manager — register your cards once; bank SMS auto-link by last 4 digits,
// and manual entry lets you pick from these.
export default function Cards() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [cards, setCards] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

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
    if (!form.nickname.trim()) return setError('Give the card a name.');

    setSaving(true);
    try {
      const created = await api.createCard({
        nickname: form.nickname.trim(),
        bank: form.bank.trim() || null,
        type: form.type,
        last4: form.last4.trim() || null,
        color: form.color,
      });
      setCards((c) => [...c, created]);
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this card? Past transactions keep their details; they just won’t be linked to a named card.')) {
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

  if (status === 'loading') return <div className="dash-state">Loading cards…</div>;
  if (status === 'error') {
    return (
      <div className="dash-state">
        <p className="dash-state-title">Couldn’t load cards</p>
        <p className="dash-state-detail">{error}</p>
      </div>
    );
  }

  return (
    <section>
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Wallet</div>
          <h2 className="stmt-title">Cards</h2>
        </div>
        <span className="stmt-period num">{cards.length}</span>
      </header>

      <p className="setup-intro">
        Register your cards once. Bank SMS auto-match to them by the last 4 digits, and manual
        entry lets you pick a card — so spending is tracked per card across all your banks.
      </p>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Add a Card</h3>
        </div>
        <form className="entry-form" onSubmit={submit}>
          <div className="seg">
            <button
              type="button"
              className={form.type === 'credit' ? 'seg-btn active' : 'seg-btn'}
              onClick={() => setForm((f) => ({ ...f, type: 'credit' }))}
            >
              Credit
            </button>
            <button
              type="button"
              className={form.type === 'debit' ? 'seg-btn active' : 'seg-btn'}
              onClick={() => setForm((f) => ({ ...f, type: 'debit' }))}
            >
              Debit
            </button>
          </div>

          <div className="field-grid">
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="field-input"
                type="text"
                value={form.nickname}
                onChange={set('nickname')}
                placeholder="e.g. HSBC Visa"
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
              {saving ? 'Saving…' : 'Add card'}
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
                <button className="row-del" title="Delete card" onClick={() => remove(c.id)}>
                  ✕
                </button>
              </div>
              <div className="card-meta num">
                {c.bank ? `${c.bank} · ` : ''}
                {c.type}
                {c.last4 ? ` ••${c.last4}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-empty">No cards yet — add your first above.</p>
      )}
    </section>
  );
}
