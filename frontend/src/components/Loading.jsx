// iOS-style activity indicator: 12 fading spokes that chase around a circle.
// Inherits color from `currentColor`, so it adapts to wherever it's placed
// (dark text on a page, white on a green button, etc.).
export function Spinner({ size = 20, className = '' }) {
  return (
    <span
      className={`spinner ${className}`.trim()}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="spinner-bar"
          style={{ transform: `rotate(${i * 30}deg)`, animationDelay: `${(i - 12) / 12}s` }}
        />
      ))}
    </span>
  );
}

// Full-panel loading state — centered spinner with a label. Drop-in replacement
// for the old plain-text "Loading…" divs.
export default function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading-state">
      <Spinner size={30} />
      <p className="loading-label">{label}</p>
    </div>
  );
}
