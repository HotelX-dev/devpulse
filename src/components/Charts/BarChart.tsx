import { monthLabel } from '../../lib/utils';

export interface BarChartMonth {
  month: string;  // "YYYY-MM"
  active: number;   // OPEN + IN_PROGRESS + QC + REOPEN + TO_DEPLOY
  deployed: number; // DEPLOYED
}

interface BarChartProps {
  data: BarChartMonth[];
}

const W = 800;
const H = 200;
const ML = 44;
const MB = 32;
const MT = 12;
const MR = 16;
const CW = W - ML - MR;
const CH = H - MT - MB;

function niceMax(val: number): number {
  if (val <= 0) return 10;
  const step = Math.pow(10, Math.floor(Math.log10(val)));
  return Math.ceil(val / step) * step;
}

export default function BarChart({ data }: BarChartProps) {
  if (data.length === 0) {
    return (
      <div style={{
        height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text3)', fontSize: 13,
      }}>
        No monthly data yet — import a CSV to populate the chart.
      </div>
    );
  }

  const maxVal = niceMax(Math.max(...data.map(d => d.active + d.deployed), 1));
  const n = data.length;
  const groupW = CW / n;
  const barW = Math.min(28, groupW * 0.32);
  const gap = Math.min(4, groupW * 0.04);

  const yGrids = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: 'var(--text2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', opacity: 0.8 }} />
          Active (Open + WIP)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--green)', opacity: 0.8 }} />
          Deployed
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: H, display: 'block' }}
        aria-hidden
      >
        {/* Grid lines */}
        {yGrids.map(frac => {
          const y = MT + CH * (1 - frac);
          const val = Math.round(maxVal * frac);
          return (
            <g key={frac}>
              <line
                x1={ML} y1={y} x2={W - MR} y2={y}
                stroke="var(--border)" strokeWidth={frac === 0 ? 1 : 0.5}
              />
              <text x={ML - 6} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text3)">
                {val}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const cx = ML + groupW * i + groupW / 2;
          const activeH = maxVal > 0 ? (d.active / maxVal) * CH : 0;
          const deployedH = maxVal > 0 ? (d.deployed / maxVal) * CH : 0;

          const x1 = cx - gap / 2 - barW;
          const x2 = cx + gap / 2;
          const baseY = MT + CH;

          return (
            <g key={d.month}>
              {/* Active bar */}
              {activeH > 0 && (
                <rect
                  x={x1} y={baseY - activeH}
                  width={barW} height={activeH}
                  fill="var(--accent)" opacity={0.75}
                  rx={3}
                />
              )}
              {/* Deployed bar */}
              {deployedH > 0 && (
                <rect
                  x={x2} y={baseY - deployedH}
                  width={barW} height={deployedH}
                  fill="var(--green)" opacity={0.75}
                  rx={3}
                />
              )}
              {/* Month label */}
              <text
                x={cx} y={H - 6}
                textAnchor="middle" fontSize={10} fill="var(--text3)"
              >
                {monthLabel(d.month + '-01')}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
