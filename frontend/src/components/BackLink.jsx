import { Link } from 'react-router-dom';

// Small breadcrumb back to a parent page. Settings sub-pages (Cards, SMS,
// WhatsApp) aren't in the bottom tab bar, so this is the way back — especially
// on mobile, where there's no other route home.
export default function BackLink({ to = '/settings', label = 'Settings' }) {
  return (
    <Link to={to} className="back-link">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {label}
    </Link>
  );
}
