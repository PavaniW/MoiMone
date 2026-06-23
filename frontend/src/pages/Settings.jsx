import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// One labelled value with a copy button.
function CopyField({ label, value, mono = true }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }
  return (
    <div className="copy-field">
      <span className="field-label">{label}</span>
      <div className="copy-row">
        <code className={mono ? 'copy-value num' : 'copy-value'}>{value}</code>
        <button className="btn-secondary" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// SMS Setup — shows the signed-in user THEIR own ingest token + webhook URL and
// how to wire the iOS Shortcut. iPhone-only (uses the Shortcuts app).
export default function Settings() {
  const [state, setState] = useState({ status: 'loading' });
  const [rotating, setRotating] = useState(false);
  const webhookUrl = `${window.location.origin}/webhook/sms`;

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((data) => active && setState({ status: 'ready', token: data.ingestToken }))
      .catch((err) => active && setState({ status: 'error', message: err.message }));
    return () => {
      active = false;
    };
  }, []);

  async function regenerate() {
    if (!window.confirm('Generate a new token? You’ll just need to paste the new one into your iOS Shortcut afterwards.')) {
      return;
    }
    setRotating(true);
    try {
      const { ingestToken } = await api.regenerateIngestToken();
      setState((s) => ({ ...s, token: ingestToken }));
    } catch (err) {
      setState((s) => ({ ...s, message: err.message }));
    } finally {
      setRotating(false);
    }
  }

  if (state.status === 'loading') return <div className="dash-state">Loading…</div>;
  if (state.status === 'error') {
    return (
      <div className="dash-state">
        <p className="dash-state-title">Couldn’t load your setup</p>
        <p className="dash-state-detail">{state.message}</p>
      </div>
    );
  }

  return (
    <section>
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Connect</div>
          <h2 className="stmt-title">SMS Setup</h2>
        </div>
        <span className="stmt-period"> iPhone</span>
      </header>

      <p className="setup-intro">
        Auto-log your bank SMS to <strong>your</strong> account using the iPhone{' '}
        <strong>Shortcuts</strong> app. Transactions captured this way are private to you.
        <br />
        <span className="setup-note">
          Not on an iPhone? Skip this — just add transactions manually, or send them via WhatsApp.
        </span>
      </p>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Your Webhook</h3>
          <span className="panel-note">paste these into the Shortcut</span>
        </div>
        <div className="copy-stack">
          <CopyField label="Webhook URL" value={webhookUrl} />
          <CopyField label="Your ingest token (keep private)" value={state.token} />
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1.25rem' }}>
        <div className="panel-head">
          <h3 className="panel-title">Set it up on iPhone</h3>
          <span className="panel-note">one time, ~2 min</span>
        </div>
        <ol className="setup-steps">
          <li>First, save your bank's SMS sender to <strong>Contacts</strong> (iOS auto-runs message automations more reliably for saved contacts).</li>
          <li>Open the <strong>Shortcuts</strong> app → <strong>Automation</strong> tab → <strong>＋</strong> → <strong>New Personal Automation</strong>.</li>
          <li>Pick <strong>Message</strong> → <strong>Message Contains</strong> a phrase always in your bank texts (for example: <code>authorised on your</code>) → choose <strong>Run Immediately</strong>.</li>
          <li>Add the action <strong>Get Contents of URL</strong> and tap <strong>Show More</strong>:
            <ul>
              <li><strong>URL</strong>: the Webhook URL above</li>
              <li><strong>Method</strong>: <code>POST</code></li>
              <li><strong>Headers</strong>: <code>Content-Type</code> = <code>application/json</code></li>
              <li><strong>Request Body</strong>: <code>JSON</code> with two text fields —
                <code>text</code> = the <strong>Shortcut Input</strong> variable, and
                <code>token</code> = your ingest token above.</li>
            </ul>
          </li>
          <li>Tap <strong>Done</strong>. Done! Your bank SMS will now log automatically — even when your phone is locked (as long as it's on and has signal).</li>
        </ol>
      </div>

      <div className="setup-danger">
        <button className="btn-secondary" onClick={regenerate} disabled={rotating}>
          {rotating ? 'Generating…' : 'Regenerate token'}
        </button>
        <span className="setup-note">
          Creates a brand-new token. You’ll just paste the new one into your Shortcut afterwards.
        </span>
      </div>
    </section>
  );
}
