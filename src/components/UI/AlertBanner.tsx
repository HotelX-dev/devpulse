import { AlertTriangle, Info, Zap, X } from 'lucide-react';
import type { Alert } from '../../types';

interface AlertBannerProps {
  alert: Alert;
  memberName?: string;
  onResolve?: (id: string) => void;
  /** Larger dismiss control for touch / full-screen panels */
  touchFriendly?: boolean;
}

const SEVERITY_STYLES = {
  HIGH:   { color: 'var(--red)',   bg: 'var(--red-dim)',   Icon: Zap },
  MEDIUM: { color: 'var(--amber)', bg: 'var(--amber-dim)', Icon: AlertTriangle },
  LOW:    { color: 'var(--text2)', bg: 'var(--bg4)',        Icon: Info },
} as const;

const TYPE_LABELS: Record<string, string> = {
  MISSING_STANDUP:      'Missing Standup',
  STALE_TICKET:         'Stale Ticket',
  ADHOC_OVERLOAD:       'Adhoc Overload',
  BACKLOG_GROWING:      'Backlog Growing',
  STALE_BLOCKER:        'Stale Blocker',
  TICKET_AGED_CRITICAL: 'Aged Critical Ticket',
  DELIVERY_AT_RISK:     'Delivery at Risk',
};

export default function AlertBanner({ alert, memberName, onResolve, touchFriendly }: AlertBannerProps) {
  const s = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.LOW;
  const { Icon } = s;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 14px',
      borderRadius: 8,
      background: s.bg,
      border: `1px solid ${s.color}33`,
    }}>
      <Icon size={14} color={s.color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, lineHeight: 1.4 }}>
          {alert.message || TYPE_LABELS[alert.type] || alert.type}
        </div>
        {memberName && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{memberName}</div>
        )}
      </div>
      {onResolve && (
        <button
          onClick={() => onResolve(alert.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text3)', flexShrink: 0,
            padding: touchFriendly ? '10px 12px' : 2,
            minWidth: touchFriendly ? 44 : undefined,
            minHeight: touchFriendly ? 44 : undefined,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: touchFriendly ? 10 : 4,
            lineHeight: 1,
            display: 'flex',
          }}
          title="Dismiss"
        >
          <X size={touchFriendly ? 18 : 13} />
        </button>
      )}
    </div>
  );
}
