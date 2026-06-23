import { useEffect, useMemo, useState } from 'react';
import AddTransaction from '../components/AddTransaction.jsx';
import { formatAmount, formatDay, CURRENCY } from '../lib/format.js';
import { api } from '../lib/api.js';

const FALLBACK_COLOR = '#9A9384';
const SOURCES = ['sms', 'email', 'whatsapp', 'manual'];

// Page 2 — Transactions: searchable/filterable ledger, inline category edit, delete.
export default function Transactions() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [source, setSource] = useState('');
  const [type, setType] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [txns, cats] = await Promise.all([api.getTransactions(), api.getCategories()]);
        if (active) {
          setRows(txns);
          setCategories(cats);
          setStatus('ready');
        }
      } catch (err) {
        if (active) {
          setError(err.message);
          setStatus('error');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const colorOf = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name, c.color])),
    [categories]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((t) => {
      if (category && t.category !== category) return false;
      if (source && t.source !== source) return false;
      if (type && t.type !== type) return false;
      if (needle) {
        const hay = `${t.merchant || ''} ${t.description || ''} ${t.category}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, category, source, type]);

  const total = useMemo(
    () =>
      filtered.reduce((sum, t) => sum + (t.type === 'income' ? 1 : -1) * Number(t.amount), 0),
    [filtered]
  );

  function handleCreated(txn) {
    setRows((prev) => [txn, ...prev]);
    setShowAdd(false);
  }

  async function handleCategoryChange(id, newCategory) {
    const prev = rows;
    setRows((rs) => rs.map((t) => (t.id === id ? { ...t, category: newCategory } : t)));
    try {
      await api.updateTransaction(id, { category: newCategory });
    } catch (err) {
      setRows(prev); // revert on failure
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this transaction?')) return;
    const prev = rows;
    setRows((rs) => rs.filter((t) => t.id !== id));
    try {
      await api.deleteTransaction(id);
    } catch (err) {
      setRows(prev);
      setError(err.message);
    }
  }

  if (status === 'loading') return <div className="dash-state">Loading transactions…</div>;
  if (status === 'error') {
    return (
      <div className="dash-state">
        <p className="dash-state-title">Couldn’t load transactions</p>
        <p className="dash-state-detail">{error}</p>
      </div>
    );
  }

  return (
    <section>
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Ledger</div>
          <h2 className="stmt-title">Transactions</h2>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? 'Close' : '+ Add entry'}
        </button>
      </header>

      {showAdd && (
        <div className="panel" style={{ marginTop: '1.25rem' }}>
          <AddTransaction categories={categories} onCreated={handleCreated} />
        </div>
      )}

      {/* Filters */}
      <div className="filters">
        <input
          className="field-input"
          type="search"
          placeholder="Search merchant or note…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="field-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="field-input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
        <select className="field-input" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="ledger" style={{ marginTop: '1rem' }}>
        <div className="panel-head">
          <h3 className="panel-title">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </h3>
          <span className="panel-note">
            net {total >= 0 ? '+' : '−'} {CURRENCY} {formatAmount(total)}
          </span>
        </div>

        {filtered.length ? (
          <div className="ledger-table">
            <div className="ledger-row edit head">
              <span>Date</span>
              <span>Merchant</span>
              <span className="hide-sm">Category</span>
              <span className="hide-sm">Source</span>
              <span style={{ textAlign: 'right' }}>Amount</span>
              <span />
            </div>
            {filtered.map((t) => {
              const isIncome = t.type === 'income';
              return (
                <div className="ledger-row edit body" key={t.id}>
                  <span className="ledger-date num">{formatDay(t.transaction_date)}</span>
                  <span className="ledger-merchant">
                    <span
                      className="cat-dot"
                      style={{ background: colorOf[t.category] || FALLBACK_COLOR }}
                    />
                    {t.merchant || '—'}
                  </span>
                  <span className="hide-sm">
                    <select
                      className="cat-select"
                      value={t.category}
                      onChange={(e) => handleCategoryChange(t.id, e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="src-tag hide-sm">{t.source}</span>
                  <span className={`ledger-amount ${isIncome ? 'income' : 'expense'}`}>
                    {isIncome ? '+' : '−'}
                    <span className="sym">{CURRENCY}</span>
                    {formatAmount(Number(t.amount))}
                  </span>
                  <button
                    className="row-del"
                    title="Delete"
                    onClick={() => handleDelete(t.id)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="panel-empty">No transactions match these filters.</p>
        )}
      </div>
    </section>
  );
}
