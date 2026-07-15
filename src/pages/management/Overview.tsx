// Phase 11 — Management Overview (owner + admin)
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TrendingUp, Users, Activity, X,
  Maximize2, Minimize2, Sun, Moon,
  CheckCircle, Clock, AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar,
  LineChart, Line, Legend, LabelList,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { usePageShellStyle } from '../../hooks/usePageShellStyle';
import { formatDate, sortMembers } from '../../lib/utils';
import Avatar from '../../components/UI/Avatar';
import Logo from '../../components/UI/Logo';
import type { Product, Member, TicketImport } from '../../types';
import Loader from '../../components/UI/Loader';

/* ── helpers ── */

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ── date-range helpers (day-level filter) ── */

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Default range = the previous full calendar month (first → last day). */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to:   ymd(new Date(now.getFullYear(), now.getMonth(), 0)), // day 0 = last day of prev month
  };
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}

/** Half-open upper bound: the day AFTER `to`, so the whole `to` day is included. */
function toExclusive(to: string): string {
  return addDays(to, 1);
}

/** Inclusive day count between two YYYY-MM-DD dates. */
function daysInclusive(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** `created_ts` (timestamptz) bound at the UTC start of a YYYY-MM-DD day —
 *  matches how `imported_month` is derived from `created_ts` at import time. */
function utcDayStart(date: string): string {
  return date + 'T00:00:00Z';
}

function fmtRange(from: string, to: string): string {
  if (!from || !to) return '—';
  const s = new Date(from + 'T00:00:00');
  const e = new Date(to + 'T00:00:00');
  if (from === to) {
    return s.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString('en-MY', { day: 'numeric' })} – ${e.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `${s.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

const DATE_INPUT_STYLE = {
  background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 7,
  padding: '6px 9px', color: 'var(--text)', fontSize: 12, cursor: 'pointer',
  colorScheme: 'light dark',
} as const;

const RANGE_PRESETS: { label: string; get: () => { from: string; to: string } }[] = [
  { label: 'This mo', get: () => { const n = new Date(); return { from: ymd(new Date(n.getFullYear(), n.getMonth(), 1)), to: ymd(n) }; } },
  { label: 'Last mo', get: defaultRange },
  { label: '30d',     get: () => { const n = new Date(); return { from: addDays(ymd(n), -29), to: ymd(n) }; } },
  { label: '90d',     get: () => { const n = new Date(); return { from: addDays(ymd(n), -89), to: ymd(n) }; } },
];

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}


function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

/* ── constants ── */

const TICKET_STATUS_COLOR: Record<string, string> = {
  OPEN:        'var(--red)',
  IN_PROGRESS: 'var(--blue)',
  QC:          'var(--purple)',
  TO_DEPLOY:   'var(--amber)',
  DEPLOYED:    'var(--green)',
  REOPEN:      'var(--red)',
  NO_ACTION:   'var(--text3)',
};

const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN:        'Open',
  IN_PROGRESS: 'In Progress',
  QC:          'QC',
  TO_DEPLOY:   'To Deploy',
  DEPLOYED:    'Deployed',
  REOPEN:      'Reopen',
  NO_ACTION:   'No Action',
};

// Backlog (Google Sheet) priority + status palettes
const PRIORITY_COLOR: Record<string, string> = {
  Critical: 'var(--red)', High: 'var(--amber)', Medium: 'var(--blue)', Low: 'var(--text3)',
};
const BACKLOG_STATUS_COLOR: Record<string, string> = {
  'To Do': 'var(--text3)', 'In Progress': 'var(--blue)', 'Testing': 'var(--purple)',
  'UAT': 'var(--purple)', 'Pending': 'var(--amber)', 'Pending Deploy': 'var(--amber)',
  'Scheduled': 'var(--blue)', 'Monitoring': 'var(--green)', 'Blocked': 'var(--red)',
  'On Hold': 'var(--text3)', 'Done': 'var(--green)',
};
// Severity order (0 = most urgent) so Priority sorts by importance, not alphabetically.
const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
// Workflow order (0 = earliest stage) so Status sorts along the delivery pipeline.
const BACKLOG_STATUS_RANK: Record<string, number> = {
  'To Do': 0, 'Scheduled': 1, 'In Progress': 2, 'Testing': 3, 'UAT': 4,
  'Pending': 5, 'Pending Deploy': 6, 'Monitoring': 7, 'Blocked': 8, 'On Hold': 9, 'Done': 10,
};

interface BacklogItem {
  id: string;
  sort_index: number | null;
  app: string | null;
  product_id: string | null;
  category: string | null;
  task: string | null;
  priority: string | null;
  status: string | null;
  owner: string | null;
  delivery_bucket: string | null;
}

type BacklogSortKey = 'task' | 'app' | 'category' | 'priority' | 'status' | 'owner' | 'bucket';

/* ── Local types ── */

interface TicketRow {
  product_id: string;
  status: string;
  primary_member_id: string | null;
  is_bug: boolean | null;
  is_enhancement: boolean | null;
  ticket_ref: string | null;
  priority: number | null;
}

interface MemberTicketLite {
  ticket_ref: string;
  status: string;
  priority: number | null;
  product_id: string;
}

// Active work first, finished last — used to sort the per-member ticket list.
const MEMBER_TICKET_STATUS_ORDER: Record<string, number> = {
  REOPEN: 0, OPEN: 1, IN_PROGRESS: 2, QC: 3, TO_DEPLOY: 4, NO_ACTION: 5, DEPLOYED: 6,
};

interface BugEnh {
  bugs: number;
  enh: number;
}

interface TrendPoint {
  month: string;   // 'YYYY-MM'
  label: string;   // 'May'
  [productCode: string]: number | string;  // one count per product code
}

interface TrendSeries {
  key: string;     // product code, e.g. 'HOTEL'
  color: string;
}

// Line colors for per-product trend series (cycled by product order)
const PRODUCT_COLORS = ['var(--blue)', 'var(--green)', 'var(--pink)', 'var(--amber)', 'var(--accent)'];

/* chart palette — CSS vars so charts follow light/dark theme */
const CHART = {
  open:       'var(--red)',
  inProgress: 'var(--blue)',
  qc:         'var(--purple)',
  toDeploy:   'var(--amber)',
  deployed:   'var(--green)',
  reopen:     'var(--pink)',
  noAction:   'var(--text3)',
  accent:     'var(--accent)',
  bug:        'var(--red)',
  enh:        'var(--blue)',
};

interface ProductStats {
  open: number;
  in_progress: number;
  qc: number;
  to_deploy: number;
  deployed: number;
  reopen: number;
  no_action: number;
  total: number;
}

/* ── Sub-components ── */

function Section({ title, children, action }: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text2)',
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="dp-elev" style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 20, ...style,
    }}>
      {children}
    </div>
  );
}

function KpiPill({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number | string; color?: string;
}) {
  return (
    <div className="dp-elev" style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '14px 18px', flex: 1, minWidth: 140,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: color ? `${color}1a` : 'var(--accent-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color ?? 'var(--accent)', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

function KpiPrimary({ icon, label, value, sub, color, note }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; color?: string; note?: string;
}) {
  return (
    <div className="dp-elev" style={{
      display: 'flex', alignItems: 'center', gap: 16,
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 22px', flex: 2, minWidth: 220,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: color ? `${color}1a` : 'var(--accent-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color ?? 'var(--accent)',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 30, fontWeight: 800, color: color ?? 'var(--text)', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 3 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sub}</div>
        {note && (
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, fontStyle: 'italic', lineHeight: 1.4, maxWidth: 260 }}>
            {note}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ color }: { color: string }) {
  return <span style={{
    display: 'inline-block', width: 8, height: 8,
    borderRadius: '50%', background: color, flexShrink: 0,
  }} />;
}

function StatusRow({ label, value, color, total }: {
  label: string; value: number; color: string; total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <StatusDot color={color} />
      <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{label}</span>
      <div style={{
        width: 80, height: 4, borderRadius: 2,
        background: 'var(--border)', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text)',
        minWidth: 24, textAlign: 'right',
      }}>{value}</span>
    </div>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: `${color}1a`, color, border: `1px solid ${color}44`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

const ROLE_COLOR: Record<string, string> = {
  owner:  'var(--accent)',
  admin:  'var(--purple)',
  member: 'var(--blue)',
};

function MemberCard({
  member,
  ticketCount,
  lastStandup,
  onClick,
}: {
  member: Member;
  ticketCount: number;
  lastStandup: string | undefined;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const clickable = !!onClick && ticketCount > 0;
  const standupDays = lastStandup ? daysSince(lastStandup) : 999;
  const standupColor = standupDays === 0
    ? 'var(--green)'
    : standupDays <= 2
    ? 'var(--amber)'
    : 'var(--red)';
  const standupDim = standupDays === 0
    ? 'var(--green-dim)'
    : standupDays <= 2
    ? 'var(--amber-dim)'
    : 'var(--red-dim)';
  const roleColor = ROLE_COLOR[member.role] ?? 'var(--text3)';
  const standupText = standupDays === 0
    ? 'Checked in today'
    : standupDays === 1
    ? 'Yesterday'
    : standupDays < 7
    ? `${standupDays}d ago`
    : 'Not checked in';
  const StandupIcon = standupDays === 0
    ? CheckCircle
    : standupDays >= 7
    ? AlertCircle
    : Clock;

  return (
    <div
      className="dp-elev"
      onClick={clickable ? onClick : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={clickable ? `View ${member.name.split(' ')[0]}'s ${ticketCount} ticket${ticketCount === 1 ? '' : 's'}` : undefined}
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--bg2)',
        border: `1px solid ${clickable && hover ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 14, padding: '15px 16px 14px',
        display: 'flex', flexDirection: 'column', gap: 11,
        cursor: clickable ? 'pointer' : 'default',
        transform: clickable && hover ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.15s ease, border-color 0.15s ease',
      }}
    >
      {/* Role accent strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${roleColor}, transparent 75%)`,
      }} />

      {/* Top row: avatar + name + standup dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name={member.name} color={member.avatar_color} size="md" />
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 9, height: 9, borderRadius: '50%',
            background: standupColor,
            border: '2px solid var(--bg2-solid)',
          }} title={standupText} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {member.name}
          </div>
          <span style={{
            display: 'inline-block', marginTop: 3,
            fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99,
            background: `${ROLE_COLOR[member.role] ?? 'var(--text3)'}1a`,
            color: ROLE_COLOR[member.role] ?? 'var(--text3)',
            textTransform: 'capitalize',
          }}>
            {member.role}
          </span>
        </div>
      </div>

      {/* Standup status pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        alignSelf: 'flex-start',
        padding: '4px 9px', borderRadius: 99,
        background: standupDim,
      }}>
        <StandupIcon size={12} color={standupColor} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, color: standupColor, fontWeight: 600 }}>
          {standupText}
        </span>
      </div>
    </div>
  );
}

/* ── Member ticket drill-down modal ── */
function MemberTicketsModal({
  member, tickets, productById, monthLabel, onClose,
}: {
  member: Member;
  tickets: MemberTicketLite[];
  productById: Map<string, Product>;
  monthLabel: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sorted = [...tickets].sort((a, b) => {
    const oa = MEMBER_TICKET_STATUS_ORDER[a.status] ?? 99;
    const ob = MEMBER_TICKET_STATUS_ORDER[b.status] ?? 99;
    if (oa !== ob) return oa - ob;
    if ((a.priority ?? 2) !== (b.priority ?? 2)) return (a.priority ?? 2) - (b.priority ?? 2);
    return (a.ticket_ref ?? '').localeCompare(b.ticket_ref ?? '');
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 14, width: 'min(480px, 94vw)', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11,
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
        }}>
          <Avatar name={member.name} color={member.avatar_color} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{member.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
              {tickets.length} ticket{tickets.length === 1 ? '' : 's'} · {monthLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '4px 6px', cursor: 'pointer', color: 'var(--text2)',
              display: 'flex', alignItems: 'center', flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Ticket list */}
        <div style={{ overflowY: 'auto', padding: '6px 0' }}>
          {sorted.length === 0 ? (
            <div style={{ padding: '24px 18px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>
              No tickets for {member.name.split(' ')[0]} in {monthLabel}.
            </div>
          ) : sorted.map((t, i) => {
            const prod = productById.get(t.product_id);
            const isP1 = t.priority === 1;
            return (
              <div
                key={`${t.ticket_ref}-${i}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 18px',
                  borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, fontWeight: 700,
                  color: 'var(--accent)', minWidth: 78,
                }}>
                  {t.ticket_ref}
                </span>
                <StatusBadge
                  label={TICKET_STATUS_LABEL[t.status] ?? t.status}
                  color={TICKET_STATUS_COLOR[t.status] ?? 'var(--text3)'}
                />
                <span style={{ flex: 1, fontSize: 11.5, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {prod?.name ?? '—'}
                </span>
                <StatusBadge
                  label={`P${t.priority ?? 2}`}
                  color={isP1 ? 'var(--red)' : 'var(--text3)'}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Backlog roadmap (grouped by delivery quarter) ── */
function quarterMeta(bucket: string | null): { label: string; sort: number } {
  const m = String(bucket ?? '').match(/Q([1-4])[-\s]?(\d{4})/i);
  if (!m) return { label: 'Unscheduled', sort: Number.POSITIVE_INFINITY };
  return { label: `Q${m[1]} ${m[2]}`, sort: Number(m[2]) * 4 + Number(m[1]) };
}

/* A single clickable roadmap card with hover feedback. */
function RoadmapCard({ item: b, onClick }: { item: BacklogItem; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--bg3, rgba(255,255,255,0.02))',
        border: `1px solid ${hover ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8, padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 7,
        cursor: 'pointer', transition: 'border-color 0.12s ease, transform 0.12s ease',
        transform: hover ? 'translateY(-1px)' : 'none',
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.35 }}>
        {b.task || '—'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {b.priority && <StatusBadge label={b.priority} color={PRIORITY_COLOR[b.priority] ?? 'var(--text3)'} />}
        {b.status && <StatusBadge label={b.status} color={BACKLOG_STATUS_COLOR[b.status] ?? 'var(--text3)'} />}
        <span style={{ fontSize: 10.5, color: 'var(--text3)', marginLeft: 'auto' }}>{b.app}</span>
      </div>
    </div>
  );
}

/* Detail popup for a single backlog item. */
function BacklogDetailModal({ item: b, onClose }: { item: BacklogItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'App', value: b.app || '—' },
    {
      label: 'Category',
      value: b.category
        ? <StatusBadge label={b.category} color="var(--purple)" />
        : '—',
    },
    {
      label: 'Priority',
      value: b.priority
        ? <StatusBadge label={b.priority} color={PRIORITY_COLOR[b.priority] ?? 'var(--text3)'} />
        : '—',
    },
    {
      label: 'Status',
      value: b.status
        ? <StatusBadge label={b.status} color={BACKLOG_STATUS_COLOR[b.status] ?? 'var(--text3)'} />
        : '—',
    },
    { label: 'Owner', value: b.owner || '—' },
    { label: 'Delivery', value: b.delivery_bucket || 'Unscheduled' },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 14, width: 'min(440px, 94vw)', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 11,
          padding: '16px 18px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>
              {b.task || '—'}
            </div>
            {b.category && (
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3 }}>
                {b.category}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '4px 6px', cursor: 'pointer', color: 'var(--text2)',
              display: 'flex', alignItems: 'center', flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Detail rows */}
        <div style={{ overflowY: 'auto', padding: '6px 0' }}>
          {rows.map((r, i) => (
            <div
              key={r.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 18px',
                borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)', minWidth: 78 }}>
                {r.label}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Clickable quarter column header with hover affordance. */
function QuarterColumnHeader({
  label, count, unscheduled, onClick,
}: {
  label: string; count: number; unscheduled: boolean; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`View all ${label} items by category`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        background: unscheduled ? 'var(--bg3, var(--bg2))' : 'var(--accent-dim)',
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <span style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 700,
        color: unscheduled ? 'var(--text2)' : 'var(--accent)',
      }}>
        {label}
        <Maximize2 size={11} style={{ opacity: hover ? 0.9 : 0.35, transition: 'opacity 0.12s ease' }} />
      </span>
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20,
        background: 'var(--bg3, var(--bg2))', color: 'var(--text2)',
      }}>
        {count}
      </span>
    </div>
  );
}

/* Popup: all items in one delivery quarter, grouped by category. */
function QuarterCategoryModal({
  label, items, onClose, onSelectItem,
}: {
  label: string;
  items: BacklogItem[];
  onClose: () => void;
  onSelectItem: (b: BacklogItem) => void;
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter(b =>
        (b.task ?? '').toLowerCase().includes(q) ||
        (b.category ?? '').toLowerCase().includes(q) ||
        (b.app ?? '').toLowerCase().includes(q) ||
        (b.owner ?? '').toLowerCase().includes(q))
    : items;

  // Group by category, alphabetical; "Uncategorized" last.
  const catMap = new Map<string, BacklogItem[]>();
  for (const b of filtered) {
    const key = b.category?.trim() || 'Uncategorized';
    if (!catMap.has(key)) catMap.set(key, []);
    catMap.get(key)!.push(b);
  }
  const cats = [...catMap.entries()].sort((a, b) => {
    if (a[0] === 'Uncategorized') return 1;
    if (b[0] === 'Uncategorized') return -1;
    return a[0].localeCompare(b[0]);
  });
  for (const [, arr] of cats) arr.sort((a, b) => (a.task ?? '').localeCompare(b.task ?? ''));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 14, width: 'min(560px, 94vw)', maxHeight: '82vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 11,
          padding: '16px 18px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{label}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 20,
                background: 'var(--accent-dim)', color: 'var(--accent)',
              }}>
                {items.length} item{items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3 }}>
              Grouped by category · {cats.length} categor{cats.length === 1 ? 'y' : 'ies'}
            </div>
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter…"
            style={{
              flexShrink: 0, width: 130, fontSize: 12, color: 'var(--text)',
              background: 'var(--bg3, var(--bg2))', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 9px', outline: 'none',
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '4px 6px', cursor: 'pointer', color: 'var(--text2)',
              display: 'flex', alignItems: 'center', flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Category groups */}
        <div style={{ overflowY: 'auto', padding: '6px 0 12px' }}>
          {cats.length === 0 ? (
            <div style={{ padding: '24px 18px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>
              No items match “{query}”.
            </div>
          ) : cats.map(([cat, arr]) => (
            <div key={cat}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 18px 4px',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{cat}</span>
                <span style={{
                  fontSize: 10.5, color: 'var(--text3)',
                  background: 'var(--bg3, var(--bg2))', padding: '1px 7px', borderRadius: 20,
                }}>
                  {arr.length}
                </span>
              </div>
              <div style={{ padding: '4px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {arr.map(b => (
                  <RoadmapCard key={b.id} item={b} onClick={() => onSelectItem(b)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BacklogRoadmap({ items }: { items: BacklogItem[] }) {
  const [selected, setSelected] = useState<BacklogItem | null>(null);
  const [quarterView, setQuarterView] = useState<{ label: string; items: BacklogItem[] } | null>(null);
  const groups = new Map<number, { label: string; sort: number; items: BacklogItem[] }>();
  for (const b of items) {
    const meta = quarterMeta(b.delivery_bucket);
    if (!groups.has(meta.sort)) groups.set(meta.sort, { label: meta.label, sort: meta.sort, items: [] });
    groups.get(meta.sort)!.items.push(b);
  }
  const cols = [...groups.values()].sort((a, b) => a.sort - b.sort);
  for (const c of cols) {
    // ascending by task/description label
    c.items.sort((a, b) => (a.task ?? '').localeCompare(b.task ?? ''));
  }

  if (cols.length === 0) {
    return (
      <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
        No items to build.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: 4, WebkitOverflowScrolling: 'touch' }}>
      {cols.map(col => {
        const unscheduled = col.sort === Number.POSITIVE_INFINITY;
        return (
          <div key={col.label} style={{
            flex: '0 0 auto', width: 264, display: 'flex', flexDirection: 'column',
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
          }}>
            <QuarterColumnHeader
              label={col.label}
              count={col.items.length}
              unscheduled={unscheduled}
              onClick={() => setQuarterView({ label: col.label, items: col.items })}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, maxHeight: 460, overflowY: 'auto' }}>
              {col.items.map(b => (
                <RoadmapCard key={b.id} item={b} onClick={() => setSelected(b)} />
              ))}
            </div>
          </div>
        );
      })}
      {quarterView && (
        <QuarterCategoryModal
          label={quarterView.label}
          items={quarterView.items}
          onClose={() => setQuarterView(null)}
          onSelectItem={b => setSelected(b)}
        />
      )}
      {selected && <BacklogDetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

type SortKey = 'ticket_ref' | 'assignee' | 'status' | 'type' | 'priority' | 'expected';

function TicketDetailPanel({
  product,
  tickets,
  loading,
  memberMap,
  onClose,
}: {
  product: Product;
  tickets: TicketImport[];
  loading: boolean;
  memberMap: Map<string, Member>;
  onClose: () => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function resolveAssignee(t: TicketImport): string {
    const raw = (!t.raw_assignee || t.raw_assignee === 'null') ? null : t.raw_assignee;
    return t.primary_member_id
      ? (memberMap.get(t.primary_member_id)?.name ?? raw ?? '')
      : raw ?? '';
  }

  const sorted = [...tickets].sort((a, b) => {
    if (!sortKey) return 0;
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'ticket_ref': return dir * (a.ticket_ref ?? '').localeCompare(b.ticket_ref ?? '');
      case 'assignee':   return dir * resolveAssignee(a).localeCompare(resolveAssignee(b));
      case 'status':     return dir * (a.status ?? '').localeCompare(b.status ?? '');
      case 'type': {
        const ta = a.is_bug ? 'Bug' : a.is_enhancement ? 'Enhancement' : '—';
        const tb = b.is_bug ? 'Bug' : b.is_enhancement ? 'Enhancement' : '—';
        return dir * ta.localeCompare(tb);
      }
      case 'priority':   return dir * ((a.priority ?? 2) - (b.priority ?? 2));
      case 'expected':   return dir * ((a.expected_date ?? '').localeCompare(b.expected_date ?? ''));
      default: return 0;
    }
  });

  const HEADERS: { label: string; key: SortKey | null }[] = [
    { label: 'Ticket Ref',  key: 'ticket_ref' },
    { label: 'Description', key: null },
    { label: 'Assignee',    key: 'assignee' },
    { label: 'Status',      key: 'status' },
    { label: 'Type',        key: 'type' },
    { label: 'Priority',    key: 'priority' },
    { label: 'Expected',    key: 'expected' },
  ];

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
      animation: 'slideDown 0.18s ease',
    }}>
      {/* Panel header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg3, var(--bg2))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {product.name}
          </div>
          {!loading && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: 'var(--accent-dim)', color: 'var(--accent)',
            }}>
              {tickets.length} tickets
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            padding: '4px 6px', cursor: 'pointer', color: 'var(--text2)',
            display: 'flex', alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--text3)' }}>Loading tickets…</div>
      ) : tickets.length === 0 ? (
        <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>
          No tickets for this product in the selected month.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 360 }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse',
            fontSize: 12, color: 'var(--text)',
          }}>
            <thead>
              <tr>
                {HEADERS.map(({ label, key }) => {
                  const active = sortKey === key;
                  const sortable = key !== null;
                  return (
                    <th
                      key={label}
                      onClick={sortable ? () => handleSort(key!) : undefined}
                      style={{
                        padding: '8px 14px', textAlign: 'left', fontWeight: 600,
                        fontSize: 11, whiteSpace: 'nowrap',
                        borderBottom: '1px solid var(--border)',
                        position: 'sticky', top: 0,
                        background: 'var(--bg2)',
                        color: active ? 'var(--accent)' : 'var(--text2)',
                        cursor: sortable ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                    >
                      {label}
                      {sortable && (
                        <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 9 }}>
                          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((t, i) => {
                const rawDisplay = (!t.raw_assignee || t.raw_assignee === 'null') ? null : t.raw_assignee;
                const assignee = t.primary_member_id
                  ? (memberMap.get(t.primary_member_id)?.name ?? rawDisplay ?? '—')
                  : rawDisplay ?? '—';
                return (
                  <tr key={t.id} style={{
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'transparent' : 'var(--bg3, rgba(0,0,0,0.02))',
                  }}>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--accent)' }}>
                      {t.ticket_ref}
                    </td>
                    <td style={{
                      padding: '9px 14px', maxWidth: 280,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {t.description || '—'}
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: 'var(--text2)' }}>
                      {assignee}
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <StatusBadge
                        label={TICKET_STATUS_LABEL[t.status] ?? t.status}
                        color={TICKET_STATUS_COLOR[t.status] ?? 'var(--text3)'}
                      />
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: 'var(--text2)' }}>
                      {t.is_bug ? 'Bug' : t.is_enhancement ? 'Enhancement' : '—'}
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <StatusBadge
                        label={`P${t.priority}`}
                        color={t.priority === 1 ? 'var(--red)' : 'var(--text3)'}
                      />
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: 'var(--text2)' }}>
                      {fmtDate(t.expected_date)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Chart components (Recharts) ── */

const tooltipStyle: React.CSSProperties = {
  background: 'var(--bg3)', border: '1px solid var(--border2)',
  borderRadius: 8, fontSize: 12, color: 'var(--text)', padding: '6px 10px',
};

function ChartCard({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="dp-card-accent" style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '14px 16px',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function TrendChart({ data, series }: { data: TrendPoint[]; series: TrendSeries[] }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border2)' }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="plainline" />
        {series.map(s => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.key}
            stroke={s.color} strokeWidth={2.5} dot={{ r: 2.5, fill: s.color }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function StatusDonut({ data, total }: {
  data: { name: string; value: number; color: string }[]; total: number;
}) {
  return (
    <div style={{ position: 'relative', width: 132, height: 132, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
            innerRadius={43} outerRadius={62} paddingAngle={2} stroke="none">
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 23, fontWeight: 700, color: 'var(--text)' }}>{total}</div>
        <div style={{ fontSize: 10, color: 'var(--text2)' }}>tickets</div>
      </div>
    </div>
  );
}

function BugsEnhChart({ data }: { data: { product: string; bugs: number; enh: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barGap={6} barCategoryGap="35%">
        <XAxis dataKey="product" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--accent-dim)' }} />
        <Bar dataKey="bugs" name="Bugs" fill={CHART.bug} radius={[4, 4, 0, 0]} maxBarSize={32}>
          <LabelList dataKey="bugs" position="top" fill="var(--text2)" fontSize={10} fontWeight={600} />
        </Bar>
        <Bar dataKey="enh" name="Enhancements" fill={CHART.enh} radius={[4, 4, 0, 0]} maxBarSize={32}>
          <LabelList dataKey="enh" position="top" fill="var(--text2)" fontSize={10} fontWeight={600} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}


/* ── Main ── */

export default function Overview() {
  const { member } = useAuth();
  const isMobile = useIsMobile();
  const pageStyle = usePageShellStyle({ maxWidth: 1200, gap: 28 });

  const [range, setRange] = useState(defaultRange);

  const [products, setProducts]                   = useState<Product[]>([]);
  const [productStats, setProductStats]           = useState<Map<string, ProductStats>>(new Map());
  const [statsLoading, setStatsLoading]           = useState(true);
  const [members, setMembers]                     = useState<Member[]>([]);
  const [memberMap, setMemberMap]                 = useState<Map<string, Member>>(new Map());
  const [memberTicketCounts, setMemberTicketCounts] = useState<Map<string, number>>(new Map());
  const [memberTickets, setMemberTickets]         = useState<Map<string, MemberTicketLite[]>>(new Map());
  const [selectedMemberId, setSelectedMemberId]   = useState<string | null>(null);
  const [memberLastStandup, setMemberLastStandup] = useState<Map<string, string>>(new Map());
  const [baseLoading, setBaseLoading]             = useState(true);

  const [selectedProductId, setSelectedProductId]       = useState<string | null>(null);
  const [selectedProductTickets, setSelectedProductTickets] = useState<TicketImport[]>([]);
  const [ticketsLoading, setTicketsLoading]             = useState(false);

  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);
  const [backlogProduct, setBacklogProduct] = useState<string | null>(null);
  const [backlogView, setBacklogView] = useState<'roadmap' | 'list'>('roadmap');
  const [selectedBacklog, setSelectedBacklog] = useState<BacklogItem | null>(null);
  const [backlogSort, setBacklogSort] = useState<{ key: BacklogSortKey; dir: 'asc' | 'desc' } | null>(null);

  const [prevDeployed, setPrevDeployed] = useState<number | null>(null);
  const [bugEnh, setBugEnh] = useState<Map<string, BugEnh>>(new Map());
  const [trend, setTrend]   = useState<TrendPoint[]>([]);
  const [trendProduct, setTrendProduct] = useState<string | null>(null); // null = all products
  const [presenting, setPresenting] = useState(false);
  const [presentTheme, setPresentTheme] = useState<'light' | 'dark'>('light');
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  function refresh() {
    setRefreshing(true);
    setRefreshTick(t => t + 1);
  }

  const pageRef     = useRef<HTMLDivElement>(null);
  const teamRef     = useRef<HTMLDivElement>(null);
  const productsRef = useRef<HTMLDivElement>(null);
  const backlogRef  = useRef<HTMLDivElement>(null);

  function jumpTo(ref: React.RefObject<HTMLDivElement>) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function togglePresent() {
    const el = pageRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  useEffect(() => {
    const onFs = () => setPresenting(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Base data: products, members, standup last dates, backlog (from Google Sheet)
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*'),
      supabase.from('members').select('*').eq('active', true).order('name'),
      supabase.from('standup_logs').select('member_id, date'),
      supabase.from('backlog_items').select('*').order('sort_index', { ascending: true }),
    ]).then(([{ data: prods }, { data: mems }, { data: standups }, { data: backlogData }]) => {
      const CODE_ORDER = ['HOTEL', 'MENU', 'EVENT', 'ACCOUNT', 'ACCOUNT_LITE'];
      const sorted = (prods ?? []).sort((a, b) =>
        CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code)
      );
      setProducts(sorted);
      setSelectedProductId(prev => prev ?? (sorted[0]?.id ?? null));

      const mems_ = sortMembers(mems ?? []);
      setMembers(mems_);
      const mm = new Map<string, Member>();
      mems_.forEach(m => mm.set(m.id, m));
      setMemberMap(mm);

      // Build last standup map
      const lastStandup = new Map<string, string>();
      for (const row of (standups ?? []) as { member_id: string; date: string }[]) {
        const existing = lastStandup.get(row.member_id);
        if (!existing || row.date > existing) lastStandup.set(row.member_id, row.date);
      }
      setMemberLastStandup(lastStandup);

      setBacklogItems(backlogData ?? []);
      setBaseLoading(false);
      setRefreshing(false);
    });
  }, [refreshTick]);

  // Month stats + per-member ticket counts
  useEffect(() => {
    setStatsLoading(true);
    setSelectedProductId(null);

    supabase
      .from('ticket_imports')
      .select('product_id, status, primary_member_id, is_bug, is_enhancement, ticket_ref, priority')
      .gte('created_ts', utcDayStart(range.from))
      .lt('created_ts', utcDayStart(toExclusive(range.to)))
      .then(({ data: tix }) => {
        const stats = new Map<string, ProductStats>();
        const memberCounts = new Map<string, number>();
        const memberTix = new Map<string, MemberTicketLite[]>();
        const be = new Map<string, BugEnh>();

        for (const row of (tix ?? []) as TicketRow[]) {
          if (!stats.has(row.product_id)) {
            stats.set(row.product_id, {
              open: 0, in_progress: 0, qc: 0, to_deploy: 0,
              deployed: 0, reopen: 0, no_action: 0, total: 0,
            });
          }
          const s = stats.get(row.product_id)!;
          s.total++;
          if (row.status === 'OPEN')             s.open++;
          else if (row.status === 'IN_PROGRESS') s.in_progress++;
          else if (row.status === 'QC')          s.qc++;
          else if (row.status === 'TO_DEPLOY')   s.to_deploy++;
          else if (row.status === 'DEPLOYED')    s.deployed++;
          else if (row.status === 'REOPEN')      s.reopen++;
          else if (row.status === 'NO_ACTION')   s.no_action++;

          if (!be.has(row.product_id)) be.set(row.product_id, { bugs: 0, enh: 0 });
          const b = be.get(row.product_id)!;
          if (row.is_bug) b.bugs++;
          if (row.is_enhancement) b.enh++;

          if (row.primary_member_id) {
            memberCounts.set(
              row.primary_member_id,
              (memberCounts.get(row.primary_member_id) ?? 0) + 1
            );
            if (row.ticket_ref) {
              const list = memberTix.get(row.primary_member_id) ?? [];
              list.push({
                ticket_ref: row.ticket_ref,
                status: row.status,
                priority: row.priority,
                product_id: row.product_id,
              });
              memberTix.set(row.primary_member_id, list);
            }
          }
        }

        setProductStats(stats);
        setMemberTicketCounts(memberCounts);
        setMemberTickets(memberTix);
        setBugEnh(be);
        setStatsLoading(false);
      });
  }, [range.from, range.to, refreshTick]);

  // Deployed count for the preceding equal-length period (MoM delta)
  useEffect(() => {
    setPrevDeployed(null);
    const len = daysInclusive(range.from, range.to);
    const prevFrom = addDays(range.from, -len);
    supabase
      .from('ticket_imports')
      .select('status', { count: 'exact', head: true })
      .gte('created_ts', utcDayStart(prevFrom))
      .lt('created_ts', utcDayStart(range.from))
      .eq('status', 'DEPLOYED')
      .then(({ count }) => setPrevDeployed(count ?? 0));
  }, [range.from, range.to, refreshTick]);

  // 6-month created-ticket trend (one line per product) ending at the range's end month
  useEffect(() => {
    if (products.length === 0) return;
    const anchorMonth = range.to.slice(0, 7); // YYYY-MM of the range's end
    const codeById = new Map(products.map(p => [p.id, p.code]));
    const pts: TrendPoint[] = [];
    for (let i = 5; i >= 0; i--) {
      const ym = shiftMonth(anchorMonth, -i);
      const [y, mo] = ym.split('-').map(Number);
      const base: TrendPoint = {
        month: ym,
        label: new Date(y, mo - 1, 1).toLocaleDateString('en-MY', { month: 'short' }),
      };
      for (const p of products) base[p.code] = 0;
      pts.push(base);
    }
    const idx = new Map(pts.map((p, i) => [p.month, i]));
    supabase
      .from('ticket_imports')
      .select('imported_month, product_id')
      .gte('imported_month', pts[0].month + '-01')
      .lte('imported_month', pts[pts.length - 1].month + '-01')
      .then(({ data }) => {
        const next = pts.map(p => ({ ...p }));
        for (const r of (data ?? []) as { imported_month: string; product_id: string }[]) {
          const i = idx.get(String(r.imported_month).slice(0, 7));
          const code = codeById.get(r.product_id);
          if (i === undefined || !code) continue;
          next[i][code] = (Number(next[i][code]) || 0) + 1;
        }
        setTrend(next);
      });
  }, [range.to, products, refreshTick]);

  // Fetch full ticket detail when a product is selected
  useEffect(() => {
    if (!selectedProductId) {
      setSelectedProductTickets([]);
      return;
    }
    setTicketsLoading(true);
    supabase
      .from('ticket_imports')
      .select('*')
      .eq('product_id', selectedProductId)
      .gte('created_ts', utcDayStart(range.from))
      .lt('created_ts', utcDayStart(toExclusive(range.to)))
      .order('ticket_ref')
      .then(({ data }) => {
        setSelectedProductTickets((data ?? []) as TicketImport[]);
        setTicketsLoading(false);
      });
  }, [selectedProductId, range.from, range.to]);

  const totals = useMemo(() => {
    let active = 0, deployed = 0;
    for (const s of productStats.values()) {
      active += s.open + s.in_progress + s.qc + s.to_deploy + s.reopen;
      deployed += s.deployed;
    }
    return { active, deployed };
  }, [productStats]);

  const statusTotals = useMemo(() => {
    const t = { open: 0, in_progress: 0, qc: 0, to_deploy: 0, deployed: 0, reopen: 0, no_action: 0, total: 0 };
    for (const s of productStats.values()) {
      t.open += s.open; t.in_progress += s.in_progress; t.qc += s.qc;
      t.to_deploy += s.to_deploy; t.deployed += s.deployed;
      t.reopen += s.reopen; t.no_action += s.no_action; t.total += s.total;
    }
    return t;
  }, [productStats]);

  const deliveryRate = statusTotals.total > 0
    ? Math.round(totals.deployed / statusTotals.total * 100) : 0;
  const healthColor = deliveryRate >= 70 ? 'var(--green)' : deliveryRate >= 40 ? 'var(--amber)' : 'var(--red)';
  const health = deliveryRate >= 70 ? 'Strong' : deliveryRate >= 40 ? 'Steady' : 'Slow';

  const momDisplay = (() => {
    if (statsLoading || prevDeployed === null) return '—';
    if (prevDeployed === 0 && totals.deployed === 0) return '—';
    if (prevDeployed === 0) return `+${totals.deployed}`;
    const delta = Math.round(((totals.deployed - prevDeployed) / prevDeployed) * 100);
    return delta >= 0 ? `↑${delta}%` : `↓${Math.abs(delta)}%`;
  })();
  const momColor = (() => {
    if (statsLoading || prevDeployed === null || (prevDeployed === 0 && totals.deployed === 0)) return 'var(--text2)';
    if (prevDeployed === 0) return 'var(--green)';
    return totals.deployed >= prevDeployed ? 'var(--green)' : 'var(--red)';
  })();

  const statusDonutData = useMemo(() => ([
    { name: 'Open',        value: statusTotals.open,        color: CHART.open },
    { name: 'In Progress', value: statusTotals.in_progress, color: CHART.inProgress },
    { name: 'QC',          value: statusTotals.qc,          color: CHART.qc },
    { name: 'To Deploy',   value: statusTotals.to_deploy,   color: CHART.toDeploy },
    { name: 'Deployed',    value: statusTotals.deployed,    color: CHART.deployed },
    { name: 'Reopen',      value: statusTotals.reopen,      color: CHART.reopen },
    { name: 'No Action',   value: statusTotals.no_action,   color: CHART.noAction },
  ].filter(d => d.value > 0)), [statusTotals]);

  const bugEnhData = useMemo(() => products
    .map(p => ({ product: p.code, bugs: bugEnh.get(p.id)?.bugs ?? 0, enh: bugEnh.get(p.id)?.enh ?? 0 }))
    .filter(d => d.bugs > 0 || d.enh > 0), [products, bugEnh]);

  const trendSeries = useMemo<TrendSeries[]>(
    () => products.map((p, i) => ({ key: p.code, color: PRODUCT_COLORS[i % PRODUCT_COLORS.length] })),
    [products]
  );

  // Average monthly ticket inflow over the trend window, for the selected scope
  const trendAvg = useMemo(() => {
    if (trend.length === 0) return 0;
    const keys = trendProduct ? [trendProduct] : products.map(p => p.code);
    let sum = 0;
    for (const pt of trend) for (const k of keys) sum += Number(pt[k]) || 0;
    return Math.round(sum / trend.length);
  }, [trend, trendProduct, products]);

  const filteredBacklog = useMemo(() => {
    if (!backlogProduct) return backlogItems;
    return backlogItems.filter(b => b.product_id === backlogProduct);
  }, [backlogItems, backlogProduct]);

  const sortedBacklog = useMemo(() => {
    if (!backlogSort) return filteredBacklog;
    const { key, dir } = backlogSort;
    const mul = dir === 'asc' ? 1 : -1;
    const txt = (v: string | null) => (v ?? '').toLowerCase();
    return [...filteredBacklog].sort((a, b) => {
      switch (key) {
        case 'priority':
          return mul * ((PRIORITY_RANK[a.priority ?? ''] ?? 99) - (PRIORITY_RANK[b.priority ?? ''] ?? 99));
        case 'status':
          return mul * ((BACKLOG_STATUS_RANK[a.status ?? ''] ?? 99) - (BACKLOG_STATUS_RANK[b.status ?? ''] ?? 99));
        case 'task':     return mul * txt(a.task).localeCompare(txt(b.task));
        case 'app':      return mul * txt(a.app).localeCompare(txt(b.app));
        case 'category': return mul * txt(a.category).localeCompare(txt(b.category));
        case 'owner':    return mul * txt(a.owner).localeCompare(txt(b.owner));
        case 'bucket':   return mul * txt(a.delivery_bucket).localeCompare(txt(b.delivery_bucket));
        default:         return 0;
      }
    });
  }, [filteredBacklog, backlogSort]);

  function toggleBacklogSort(key: BacklogSortKey) {
    setBacklogSort(prev =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' });
  }

  const selectedProduct = useMemo(
    () => products.find(p => p.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  if (baseLoading) {
    return <Loader label="Loading overview…" padding={64} />;
  }

  return (
    <div
      style={pageStyle}
      ref={pageRef}
      className={presenting ? `dp-presenting dp-theme-${presentTheme}` : undefined}
    >

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          {presenting ? (
            <Logo height={38} animated style={{ display: 'block' }} />
          ) : (
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
              {greeting()}{member ? `, ${member.name.split(' ')[0]}` : ''}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            {new Date().toLocaleDateString('en-MY', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
            {' · '}Management overview across all products
          </div>
        </div>

        {/* Date-range filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={e => {
                  const from = e.target.value;
                  if (!from) return;
                  setRange(r => ({ from, to: from > r.to ? from : r.to }));
                }}
                style={DATE_INPUT_STYLE}
              />
              <span style={{ color: 'var(--text3)', fontSize: 13 }}>–</span>
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={e => {
                  const to = e.target.value;
                  if (!to) return;
                  setRange(r => ({ from: to < r.from ? to : r.from, to }));
                }}
                style={DATE_INPUT_STYLE}
              />
            </div>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, textAlign: 'center' }}>
              Presentation range · {fmtRange(range.from, range.to)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {RANGE_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => setRange(p.get())}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 7,
                  cursor: 'pointer', background: 'var(--bg2)',
                  border: '1px solid var(--border2)', color: 'var(--text2)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {presenting && (
            <button
              onClick={() => setPresentTheme(t => (t === 'light' ? 'dark' : 'light'))}
              title="Toggle presentation theme"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4,
                background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8,
                padding: '8px 12px', cursor: 'pointer', color: 'var(--text2)',
                fontWeight: 600, fontSize: 12,
              }}
            >
              {presentTheme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
              {presentTheme === 'light' ? 'Dark' : 'Light'}
            </button>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Refresh data"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4,
              background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8,
              padding: '8px 12px', cursor: refreshing ? 'default' : 'pointer',
              color: 'var(--text2)', fontWeight: 600, fontSize: 12, opacity: refreshing ? 0.7 : 1,
            }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={togglePresent}
            title="Presentation mode (fullscreen)"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4,
              background: 'linear-gradient(90deg, var(--accent-dark), var(--accent))',
              border: 'none', borderRadius: 8, padding: '8px 12px',
              cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: 12,
            }}
          >
            {presenting ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {presenting ? 'Exit' : 'Present'}
          </button>
        </div>
      </div>

      {/* KPI strip — 2 primary + 2 supporting */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiPrimary
          icon={<TrendingUp size={20} />}
          label="Delivery Rate"
          value={statsLoading ? '—' : `${deliveryRate}%`}
          sub={`${totals.deployed} of ${statusTotals.total} deployed · ${fmtRange(range.from, range.to)}`}
          color={healthColor}
          note="Rollout spans multiple servers, so newly-deployed items may take time to reflect here."
        />
        <KpiPrimary
          icon={<Activity size={20} />}
          label="vs previous period"
          value={momDisplay}
          sub={prevDeployed !== null ? `${totals.deployed} deployed this period, ${prevDeployed} prior period` : 'Loading…'}
          color={momColor}
        />
        <KpiPill
          icon={<div style={{ width: 10, height: 10, borderRadius: '50%', background: healthColor }} />}
          label="Team health"
          value={statsLoading ? '—' : `${health} · ${deliveryRate}%`}
          color={healthColor}
        />
        <KpiPill
          icon={<Users size={18} />}
          label="Active members"
          value={members.length}
          color="var(--accent)"
        />
      </div>

      {/* Sticky section nav */}
      <div className="dp-section-nav">
        <span style={{ fontSize: 9, color: 'var(--text3)', letterSpacing: '0.12em', fontWeight: 600 }}>
          JUMP TO
        </span>
        {([
          { label: 'Team', ref: teamRef },
          { label: 'Products', ref: productsRef },
          { label: 'Backlog', ref: backlogRef },
        ] as const).map(({ label, ref }) => (
          <button
            key={label}
            onClick={() => jumpTo(ref)}
            style={{
              fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 99,
              cursor: 'pointer', background: 'var(--bg2)', color: 'var(--text2)',
              border: '1px solid var(--border2)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Team ── */}
      <div ref={teamRef}>
      <Section title={`Team · ${members.length} members`}>
        {(() => {
          return (
            <div className="dp-member-grid">
              {members.map(m => (
                <MemberCard
                  key={m.id}
                  member={m}
                  ticketCount={memberTicketCounts.get(m.id) ?? 0}
                  lastStandup={memberLastStandup.get(m.id)}
                  onClick={() => setSelectedMemberId(m.id)}
                />
              ))}
            </div>
          );
        })()}
      </Section>
      </div>

      {/* ── Products ── */}
      <div ref={productsRef} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Analytics charts */}
      <Section title={`Analytics · ${fmtRange(range.from, range.to)}`}>
        {statsLoading ? (
          <Loader size={22} padding={16} />
        ) : statusTotals.total === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)', padding: '16px 0' }}>
            No ticket data for {fmtRange(range.from, range.to)}.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ChartCard
              title="Tickets created · 6-month trend"
              action={
                <div style={{ display: 'flex', gap: 4 }}>
                  {[{ code: null as string | null, label: 'All' },
                    ...products.map(p => ({ code: p.code, label: p.code }))].map(opt => {
                    const on = trendProduct === opt.code;
                    return (
                      <button
                        key={opt.label}
                        onClick={() => setTrendProduct(opt.code)}
                        style={{
                          fontSize: 11, fontWeight: 600, padding: '3px 11px', borderRadius: 99,
                          cursor: 'pointer', transition: 'all 0.12s',
                          background: on ? 'var(--accent)' : 'var(--bg3)',
                          color: on ? '#fff' : 'var(--text2)',
                          border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              }
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>
                  {trendAvg}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                  avg tickets / month · {trendProduct ?? 'all products'} · last 6 mo
                </span>
              </div>
              <TrendChart
                data={trend}
                series={trendProduct ? trendSeries.filter(s => s.key === trendProduct) : trendSeries}
              />
            </ChartCard>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <ChartCard title="Status distribution">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <StatusDonut data={statusDonutData} total={statusTotals.total} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, flex: 1 }}>
                    {statusDonutData.map(d => (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <StatusDot color={d.color} />
                        <span style={{ color: 'var(--text2)', flex: 1 }}>{d.name}</span>
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </ChartCard>

              <ChartCard
                title="Bugs vs enhancements"
                action={
                  <span style={{ fontSize: 10 }}>
                    <span style={{ color: 'var(--red)' }}>● bug</span>{' '}
                    <span style={{ color: 'var(--blue)', marginLeft: 6 }}>● enh</span>
                  </span>
                }
              >
                {bugEnhData.length > 0
                  ? <BugsEnhChart data={bugEnhData} />
                  : <div style={{ fontSize: 12, color: 'var(--text3)', padding: '40px 0', textAlign: 'center' }}>No data</div>}
              </ChartCard>
            </div>

          </div>
        )}
      </Section>

      {/* Ticket summary table */}
      <Section title="Ticket Summary · by product">
        {statsLoading ? (
          <Loader size={22} padding={16} />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: 'var(--text)' }}>
                <thead>
                  <tr>
                    {['Product', 'Open', 'In Prog', 'QC', 'To Deploy', 'Deployed', 'Reopen', 'No Action', 'Total'].map((h, i) => (
                      <th key={h} style={{
                        padding: '10px 14px', textAlign: i === 0 ? 'left' : 'right',
                        fontWeight: 600, fontSize: 11, color: 'var(--text2)',
                        borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const s = productStats.get(p.id);
                    const cells = s
                      ? [s.open, s.in_progress, s.qc, s.to_deploy, s.deployed, s.reopen, s.no_action]
                      : [0, 0, 0, 0, 0, 0, 0];
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 14px', fontWeight: 600 }}>{p.name}</td>
                        {cells.map((c, i) => (
                          <td key={i} style={{ padding: '9px 14px', textAlign: 'right', color: c === 0 ? 'var(--text3)' : 'var(--text)' }}>{c}</td>
                        ))}
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{s?.total ?? 0}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--text2)' }}>Total</td>
                    {[statusTotals.open, statusTotals.in_progress, statusTotals.qc, statusTotals.to_deploy, statusTotals.deployed, statusTotals.reopen, statusTotals.no_action].map((c, i) => (
                      <td key={i} style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600 }}>{c}</td>
                    ))}
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{statusTotals.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Section>

      {/* Product snapshot + inline detail panel */}
      <Section title={`Product Snapshot · ${fmtRange(range.from, range.to)}`}>
        {statsLoading ? (
          <Loader size={22} padding={16} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}>
              {products.map(p => {
                const s = productStats.get(p.id);
                const stale = !p.last_imported_at || daysSince(p.last_imported_at) > 7;
                const isSelected = selectedProductId === p.id;

                return (
                  <div
                    key={p.id}
                    className={isSelected ? 'dp-elev-active' : 'dp-elev'}
                    onClick={() => setSelectedProductId(prev => prev === p.id ? null : p.id)}
                    style={{
                      background: 'var(--bg2)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 12, padding: 16, cursor: 'pointer',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                  >
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                        {p.name}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {stale && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                            background: 'var(--amber-dim)', color: 'var(--amber)',
                            border: '1px solid var(--amber)44', whiteSpace: 'nowrap',
                          }}>
                            Stale
                          </span>
                        )}
                        {isSelected && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                            background: 'var(--accent-dim)', color: 'var(--accent)',
                            border: '1px solid var(--accent)44',
                          }}>
                            Selected
                          </span>
                        )}
                      </div>
                    </div>

                    {s && s.total > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <StatusRow label="Open"        value={s.open}        color="var(--red)"    total={s.total} />
                        <StatusRow label="In Progress" value={s.in_progress} color="var(--blue)"   total={s.total} />
                        <StatusRow label="QC"          value={s.qc}          color="var(--purple)" total={s.total} />
                        <StatusRow label="To Deploy"   value={s.to_deploy}   color="var(--amber)"  total={s.total} />
                        <StatusRow label="Deployed"    value={s.deployed}    color="var(--green)"  total={s.total} />
                        {s.reopen > 0 && (
                          <StatusRow label="Reopen"    value={s.reopen}    color="var(--red)"    total={s.total} />
                        )}
                        {s.no_action > 0 && (
                          <StatusRow label="No Action" value={s.no_action} color="var(--text3)"  total={s.total} />
                        )}
                        <div style={{
                          marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)',
                          fontSize: 12, color: 'var(--text3)',
                          display: 'flex', justifyContent: 'space-between',
                        }}>
                          <span>Total</span>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{s.total}</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        fontSize: 12, color: 'var(--text3)',
                        textAlign: 'center', padding: '16px 0',
                      }}>
                        No import data for {fmtRange(range.from, range.to)}
                      </div>
                    )}

                    {p.last_imported_at && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
                        Last imported {formatDate(p.last_imported_at)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Inline detail panel */}
            {selectedProduct && (
              <TicketDetailPanel
                product={selectedProduct}
                tickets={selectedProductTickets}
                loading={ticketsLoading}
                memberMap={memberMap}
                onClose={() => setSelectedProductId(null)}
              />
            )}
          </div>
        )}
      </Section>
      </div>

      {/* ── Backlog ── */}
      <div ref={backlogRef}>
      <Section
        title={`Backlog · Upcoming Features · ${
          backlogView === 'roadmap'
            ? filteredBacklog.filter(b => b.status !== 'Done').length
            : filteredBacklog.length
        }`}
        action={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['roadmap', 'list'] as const).map(v => {
                const on = backlogView === v;
                return (
                  <button key={v} onClick={() => setBacklogView(v)} style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    cursor: 'pointer', transition: 'all 0.12s',
                    background: on ? 'var(--accent)' : 'var(--bg2)',
                    color: on ? '#fff' : 'var(--text2)',
                    border: on ? '1px solid var(--accent)' : '1px solid var(--border)',
                  }}>
                    {v === 'roadmap' ? 'By quarter' : 'List'}
                  </button>
                );
              })}
            </div>
            <div style={{ width: 1, height: 18, background: 'var(--border)', alignSelf: 'center' }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setBacklogProduct(null)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                cursor: 'pointer', transition: 'all 0.12s',
                background: backlogProduct === null ? 'var(--accent)' : 'var(--bg2)',
                color: backlogProduct === null ? '#fff' : 'var(--text2)',
                border: backlogProduct === null
                  ? '1px solid var(--accent)'
                  : '1px solid var(--border)',
              }}
            >
              All
            </button>
            {products.map(p => (
              <button
                key={p.id}
                onClick={() => setBacklogProduct(prev => prev === p.id ? null : p.id)}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                  cursor: 'pointer', transition: 'all 0.12s',
                  background: backlogProduct === p.id ? 'var(--accent)' : 'var(--bg2)',
                  color: backlogProduct === p.id ? '#fff' : 'var(--text2)',
                  border: backlogProduct === p.id
                    ? '1px solid var(--accent)'
                    : '1px solid var(--border)',
                }}
              >
                {p.code}
              </button>
            ))}
            </div>
          </div>
        }
      >
        {backlogView === 'roadmap' ? (
          <BacklogRoadmap items={filteredBacklog.filter(b => b.status !== 'Done')} />
        ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {filteredBacklog.length === 0 ? (
            <div style={{
              padding: '24px 20px', textAlign: 'center',
              fontSize: 13, color: 'var(--text3)',
            }}>
              No backlog items{backlogProduct ? ' for this product' : ''}.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '68vh' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: 12, color: 'var(--text)',
              }}>
                <thead>
                  <tr>
                    {([
                      ['Task', 'task'], ['App', 'app'], ['Category', 'category'],
                      ['Priority', 'priority'], ['Status', 'status'], ['Owner', 'owner'],
                      ['Bucket', 'bucket'],
                    ] as [string, BacklogSortKey][]).map(([label, key]) => {
                      const active = backlogSort?.key === key;
                      return (
                        <th key={key}
                          onClick={() => toggleBacklogSort(key)}
                          style={{
                            padding: '10px 16px', textAlign: 'left',
                            fontWeight: 600, fontSize: 11,
                            color: active ? 'var(--accent)' : 'var(--text2)',
                            borderBottom: '1px solid var(--border)',
                            whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
                            position: 'sticky', top: 0, zIndex: 1,
                            background: 'var(--bg2)',
                          }}>
                          {label}
                          <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 9 }}>
                            {active ? (backlogSort!.dir === 'asc' ? '▲' : '▼') : '⇅'}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedBacklog.map((b, i) => (
                    <tr key={b.id}
                      onClick={() => setSelectedBacklog(b)}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 === 0 ? 'transparent' : 'var(--bg3, rgba(0,0,0,0.02))',
                        cursor: 'pointer',
                      }}>
                      <td style={{
                        padding: '10px 16px', fontWeight: 600,
                        maxWidth: 320, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }} title={b.task ?? undefined}>
                        {b.task || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {b.app || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {b.category || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        {b.priority
                          ? <StatusBadge label={b.priority} color={PRIORITY_COLOR[b.priority] ?? 'var(--text3)'} />
                          : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        {b.status
                          ? <StatusBadge label={b.status} color={BACKLOG_STATUS_COLOR[b.status] ?? 'var(--text3)'} />
                          : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {b.owner || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {b.delivery_bucket || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        )}
      </Section>
      </div>

      {/* ── Member ticket drill-down ── */}
      {selectedMemberId && memberMap.get(selectedMemberId) && (
        <MemberTicketsModal
          member={memberMap.get(selectedMemberId)!}
          tickets={memberTickets.get(selectedMemberId) ?? []}
          productById={new Map(products.map(p => [p.id, p]))}
          monthLabel={fmtRange(range.from, range.to)}
          onClose={() => setSelectedMemberId(null)}
        />
      )}

      {/* ── Backlog item detail (list view) ── */}
      {selectedBacklog && (
        <BacklogDetailModal item={selectedBacklog} onClose={() => setSelectedBacklog(null)} />
      )}

    </div>
  );
}
