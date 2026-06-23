import { useSpace } from '../space.jsx';

// Active-space selector. Switching scopes every data page to that space and is
// where new entries are written. Personal first, shared spaces after.
export default function SpaceSwitcher() {
  const { spaces, currentSpaceId, selectSpace } = useSpace();
  if (!spaces.length) return null;

  return (
    <label className="space-switcher">
      <span className="space-switcher-label">Viewing</span>
      <select
        className="space-switcher-select"
        value={currentSpaceId || ''}
        onChange={(e) => selectSpace(e.target.value)}
      >
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.kind === 'personal' ? '👤' : '👥'} {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
