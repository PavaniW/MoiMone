import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Loading, { Spinner } from '../components/Loading.jsx';
import BackLink from '../components/BackLink.jsx';

// WhatsApp — register the number that maps inbound messages to this account,
// and explain how to log expenses by texting the bot.
export default function WhatsAppSetup() {
  const [status, setStatus] = useState('loading');
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((d) => active && (setNumber(d.whatsappNumber || ''), setStatus('ready')))
      .catch((e) => active && (setError(e.message), setStatus('error')));
    return () => {
      active = false;
    };
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const { whatsappNumber } = await api.updateWhatsApp(number);
      setNumber(whatsappNumber || '');
      setMsg('Saved ✓');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading') return <Loading />;
  if (status === 'error') {
    return (
      <div className="dash-state">
        <p className="dash-state-title">Couldn’t load</p>
        <p className="dash-state-detail">{error}</p>
      </div>
    );
  }

  return (
    <section>
      <BackLink />
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Connect</div>
          <h2 className="stmt-title">WhatsApp Setup</h2>
        </div>
      </header>

      <p className="setup-intro">
        Log expenses by texting the bot in plain language — e.g.{' '}
        <em>“spent 200 on groceries at Lulu”</em>. It parses and saves to <strong>your</strong>{' '}
        private account, then replies to confirm.
      </p>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Your WhatsApp Number</h3>
          <span className="panel-note">so the bot knows it’s you</span>
        </div>
        <form className="entry-form" onSubmit={save}>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Number (with country code)</span>
              <input
                className="field-input num"
                type="tel"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="+94771234567"
              />
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          {msg && (
            <p className="setup-note" style={{ color: 'var(--green)' }}>
              {msg}
            </p>
          )}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? <><Spinner size={14} />Saving…</> : 'Save number'}
            </button>
          </div>
        </form>
      </div>

      <div className="panel" style={{ marginTop: '1.25rem' }}>
        <div className="panel-head">
          <h3 className="panel-title">How to use it</h3>
        </div>
        <div className="wa-connect">
          <strong>Connect once:</strong> on WhatsApp, send <code>join north-gas</code> to{' '}
          <code>+1 415 523 8886</code> — you’ll get a “you’re all set” reply.
        </div>
        <ol className="setup-steps">
          <li>Save your WhatsApp number above (with country code, e.g. <code>+9477…</code>).</li>
          <li>Message the bot naturally: <em>“paid 1500 for fuel”</em> or <em>“spent 200 on lunch at KFC”</em>.</li>
          <li>It logs to your private account and replies with a confirmation + your remaining budget.</li>
        </ol>
      </div>

      <div className="panel" style={{ marginTop: '1.25rem' }}>
        <div className="panel-head">
          <h3 className="panel-title">What you can send</h3>
        </div>
        <ul className="wa-cmds">
          <li>
            <span className="wa-cmd-eg">“spent 200 on lunch at KFC”</span>
            <span className="wa-cmd-desc">Log an expense — it parses the amount, merchant &amp; category.</span>
          </li>
          <li>
            <span className="wa-cmd-eg">“got salary 150000”</span>
            <span className="wa-cmd-desc">Log income.</span>
          </li>
          <li>
            <span className="wa-cmd-eg">“paid USD 50 for hosting”</span>
            <span className="wa-cmd-desc">Foreign currency is auto-converted to LKR.</span>
          </li>
          <li>
            <span className="wa-cmd-eg">“summary”</span>
            <span className="wa-cmd-desc">
              Text this word and the bot replies with your spending for the last 7 days + top
              category. The words “week” and “report” do the same thing.
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}
