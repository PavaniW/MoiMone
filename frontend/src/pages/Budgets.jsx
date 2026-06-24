import { useEffect, useMemo, useRef, useState } from 'react';
import BudgetBar from '../components/BudgetBar.jsx';
import Loading, { Spinner } from '../components/Loading.jsx';
import { formatAmount, CURRENCY } from '../lib/format.js';
import { api } from '../lib/api.js';
import { useSpace } from '../space.jsx';

const FALLBACK_COLOR = '#9A9384';

const now = new Date();
const PERIOD = {
  month: now.getMonth() + 1,
  year: now.getFullYear(),
  label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
};
const PARAMS = `?month=${PERIOD.month}&year=${PERIOD.year}`;

// Page 3 — Budgets: set a monthly limit per category, see progress, delete.
export default function Budgets() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);

  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const { currentSpaceId, refreshTick } = useSpace();
  const loadedSpace = useRef(null);

  async function load() {
    const sp = `&space=${currentSpaceId}`;
    const [b, cats] = await Promise.all([api.getBudgets(PARAMS + sp), api.getCategories()]);
    setBudgets(b);
    setCategories(cats);
    if (!category) setCategory(cats[0]?.name || '');
  }

  useEffect(() => {
    if (!currentSpaceId) return; // wait for the active space
    let active = true;
    if (loadedSpace.current !== currentSpaceId) setStatus('loading');
    loadedSpace.current = currentSpaceId;
    (async () => {
      try {
        await load();
        if (active) setStatus('ready');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpaceId, refreshTick]);

  const colorOf = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name, c.color])),
    [categories]
  );

  const decorated = useMemo(
    () =>
      budgets
        .map((b) => ({
          ...b,
          monthly_limit: Number(b.monthly_limit),
          spent: Number(b.spent),
          color: colorOf[b.category] || FALLBACK_COLOR,
        }))
        .sort((a, b) => a.category.localeCompare(b.category)),
    [budgets, colorOf]
  );

  // Existing limit for the selected category, to prefill the input.
  function selectCategory(name) {
    setCategory(name);
    const existing = budgets.find((b) => b.category === name);
    setLimit(existing ? String(Number(existing.monthly_limit)) : '');
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!(Number(limit) > 0)) {
      setError('Enter a positive monthly limit.');
      return;
    }
    setSaving(true);
    try {
      await api.upsertBudget({
        category,
        monthly_limit: Number(limit),
        month: PERIOD.month,
        year: PERIOD.year,
        space_id: currentSpaceId,
      });
      setLimit('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    const prev = budgets;
    setBudgets((bs) => bs.filter((b) => b.id !== id));
    try {
      await api.deleteBudget(id);
    } catch (err) {
      setBudgets(prev);
      setError(err.message);
    }
  }

  if (status === 'loading') return <Loading label="Loading budgets…" />;
  if (status === 'error') {
    return (
      <div className="dash-state">
        <p className="dash-state-title">Couldn’t load budgets</p>
        <p className="dash-state-detail">{error}</p>
      </div>
    );
  }

  return (
    <section>
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Limits</div>
          <h2 className="stmt-title">Budgets</h2>
        </div>
        <span className="stmt-period num">{PERIOD.label}</span>
      </header>

      <div className="dash-grid" style={{ marginTop: '1.5rem' }}>
        {/* Set / update a budget */}
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Set a Limit</h3>
            <span className="panel-note">{PERIOD.label}</span>
          </div>
          <form className="entry-form" onSubmit={submit}>
            <div className="field-grid">
              <label className="field">
                <span className="field-label">Category</span>
                <select
                  className="field-input"
                  value={category}
                  onChange={(e) => selectCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.icon ? `${c.icon}  ` : ''}
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Monthly limit ({CURRENCY})</span>
                <input
                  className="field-input num"
                  type="number"
                  step="0.01"
                  min="0"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? <><Spinner size={14} />Saving…</> : 'Save limit'}
              </button>
            </div>
          </form>
        </div>

        {/* Progress */}
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Progress</h3>
            <span className="panel-note">{decorated.length} set</span>
          </div>
          {decorated.length ? (
            <div className="budget-list">
              {decorated.map((b) => (
                <div className="budget-with-del" key={b.id}>
                  <BudgetBar {...b} />
                  <button className="row-del" title="Delete budget" onClick={() => remove(b.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="panel-empty">No budgets set for this month yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
