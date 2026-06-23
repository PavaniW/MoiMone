import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Transactions from './pages/Transactions.jsx';
import Budgets from './pages/Budgets.jsx';
import Goals from './pages/Goals.jsx';
import Chat from './pages/Chat.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import { useAuth } from './auth.jsx';
import { isSupabaseConfigured } from './lib/supabase.js';

// Line icons (stroke = currentColor so they follow active/inactive color).
const svg = {
  common: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
};

const icons = {
  '/': (
    <svg {...svg.common}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  '/transactions': (
    <svg {...svg.common}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3.5" y1="6" x2="3.51" y2="6" />
      <line x1="3.5" y1="12" x2="3.51" y2="12" />
      <line x1="3.5" y1="18" x2="3.51" y2="18" />
    </svg>
  ),
  '/budgets': (
    <svg {...svg.common}>
      <path d="M21.2 15.9A10 10 0 1 1 8 2.8" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
  '/goals': (
    <svg {...svg.common}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  ),
  '/chat': (
    <svg {...svg.common}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.9L3 21l1.3-4A8.4 8.4 0 0 1 3.6 8 8.5 8.5 0 0 1 12 3.5h.5A8.5 8.5 0 0 1 21 11.5z" />
    </svg>
  ),
};

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/transactions', label: 'Transactions' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/goals', label: 'Goals' },
  { to: '/chat', label: 'Chat' },
];

export default function App() {
  const { loading, session, user, signOut } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <div className="dash-state">
        <p className="dash-state-title">Sign-in not configured yet</p>
        <p className="dash-state-hint">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (in
          <code> frontend/.env</code> locally, or as Netlify env vars) and reload.
        </p>
      </div>
    );
  }
  if (loading) return <div className="dash-state">Loading…</div>;
  if (!session) return <Login />;

  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="logo">MoiMone</h1>
        <p className="logo-sub">Personal Finance</p>
        <nav>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="user-email">{user?.email}</span>
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? 'foot-link active' : 'foot-link')}
          >
            SMS Setup
          </NavLink>
          <button className="signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {/* Mobile-only bottom tab bar */}
      <nav className="bottom-nav">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
          >
            <span className="tab-icon">{icons[item.to]}</span>
            <span className="tab-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
