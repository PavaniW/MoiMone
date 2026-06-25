import { useEffect, useMemo, useRef, useState } from 'react';
import AddTransaction from '../components/AddTransaction.jsx';
import Loading from '../components/Loading.jsx';
import { formatAmount, formatDay, formatCard, CURRENCY } from '../lib/format.js';
import { api } from '../lib/api.js';
import { useSpace } from '../space.jsx';

const FALLBACK_COLOR = '#9A9384';
const SOURCES = ['sms', 'email', 'whatsapp', 'manual'];

// Label for a transaction's payment: the registered card's name (embedded from
// the API, so a partner's card resolves too; else our own list), else raw method.
function cardLabel(t, cardsById) {
  const c = t.card || (t.card_id && cardsById[t.card_id]);
  if (c) return c.last4 ? `${c.nickname} ••${c.last4}` : c.nickname;
  return formatCard(t.payment_method, t.card_last4);
}

// Page 2 — Transactions: searchable/filterable ledger, inline category quick-edit,
// full edit via a modal, and delete.
export default function Transactions() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [goalsList, setGoalsList] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null); // transaction being edited, or null
  const { currentSpaceId, currentSpace, refreshTick } = useSpace();
  const loadedSpace = useRef(null);

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [source, setSource] = useState('');
  const [type, setType] = useState('');
  const [card, setCard] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [needsReview, setNeedsReview] = useState(false);

  const hasFilters = Boolean(q || category || source || type || card || dateFrom || dateTo || needsReview);
  function resetFilters() {
    setQ('');
    setCategory('');
    setSource('');
    setType('');
    setCard('');
    setDateFrom('');
    setDateTo('');
    setNeedsReview(false);
  }

  // Auto-imported (not manual) entries the parser couldn't categorize → "Other".
  const isReview = (t) => t.source !== 'manual' && t.category === 'Other';

  useEffect(() => {
    if (!currentSpaceId) return; // wait for the active space
    let active = true;
    if (loadedSpace.current !== currentSpaceId) setStatus('loading');
    loadedSpace.current = currentSpaceId;
    (async () => {
      try {
        const [txns, cats, cds, gls] = await Promise.all([
          api.getTransactions(`?space=${currentSpaceId}`),
          api.getCategories(),
          api.getCards(),
          api.getGoals(`?space=${currentSpaceId}`),
        ]);
        if (active) {
          setRows(txns);
          setCategories(cats);
          setCards(cds);
          setGoalsList(gls);
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
  }, [currentSpaceId, refreshTick]);

  // For shared spaces: map a member's user id → display name ("You" for self).
  const memberName = useMemo(
    () =>
      Object.fromEntries(
        (currentSpace?.members || []).map((m) => [m.userId, m.isYou ? 'You' : m.name])
      ),
    [currentSpace]
  );
  const isShared = currentSpace?.kind === 'shared';

  const colorOf = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name, c.color])),
    [categories]
  );
  const cardsById = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, c])), [cards]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((t) => {
      if (category && t.category !== category) return false;
      if (source && t.source !== source) return false;
      if (type && t.type !== type) return false;
      if (card) {
        if (card === 'cash') {
          if (t.payment_method !== 'cash') return false;
        } else if (t.card_id !== card) return false;
      }
      if (dateFrom || dateTo) {
        const d = (t.transaction_date || '').slice(0, 10);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
      }
      if (needsReview && !isReview(t)) return false;
      if (needle) {
        const hay = `${t.merchant || ''} ${t.description || ''} ${t.category}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, category, source, type, card, dateFrom, dateTo, needsReview]);

  const reviewCount = useMemo(() => rows.filter(isReview).length, [rows]);

  // Net = what's left in hand: income − expense − savings (savings is money
  // moved out of spendable cash, so it reduces the net too).
  const total = useMemo(
    () =>
      filtered.reduce((sum, t) => {
        if (t.type === 'income') return sum + Number(t.amount);
        // A plain transfer just moves between your own accounts (net 0); but a
        // goal-tagged transfer is a saving, so it leaves spendable cash.
        if (t.type === 'transfer') return t.goal_id ? sum - Number(t.amount) : sum;
        return sum - Number(t.amount); // expense + savings reduce money in hand
      }, 0),
    [filtered]
  );

  function handleCreated(txn) {
    setRows((prev) => [txn, ...prev]);
    setShowAdd(false);
  }

  function handleUpdated(txn) {
    // If it was moved to a different space, drop it from this (scoped) view.
    setRows((rs) =>
      txn.space_id && txn.space_id !== currentSpaceId
        ? rs.filter((t) => t.id !== txn.id)
        : rs.map((t) => (t.id === txn.id ? txn : t))
    );
    setEditing(null);
  }

  async function handleCategoryChange(id, newCategory) {
    const prev = rows;
    setRows((rs) => rs.map((t) => (t.id === id ? { ...t, category: newCategory } : t)));
    try {
      await api.updateTransaction(id, { category: newCategory });
    } catch (err) {
      setRows(prev);
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

  if (status === 'loading') return <Loading label="Loading transactions…" />;
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
          <div className="stmt-eyebrow">Activity</div>
          <h2 className="stmt-title">Transactions</h2>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? 'Close' : '+ Add entry'}
        </button>
      </header>

      {showAdd && (
        <div className="panel" style={{ marginTop: '1.25rem' }}>
          <AddTransaction
            categories={categories}
            cards={cards}
            goals={goalsList}
            spaceId={currentSpaceId}
            onCreated={handleCreated}
          />
        </div>
      )}

      {reviewCount > 0 && (
        <button
          type="button"
          className={`review-toggle ${needsReview ? 'active' : ''}`}
          onClick={() => setNeedsReview((v) => !v)}
        >
          ⚠ {reviewCount} to review
          <span className="review-hint">{needsReview ? '— showing' : '— uncategorized imports'}</span>
        </button>
      )}

      {/* Filters */}
      <div className="filters">
        <input
          className="field-input filter-search"
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
          <option value="savings">Savings</option>
          <option value="transfer">Transfer</option>
        </select>
        <select className="field-input" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="field-input" value={card} onChange={(e) => setCard(e.target.value)}>
          <option value="">All cards</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nickname}
              {c.last4 ? ` ••${c.last4}` : ''}
            </option>
          ))}
          <option value="cash">Cash</option>
        </select>
        <label className="filter-date">
          <span className="filter-date-label">From</span>
          <input className="field-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="filter-date">
          <span className="filter-date-label">To</span>
          <input className="field-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
      </div>

      {hasFilters && (
        <button className="filter-reset" type="button" onClick={resetFilters}>
          ✕ Reset filters
        </button>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="ledger" style={{ marginTop: '1rem' }}>
        <div className="panel-head">
          <h3 className="panel-title">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </h3>
          <span className="panel-note">
            net {total >= 0 ? '+' : '−'} {CURRENCY} {formatAmount(Math.abs(total))}
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
              <span>Edit</span>
            </div>
            {filtered.map((t) => {
              const isIncome = t.type === 'income';
              // A goal-tagged transfer is a saving; treat it like one for display.
              const isGoalTransfer = t.type === 'transfer' && t.goal_id;
              const isSaving = t.type === 'savings' || isGoalTransfer;
              const isTransfer = t.type === 'transfer' && !isGoalTransfer;
              const label = isTransfer || isGoalTransfer ? '' : cardLabel(t, cardsById);
              const name = isGoalTransfer
                ? `Savings → ${t.goal?.name || 'Goal'}`
                : t.type === 'savings'
                  ? t.goal?.name
                    ? `Savings → ${t.goal.name}`
                    : 'Savings'
                  : isTransfer
                    ? `Transfer: ${t.card?.nickname || '—'} → ${t.to_account?.nickname || '—'}`
                    : t.merchant || '—';
              return (
                <div className="ledger-row edit body" key={t.id}>
                  <span className="ledger-date num">{formatDay(t.transaction_date)}</span>
                  <span className="ledger-merchant">
                    <span
                      className="cat-dot"
                      style={{ background: colorOf[t.category] || FALLBACK_COLOR }}
                    />
                    <span className="merchant-text">
                      <span className="merchant-line">
                        <span className="merchant-name" title={name}>{name}</span>
                        {label && <span className="card-tag">{label}</span>}
                        {isShared && memberName[t.created_by] && (
                          <span className="who-tag">by {memberName[t.created_by]}</span>
                        )}
                      </span>
                    </span>
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
                  <span
                    className={`ledger-amount ${isIncome ? 'income' : isSaving ? 'saved' : isTransfer ? 'transfer' : 'expense'}`}
                  >
                    {isIncome ? '+' : isSaving ? '⇢' : isTransfer ? '⇄' : '−'}
                    <span className="sym">{CURRENCY}</span>
                    {formatAmount(Number(t.amount))}
                  </span>
                  <span className="row-actions">
                    <button className="row-edit" title="Edit" onClick={() => setEditing(t)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                      </svg>
                    </button>
                    <button className="row-del" title="Delete" onClick={() => handleDelete(t.id)}>
                      ✕
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="panel-empty">No transactions match these filters.</p>
        )}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="panel-title">Edit transaction</h3>
              <button className="row-del" title="Close" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>
            <AddTransaction
              categories={categories}
              cards={cards}
              goals={goalsList}
              initial={editing}
              onUpdated={handleUpdated}
              onCancel={() => setEditing(null)}
            />
          </div>
        </div>
      )}
    </section>
  );
}
