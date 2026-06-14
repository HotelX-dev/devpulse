interface MetricCardProps {
  label: string;
  value: number | string;
  color?: string;
  sub?: string;
}

export default function MetricCard({ label, value, color = 'var(--accent)', sub }: MetricCardProps) {
  return (
    <div className="dp-elev" style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      flex: 1,
      minWidth: 120,
    }}>
      <div style={{ height: 3, background: color }} />
      <div style={{ padding: '16px 20px 18px' }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}
