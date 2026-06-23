import { useState } from 'react';
import { useSpace } from '../space.jsx';
import { api } from '../lib/api.js';
import { Spinner } from '../components/Loading.jsx';
import BackLink from '../components/BackLink.jsx';

// One shared space: members, invite-by-email (owner), remove/leave.
function SharedSpace({ space, onChange }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function invite(e) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return;
    setBusy(true);
    try {
      await api.addSpaceMember(space.id, email.trim());
      setEmail('');
      await onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(m) {
    const self = m.isYou;
    const msg = self ? 'Leave this shared space?' : `Remove ${m.name} from the shared space?`;
    if (!window.confirm(msg)) return;
    setError(null);
    try {
      await api.removeSpaceMember(space.id, m.userId);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="panel" style={{ marginTop: '1.25rem' }}>
      <div className="panel-head">
        <h3 className="panel-title">👥 {space.name}</h3>
        <span className="panel-note">
          {space.members.length} member{space.members.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="settings-list">
        {space.members.map((m) => (
          <div className="settings-row" key={m.userId} style={{ cursor: 'default' }}>
            <span className="settings-row-label">
              {m.isYou ? `${m.name} (you)` : m.name}
              {m.role === 'owner' && <span className="who-tag">owner</span>}
            </span>
            {(space.isOwner || m.isYou) && !(m.role === 'owner' && m.isYou) && (
              <button className="row-del" title={m.isYou ? 'Leave' : 'Remove'} onClick={() => removeMember(m)}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {space.isOwner ? (
        <form className="entry-form" onSubmit={invite} style={{ marginTop: '0.85rem' }}>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Invite by email</span>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="their-google@email.com"
              />
            </label>
          </div>
          <p className="setup-note">They must have signed in to MoiMone at least once first.</p>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? <><Spinner size={14} />Adding…</> : 'Add member'}
            </button>
          </div>
        </form>
      ) : (
        <>
          {error && <p className="form-error">{error}</p>}
          <p className="setup-note">Only the owner can add or remove members.</p>
        </>
      )}
    </div>
  );
}

// Settings → Household: create a shared space and manage who's in it.
export default function Household() {
  const { spaces, refresh, selectSpace } = useSpace();
  const shared = spaces.filter((s) => s.kind === 'shared');

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  async function create(e) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const space = await api.createSpace(name.trim() || 'Shared');
      await refresh();
      selectSpace(space.id);
      setName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section>
      <BackLink />
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Shared</div>
          <h2 className="stmt-title">Shared Space</h2>
        </div>
      </header>

      <p className="setup-intro">
        A space you share with someone else — for common expenses tracked once and visible to all
        members. Your <strong>personal</strong> space stays private. Switch between them with the
        “Viewing” selector.
      </p>

      {shared.map((s) => (
        <SharedSpace key={s.id} space={s} onChange={refresh} />
      ))}

      <div className="panel" style={{ marginTop: shared.length ? '1.25rem' : 0 }}>
        <div className="panel-head">
          <h3 className="panel-title">
            {shared.length ? 'Create another shared space' : 'Create a shared space'}
          </h3>
        </div>
        <form className="entry-form" onSubmit={create}>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Home, Bali Trip, Wedding"
                maxLength={40}
              />
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={creating}>
              {creating ? <><Spinner size={14} />Creating…</> : 'Create shared space'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
