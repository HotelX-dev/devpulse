import { Sun, Moon, Bell } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

interface TopbarProps {
  title: string;
  badge?: string;
  isMobile: boolean;
  alertCount: number;
  onOpenAlerts: () => void;
}

export default function Topbar({ title, badge, isMobile, alertCount, onOpenAlerts }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();

  const padX = isMobile ? 'max(12px, env(safe-area-inset-left))' : 24;
  const padR = isMobile ? 'max(10px, env(safe-area-inset-right))' : 20;
  const iconPad = isMobile ? 10 : 6;
  const iconSize = isMobile ? 20 : 18;

  return (
    <header style={{
      minHeight: 'var(--topbar-h)',
      background: 'var(--bg2)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      paddingLeft: padX,
      paddingRight: padR,
      paddingTop: 'env(safe-area-inset-top, 0px)',
      gap: 12,
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{
          fontSize: isMobile ? 17 : 16,
          fontWeight: 600,
          color: 'var(--text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        >
          {title}
        </h1>
        {badge && (
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)33',
            padding: '2px 8px',
            borderRadius: 99,
            flexShrink: 0,
          }}>
            {badge}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 2 : 6 }}>
        <button
          type="button"
          onClick={onOpenAlerts}
          style={{
            position: 'relative',
            background: 'none',
            border: 'none',
            color: 'var(--text2)',
            padding: iconPad,
            minWidth: isMobile ? 44 : undefined,
            minHeight: isMobile ? 44 : undefined,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="Alerts"
          aria-label={alertCount > 0 ? `Alerts, ${alertCount} unread` : 'Alerts'}
        >
          <Bell size={iconSize} />
          {alertCount > 0 && (
            <span style={{
              position: 'absolute',
              top: isMobile ? 8 : 3,
              right: isMobile ? 8 : 3,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--red)',
              border: '1.5px solid var(--bg2)',
            }} />
          )}
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text2)',
            padding: iconPad,
            minWidth: isMobile ? 44 : undefined,
            minHeight: isMobile ? 44 : undefined,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s',
            cursor: 'pointer',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)'; }}
        >
          {theme === 'dark' ? <Sun size={iconSize} /> : <Moon size={iconSize} />}
        </button>
      </div>
    </header>
  );
}
