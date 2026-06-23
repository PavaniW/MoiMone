import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Loading, { Spinner } from '../components/Loading.jsx';
import BackLink from '../components/BackLink.jsx';

const PROTECTED = 'Other'; // parser fallback — can't be renamed/deleted
const EMPTY = { name: '', icon: '', color: '#2f6b4f' };

// Pencil (edit) icon — matches the app's other line icons.
const PencilIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

// Categories manager — add/edit/delete your own categories. They power the
// Add/Edit dropdown, budget colors, and the AI parser for incoming SMS/WhatsApp.
export default function Categories() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // Inline edit state: the id being edited + its working draft.
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(EMPTY);

  useEffect(() => {
    let active = true;
    api
      .getCategories()
      .then((data) => active && (setCats(data), setStatus('ready')))
      .catch((err) => active && (setError(err.message), setStatus('error')));
    return () => {
      active = false;
    };
  }, []);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setD = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }));

  async function add(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError('Give the category a name.');
    setSaving(true);
    try {
      const created = await api.createCategory({
        name: form.name.trim(),
        icon: form.icon.trim() || null,
        color: form.color,
      });
      setCats((c) => [...c, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c) {
    setError(null);
    setEditId(c.id);
    setDraft({ name: c.name, icon: c.icon || '', color: c.color || '#2f6b4f' });
  }

  async function saveEdit(id) {
    setError(null);
    if (!draft.name.trim()) return setError('Name cannot be empty.');
    try {
      const updated = await api.updateCategory(id, {
        name: draft.name.trim(),
        icon: draft.icon.trim() || null,
        color: draft.color,
      });
      setCats((c) =>
        c.map((x) => (x.id === id ? updated : x)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(c) {
    if (!window.confirm(`Delete "${c.name}"? Past transactions keep this label; it just won’t appear in the picker anymore.`)) {
      return;
    }
    const prev = cats;
    setCats((list) => list.filter((x) => x.id !== c.id));
    try {
      await api.deleteCategory(c.id);
    } catch (err) {
      setCats(prev);
      setError(err.message);
    }
  }

  if (status === 'loading') return <Loading label="Loading categories…" />;
  if (status === 'error') {
    return (
      <div className="dash-state">
        <p className="dash-state-title">Couldn’t load categories</p>
        <p className="dash-state-detail">{error}</p>
      </div>
    );
  }

  return (
    <section>
      <BackLink />
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Organize</div>
          <h2 className="stmt-title">Categories</h2>
        </div>
        <span className="stmt-period num">{cats.length}</span>
      </header>

      <p className="setup-intro">
        Your categories power the entry picker, budget colors, and the AI parser that files your
        bank SMS and WhatsApp messages — so custom categories work everywhere.
      </p>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Add a Category</h3>
        </div>
        <form className="entry-form" onSubmit={add}>
          <div className="cat-form-grid">
            <label className="field">
              <span className="field-label">Emoji</span>
              <input
                className="field-input cat-emoji-input"
                type="text"
                value={form.icon}
                onChange={set('icon')}
                placeholder="🍕"
                maxLength={2}
              />
            </label>
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="field-input"
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="e.g. Groceries"
                maxLength={40}
              />
            </label>
            <label className="field">
              <span className="field-label">Color</span>
              <input
                className="cat-color-input"
                type="color"
                value={form.color}
                onChange={set('color')}
                aria-label="category color"
              />
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? <><Spinner size={14} />Saving…</> : 'Add category'}
            </button>
          </div>
        </form>
      </div>

      <div className="cat-list">
        {cats.map((c) =>
          editId === c.id ? (
            <div className="cat-row editing" key={c.id}>
              <input
                className="field-input cat-emoji-input"
                type="text"
                value={draft.icon}
                onChange={setD('icon')}
                maxLength={2}
                placeholder="🙂"
              />
              <input
                className="field-input"
                type="text"
                value={draft.name}
                onChange={setD('name')}
                maxLength={40}
                disabled={c.name === PROTECTED}
              />
              <input
                className="cat-color-input"
                type="color"
                value={draft.color}
                onChange={setD('color')}
                aria-label="category color"
              />
              <div className="cat-row-actions">
                <button className="btn-primary btn-sm" onClick={() => saveEdit(c.id)}>
                  Save
                </button>
                <button className="btn-secondary btn-sm" onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="cat-row" key={c.id}>
              <span className="cat-icon">{c.icon || '•'}</span>
              <span className="cat-name">
                <span className="cat-dot" style={{ background: c.color || '#9A9384' }} />
                {c.name}
              </span>
              <div className="cat-row-actions">
                <button className="row-edit" title="Edit" onClick={() => startEdit(c)}>
                  <PencilIcon />
                </button>
                {c.name !== PROTECTED && (
                  <button className="row-del" title="Delete" onClick={() => remove(c)}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </section>
  );
}
