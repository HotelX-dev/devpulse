interface PipelineFlowProps {
  open: number;
  in_progress: number;
  qc: number;
  to_deploy: number;
  deployed: number;
  reopen?: number;
}

const STAGES = [
  { key: 'open',        label: 'Open',        color: 'var(--red)' },
  { key: 'in_progress', label: 'In Progress', color: 'var(--blue)' },
  { key: 'qc',          label: 'QC',          color: 'var(--purple)' },
  { key: 'to_deploy',   label: 'To Deploy',   color: 'var(--pink)' },
  { key: 'deployed',    label: 'Deployed',    color: 'var(--green)' },
] as const;

export default function PipelineFlow({ open, in_progress, qc, to_deploy, deployed, reopen = 0 }: PipelineFlowProps) {
  const counts: Record<string, number> = { open, in_progress, qc, to_deploy, deployed };
  const total = open + in_progress + qc + to_deploy + deployed;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, width: '100%' }}>
      {STAGES.map((stage, i) => {
        const count = counts[stage.key];
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={stage.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{
              flex: 1,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '16px 12px',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Bottom accent fill proportional to count */}
              <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: `${pct}%`,
                background: stage.color,
                opacity: 0.08,
                transition: 'height 0.4s ease',
              }} />
              <div style={{ fontSize: 26, fontWeight: 700, color: stage.color, lineHeight: 1 }}>
                {count.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5, fontWeight: 500 }}>
                {stage.label}
              </div>
              {pct > 0 && (
                <div style={{ fontSize: 10, color: stage.color, marginTop: 2, opacity: 0.7 }}>
                  {pct}%
                </div>
              )}
            </div>
            {i < STAGES.length - 1 && (
              <div style={{ width: 24, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7H12M8 3L12 7L8 11" stroke="var(--border2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
        );
      })}

      {reopen > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: 16 }}>
          <div style={{
            background: 'var(--amber-dim)',
            border: '1px solid var(--amber)33',
            borderRadius: 10,
            padding: '16px 16px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--amber)', lineHeight: 1 }}>
              {reopen.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5, fontWeight: 500 }}>
              Reopen
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
