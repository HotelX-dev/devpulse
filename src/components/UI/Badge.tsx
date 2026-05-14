import type { TicketStatus, TaskStatus, Severity } from '../../types';

type BadgeStatus = TicketStatus | TaskStatus | Severity;

const statusStyles: Record<string, { color: string; bg: string; label: string }> = {
  // Ticket statuses
  OPEN:        { color: 'var(--red)',    bg: 'var(--red-dim)',    label: 'Open' },
  IN_PROGRESS: { color: 'var(--blue)',   bg: 'var(--blue-dim)',   label: 'In Progress' },
  QC:          { color: 'var(--purple)', bg: 'var(--purple-dim)', label: 'QC' },
  NO_ACTION:   { color: 'var(--text3)',  bg: 'transparent',       label: 'No Action' },
  DEPLOYED:    { color: 'var(--green)',  bg: 'var(--green-dim)',  label: 'Deployed' },
  REOPEN:      { color: 'var(--amber)',  bg: 'var(--amber-dim)',  label: 'Reopen' },
  TO_DEPLOY:   { color: 'var(--pink)',   bg: 'var(--pink-dim)',   label: 'To Deploy' },
  // Task statuses
  Pending:      { color: 'var(--text2)',  bg: 'var(--bg4)',        label: 'Pending' },
  'In Progress':{ color: 'var(--blue)',   bg: 'var(--blue-dim)',   label: 'In Progress' },
  Blocked:      { color: 'var(--red)',    bg: 'var(--red-dim)',    label: 'Blocked' },
  Done:         { color: 'var(--green)',  bg: 'var(--green-dim)',  label: 'Done' },
  // Severity
  HIGH:   { color: 'var(--red)',   bg: 'var(--red-dim)',   label: 'High' },
  MEDIUM: { color: 'var(--amber)', bg: 'var(--amber-dim)', label: 'Medium' },
  LOW:    { color: 'var(--text2)', bg: 'var(--bg4)',        label: 'Low' },
};

interface BadgeProps {
  status: BadgeStatus;
  size?: 'sm' | 'md';
}

export default function Badge({ status, size = 'md' }: BadgeProps) {
  const style = statusStyles[status] ?? {
    color: 'var(--text2)',
    bg: 'var(--bg4)',
    label: status,
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: size === 'sm' ? '2px 7px' : '3px 9px',
        borderRadius: 99,
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 500,
        color: style.color,
        background: style.bg,
        border: `1px solid ${style.color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: style.color,
          flexShrink: 0,
        }}
      />
      {style.label}
    </span>
  );
}
