import { useId } from 'react';

interface LogoProps {
  /** Rendered height in px. Width scales to keep the wordmark's aspect ratio. */
  height?: number;
  /** When true, a bright pulse travels along the heartbeat line (loading state). */
  animated?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

const WAVE_PATH = 'M8 70 H112 L122 70 L130 60 L140 78 L148 70 H210';

/**
 * DevPulse wordmark.
 * "dev" uses the theme text color; "pulse" and the heartbeat "breath" line
 * use the brand purple → pink gradient (--accent #A78BFA → --pink #F472B6).
 * Works on both dark and light themes. Pass `animated` to make the wave pulse.
 */
export default function Logo({ height = 28, animated = false, style, className }: LogoProps) {
  // Unique gradient id so multiple Logos on one page never collide.
  const gid = `dp-grad-${useId().replace(/:/g, '')}`;
  const width = (300 / 84) * height;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 300 84"
      fill="none"
      role="img"
      aria-label="DevPulse"
      style={style}
      className={className}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#F472B6" />
        </linearGradient>
      </defs>
      <text
        x="6"
        y="48"
        fontFamily="'DM Sans', system-ui, sans-serif"
        fontWeight={700}
        fontSize={44}
        letterSpacing={-1}
        fill="var(--text)"
      >
        dev
      </text>
      <text
        x="90"
        y="48"
        fontFamily="'DM Sans', system-ui, sans-serif"
        fontWeight={700}
        fontSize={44}
        letterSpacing={-1}
        fill={`url(#${gid})`}
      >
        pulse
      </text>
      {animated ? (
        <>
          {/* faint full track */}
          <path
            d={WAVE_PATH}
            stroke={`url(#${gid})`}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.18}
          />
          {/* bright pulse that travels along the line */}
          <path
            d={WAVE_PATH}
            stroke={`url(#${gid})`}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray="22 100"
            style={{ animation: 'pulse-travel 3s linear infinite' }}
          />
        </>
      ) : (
        <path
          d={WAVE_PATH}
          stroke={`url(#${gid})`}
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
