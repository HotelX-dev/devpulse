// Phase 8
export default function MyTasks() {
  return <ComingSoon title="My Tasks" phase={8} />;
}

function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <div style={{ padding: 32 }}>
      <div style={{
        background: 'var(--bg2)',
        border: '1px dashed var(--border2)',
        borderRadius: 12,
        padding: '48px 32px',
        textAlign: 'center',
        color: 'var(--text2)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13 }}>Coming in Phase {phase}</div>
      </div>
    </div>
  );
}
