import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const CardIcon = () => (
  <svg {...svgProps}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
  </svg>
);
const TagIcon = () => (
  <svg {...svgProps}>
    <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);
const SmsIcon = () => (
  <svg {...svgProps}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.9L3 21l1.3-4A8.4 8.4 0 0 1 3.6 8 8.5 8.5 0 0 1 12 3.5h.5A8.5 8.5 0 0 1 21 11.5z" />
  </svg>
);
const WhatsAppIcon = () => (
  <svg {...svgProps}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.9L3 21l1.3-4A8.4 8.4 0 0 1 3.6 8 8.5 8.5 0 0 1 12 3.5h.5A8.5 8.5 0 0 1 21 11.5z" />
    <path d="M8.5 9.5c0 3 2 5 5 5" />
  </svg>
);
const SignOutIcon = () => (
  <svg {...svgProps}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
const Chevron = () => (
  <svg {...svgProps} className="chev">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// Settings hub — single entry point in the header. Everything else (Cards,
// SMS Setup, Sign out) lives here as tappable rows.
export default function Settings() {
  const { user, signOut } = useAuth();

  return (
    <section>
      <header className="stmt-head">
        <div>
          <div className="stmt-eyebrow">Account</div>
          <h2 className="stmt-title">Settings</h2>
        </div>
      </header>

      <p className="setup-intro">
        Signed in as <strong>{user?.email}</strong>
      </p>

      <div className="settings-list">
        <Link to="/cards" className="settings-row">
          <CardIcon />
          <span className="settings-row-label">Cards</span>
          <Chevron />
        </Link>
        <Link to="/categories" className="settings-row">
          <TagIcon />
          <span className="settings-row-label">Categories</span>
          <Chevron />
        </Link>
        <Link to="/sms-setup" className="settings-row">
          <SmsIcon />
          <span className="settings-row-label">SMS Setup</span>
          <Chevron />
        </Link>
        <Link to="/whatsapp" className="settings-row">
          <WhatsAppIcon />
          <span className="settings-row-label">WhatsApp Setup</span>
          <Chevron />
        </Link>
        <button className="settings-row danger" onClick={signOut}>
          <SignOutIcon />
          <span className="settings-row-label">Sign out</span>
        </button>
      </div>
    </section>
  );
}
