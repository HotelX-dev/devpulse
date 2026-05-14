import { Sun, Moon, Bell } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useAlerts } from '../../hooks/useAlerts';

interface TopbarProps {
  title: string;
  badge?: string;
}

export default function Topbar({ title, badge }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { alerts } = useAlerts();
  const unresolved = alerts.filter(a => !a.resolved).length;

  return (
    <header style={{
      height: 'var(--topbar-h)',
      background: 'var(--bg2)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      paddingLeft: 24,
      paddingRight: 20,
      gap: 12,
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      {/* Title + badge */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{title}</h1>
        {badge && (
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)33',
            padding: '2px 8px',
            borderRadius: 99,
          }}>
            {badge}
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Alert bell */}
        <button
          style={{
            position: 'relative',
            background: 'none',
            border: 'none',
            color: 'var(--text2)',
            padding: 6,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
          }}
          title="Alerts"
        >
          <Bell size={18} />
          {unresolved > 0 && (
            <span style={{
              position: 'absolute',
              top: 3,
              right: 3,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--red)',
              border: '1.5px solid var(--bg2)',
            }} />
          )}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text2)',
            padding: 6,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)'; }}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
