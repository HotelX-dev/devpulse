import type { ForecastPoint } from '../../types';

interface ForecastChartProps {
  data: ForecastPoint[];
  currentActive: number;
}

const W  = 800;
const H  = 220;
const ML = 48;
const MB = 32;
const MT = 16;
const MR = 20;
const CW = W - ML - MR;
const CH = H - MT - MB;

function niceMax(val: number): number {
  if (val <= 0) return 10;
  const step = Math.pow(10, Math.floor(Math.log10(val)));
  return Math.ceil(val / step) * step;
}

function fmtMonth(ymd: string): string {
  const d = new Date(ymd + (ymd.length === 7 ? '-01' : ''));
  return d.toLocaleDateString('en-MY', { month: 'short', year: '2-digit' });
}

export default function ForecastChart({ data, currentActive }: ForecastChartProps) {
  if (data.length === 0) {
    return (
      <div style={{
        height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '0 24px',
      }}>
        No forecast yet — run a <strong style={{ color: 'var(--text2)', marginLeft: 4, marginRight: 4 }}>Monthly close</strong> import to generate the rolling forecast.
      </div>
    );
  }

  // Prepend current month as the "now" anchor point
  const points = [
    { month: 'Now', optimistic: currentActive, expected: currentActive, pessimistic: currentActive },
    ...data,
  ];

  const allVals = points.flatMap(p => [p.optimistic, p.expected, p.pessimistic]);
  const maxVal  = niceMax(Math.max(...allVals, 1));
  const n       = points.length;
  const xStep   = CW / (n - 1);

  function xOf(i: number) { return ML + i * xStep; }
  function yOf(v: number) { return MT + CH * (1 - v / maxVal); }

  // Build SVG path strings
  function linePath(key: 'optimistic' | 'expected' | 'pessimistic') {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p[key]).toFixed(1)}`)
      .join(' ');
  }

  // Band fill between optimistic and pessimistic
  const bandPath = [
    ...points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.optimistic).toFixed(1)}`),
    ...points.map((_p, i) => `L${xOf(n - 1 - i).toFixed(1)},${yOf(points[n - 1 - i].pessimistic).toFixed(1)}`),
    'Z',
  ].join(' ');

  const yGrids = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, marginBottom: 12, fontSize: 12, color: 'var(--text2)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={18} height={10}><line x1={0} y1={5} x2={18} y2={5} stroke="var(--green)" strokeWidth={2} /></svg>
          Optimistic
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={18} height={10}><line x1={0} y1={5} x2={18} y2={5} stroke="var(--accent)" strokeWidth={2} /></svg>
          Expected
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={18} height={10}><line x1={0} y1={5} x2={18} y2={5} stroke="var(--red)" strokeWidth={2} strokeDasharray="4 3" /></svg>
          Pessimistic
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 8, borderRadius: 2, background: 'var(--accent)', opacity: 0.1, border: '1px solid var(--accent)44' }} />
          Forecast band
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: H, display: 'block' }}
        aria-hidden
      >
        <defs>
          <linearGradient id="fc-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Grid lines + Y labels */}
        {yGrids.map(frac => {
          const y   = MT + CH * (1 - frac);
          const val = Math.round(maxVal * frac);
          return (
            <g key={frac}>
              <line x1={ML} y1={y} x2={W - MR} y2={y}
                stroke="var(--border)" strokeWidth={frac === 0 ? 1 : 0.5} />
              <text x={ML - 6} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text3)">
                {val}
              </text>
            </g>
          );
        })}

        {/* Vertical divider at "Now" */}
        <line
          x1={xOf(0)} y1={MT} x2={xOf(0)} y2={MT + CH}
          stroke="var(--border2)" strokeWidth={1} strokeDasharray="4 3"
        />

        {/* Forecast band fill */}
        <path d={bandPath} fill="url(#fc-band)" />

        {/* Optimistic line */}
        <path d={linePath('optimistic')} fill="none"
          stroke="var(--green)" strokeWidth={1.5} strokeDasharray="6 3" />

        {/* Pessimistic line */}
        <path d={linePath('pessimistic')} fill="none"
          stroke="var(--red)" strokeWidth={1.5} strokeDasharray="4 3" />

        {/* Expected line (on top) */}
        <path d={linePath('expected')} fill="none"
          stroke="var(--accent)" strokeWidth={2} />

        {/* Dots on expected line */}
        {points.map((p, i) => (
          <circle key={i}
            cx={xOf(i)} cy={yOf(p.expected)}
            r={i === 0 ? 4 : 3}
            fill={i === 0 ? 'var(--accent)' : 'var(--bg2)'}
            stroke="var(--accent)" strokeWidth={i === 0 ? 0 : 1.5}
          />
        ))}

        {/* X axis labels */}
        {points.map((p, i) => (
          <text key={i}
            x={xOf(i)} y={H - 6}
            textAnchor="middle" fontSize={10}
            fill={i === 0 ? 'var(--text2)' : 'var(--text3)'}
            fontWeight={i === 0 ? 600 : 400}
          >
            {i === 0 ? 'Now' : fmtMonth(p.month)}
          </text>
        ))}
      </svg>
    </div>
  );
}
