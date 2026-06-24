import { useEffect, useRef, useState } from 'react';
import GoalCard from '../components/GoalCard.jsx';
import Loading, { Spinner } from '../components/Loading.jsx';
import { CURRENCY } from '../lib/format.js';
import { api } from '../lib/api.js';
import { useSpace } from '../space.jsx';

const SWATCHES = ['#2f6b4f', '#b0563c', '#45B7D1', '#DDA0DD', '#FFC857', '#4ECDC4'];

const EMPTY = { name: '', target_amount: '', deadline: '', color: SWATCHES[0] };

// Page 4 — Saving Goals: add a goal, track progress, add funds, delete.
export default function Goals() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [goals, setGoals] = useState([]);

  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const { currentSpaceId, refreshTick } = useSpace();
  const loadedSpace = useRef(null);

  useEffect(() => {
    if (!currentSpaceId) return; // wait for the active space
    let active = true;
    if (loadedSpace.current !== currentSpaceId) setStatus('loading');
    loadedSpace.current = currentSpaceId;
    (async () => {
      try {
        const data = await api.getGoals(`?space=${currentSpaceId}`);
        if (active) {
          setGoals(data);
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

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError('Give the goal a name.');
    if (!(Number(form.target_amount) > 0)) return setError('Enter a target amount.');

    setSaving(true);
    try {
      const created = await api.createGoal({
        name: form.name.trim(),
        target_amount: Number(form.target_amount),
        deadline: form.deadline || null,
        color: form.color,
        space_id: currentSpaceId,
      });
      setGoals((g) => [...g, created]);
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function addFunds(id, amount) {
    const updated = await api.updateGoal(id, { add_funds: amount });
    setGoals((g) => g.map((x) => (x.id === id ? updated : x)));
  }

  async function remove(id) {
    if (!window.confirm('Delete this goal?')) return;
    const prev = goals;
    setGoals((g) => g.filter((x) => x.id !== id));
    try {
      await api.deleteGoal(id);
    } catch (err) {
      setGoals(prev);
      setError(err.message);
    }
  }

  if (status === 'loading') return <Loading label="Loading goals…" />;
  if (status === 'error') {
    return (
      <div className="dash-state">
        <p className="dash-state-title">Couldn’t load goals</p>
        <p className="dash-state-detail">{error}</p>
      </div>
    );
  }

  return (
    <section>
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Saving</div>
          <h2 className="stmt-title">Goals</h2>
        </div>
        <span className="stmt-period num">{goals.length} active</span>
      </header>

      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-head">
          <h3 className="panel-title">New Goal</h3>
        </div>
        <form className="entry-form" onSubmit={submit}>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="field-input"
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="e.g. Emergency Fund"
              />
            </label>
            <label className="field">
              <span className="field-label">Target ({CURRENCY})</span>
              <input
                className="field-input num"
                type="number"
                step="0.01"
                min="0"
                value={form.target_amount}
                onChange={set('target_amount')}
                placeholder="0.00"
              />
            </label>
            <label className="field">
              <span className="field-label">Deadline (optional)</span>
              <input
                className="field-input num"
                type="date"
                value={form.deadline}
                onChange={set('deadline')}
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
              {saving ? <><Spinner size={14} />Saving…</> : 'Create goal'}
            </button>
          </div>
        </form>
      </div>

      {goals.length ? (
        <div className="goal-grid">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} onAddFunds={addFunds} onDelete={remove} />
          ))}
        </div>
      ) : (
        <p className="panel-empty">No saving goals yet — add one above.</p>
      )}
    </section>
  );
}
