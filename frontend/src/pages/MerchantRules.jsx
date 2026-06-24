import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Loading, { Spinner } from '../components/Loading.jsx';
import BackLink from '../components/BackLink.jsx';

// Settings → Auto-categorize: the learned merchant → category rules that
// auto-classify incoming bank SMS / WhatsApp. Add, review, or remove them.
export default function MerchantRules() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([api.getMerchantRules(), api.getCategories()])
      .then(([r, cats]) => {
        if (!active) return;
        setRules(r);
        setCategories(cats);
        setCategory(cats[0]?.name || '');
        setStatus('ready');
      })
      .catch((e) => active && (setError(e.message), setStatus('error')));
    return () => {
      active = false;
    };
  }, []);

  async function add(e) {
    e.preventDefault();
    setError(null);
    if (!merchant.trim()) return setError('Enter a merchant name.');
    setSaving(true);
    try {
      const rule = await api.saveMerchantRule(merchant.trim(), category);
      // Replace if the merchant already had a rule, else prepend.
      setRules((rs) => [rule, ...rs.filter((r) => r.id !== rule.id && r.merchant !== rule.merchant)]);
      setMerchant('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    const prev = rules;
    setRules((rs) => rs.filter((r) => r.id !== id));
    try {
      await api.deleteMerchantRule(id);
    } catch (err) {
      setRules(prev);
      setError(err.message);
    }
  }

  if (status === 'loading') return <Loading label="Loading rules…" />;
  if (status === 'error') {
    return (
      <div className="dash-state">
        <p className="dash-state-title">Couldn’t load rules</p>
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
          <h2 className="stmt-title">Auto-categorize</h2>
        </div>
        <span className="stmt-period num">{rules.length}</span>
      </header>

      <p className="setup-intro">
        When a bank SMS or WhatsApp message comes from one of these merchants, it’s filed under your
        chosen category automatically — instead of the AI guessing. The app also learns these when
        you tick “Remember” while adding or editing a transaction.
      </p>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Add a rule</h3>
        </div>
        <form className="entry-form" onSubmit={add}>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Merchant (as it appears in the message)</span>
              <input
                className="field-input"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="e.g. Keells, Mimosa"
              />
            </label>
            <label className="field">
              <span className="field-label">Category</span>
              <select className="field-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.icon ? `${c.icon}  ` : ''}
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? <><Spinner size={14} />Saving…</> : 'Add rule'}
            </button>
          </div>
        </form>
      </div>

      {rules.length ? (
        <div className="cat-list">
          {rules.map((r) => (
            <div className="cat-row" key={r.id}>
              <span className="cat-name">{r.merchant}</span>
              <span className="who-tag">{r.category}</span>
              <div className="cat-row-actions">
                <button className="row-del" title="Delete" onClick={() => remove(r.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-empty">No rules yet — add one above, or tick “Remember” on a transaction.</p>
      )}
    </section>
  );
}
