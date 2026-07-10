/**
 * Animated SVG loading indicator. Theme-aware (uses CSS vars), reuses the
 * `spin` keyframe from index.css. A soft track ring + an accent arc that spins.
 */
export default function Loader({
  size = 30,
  label,
  padding = 32,
}: {
  size?: number;
  label?: string;
  padding?: number | string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 12, padding,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 50 50" style={{ animation: 'spin 0.85s linear infinite' }}>
        {/* track */}
        <circle cx="25" cy="25" r="20" fill="none" stroke="var(--border2)" strokeWidth="5" opacity="0.5" />
        {/* spinning arc */}
        <circle
          cx="25" cy="25" r="20" fill="none"
          stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray="70 200"
        />
      </svg>
      {label && (
        <span style={{ fontSize: 13, color: 'var(--text3)', letterSpacing: '0.01em' }}>{label}</span>
      )}
    </div>
  );
}
