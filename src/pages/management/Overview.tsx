// Phase 11 — Management Overview (owner + admin)
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Users, Activity, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { usePageShellStyle } from '../../hooks/usePageShellStyle';
import { formatDate, sortMembers } from '../../lib/utils';
import Avatar from '../../components/UI/Avatar';
import type { Product, Member, TicketImport, Task } from '../../types';

/* ── helpers ── */

function prevMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMonth(ym: string): string {
  if (!ym) return '—';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

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

const TASK_STATUS_COLOR: Record<string, string> = {
  'Pending':     'var(--text3)',
  'In Progress': 'var(--blue)',
  'Blocked':     'var(--red)',
  'QC':          'var(--purple)',
  'Done':        'var(--green)',
};

/* ── Local types ── */

interface TicketRow {
  product_id: string;
  status: string;
  primary_member_id: string | null;
}

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
    <div style={{
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
    <div style={{
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
  maxTickets,
  lastStandup,
}: {
  member: Member;
  ticketCount: number;
  maxTickets: number;
  lastStandup: string | undefined;
}) {
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
  const standupLabel = standupDays === 0
    ? 'Today'
    : standupDays === 1
    ? 'Yesterday'
    : standupDays < 7
    ? `${standupDays}d ago`
    : 'No recent';

  const barPct = maxTickets > 0 ? Math.round((ticketCount / maxTickets) * 100) : 0;
  const barColor = ticketCount === 0
    ? 'var(--border2)'
    : ticketCount >= maxTickets * 0.75
    ? 'var(--red)'
    : ticketCount >= maxTickets * 0.4
    ? 'var(--amber)'
    : 'var(--green)';

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '15px 16px 14px',
      display: 'flex', flexDirection: 'column', gap: 11,
    }}>
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
            border: '2px solid var(--bg2)',
          }} title={`Standup: ${standupLabel}`} />
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

      {/* Workload bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tickets</span>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: ticketCount > 0 ? 'var(--text)' : 'var(--text3)',
          }}>
            {ticketCount}
          </span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${barPct}%`,
            background: barColor,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Standup status pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        alignSelf: 'flex-start',
        padding: '4px 9px', borderRadius: 99,
        background: standupDim,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: standupColor, flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, color: standupColor, fontWeight: 600 }}>
          {standupDays >= 7 ? 'No recent standup' : `Standup ${standupLabel.toLowerCase()}`}
        </span>
      </div>
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

/* ── Main ── */

export default function Overview() {
  const { member } = useAuth();
  const isMobile = useIsMobile();
  const pageStyle = usePageShellStyle({ maxWidth: 1200, gap: 28 });

  const [selectedMonth, setSelectedMonth] = useState(prevMonth);

  const [products, setProducts]                   = useState<Product[]>([]);
  const [productStats, setProductStats]           = useState<Map<string, ProductStats>>(new Map());
  const [statsLoading, setStatsLoading]           = useState(true);
  const [members, setMembers]                     = useState<Member[]>([]);
  const [memberMap, setMemberMap]                 = useState<Map<string, Member>>(new Map());
  const [memberTicketCounts, setMemberTicketCounts] = useState<Map<string, number>>(new Map());
  const [memberLastStandup, setMemberLastStandup] = useState<Map<string, string>>(new Map());
  const [baseLoading, setBaseLoading]             = useState(true);

  const [selectedProductId, setSelectedProductId]       = useState<string | null>(null);
  const [selectedProductTickets, setSelectedProductTickets] = useState<TicketImport[]>([]);
  const [ticketsLoading, setTicketsLoading]             = useState(false);

  const [tasks, setTasks]               = useState<Task[]>([]);
  const [backlogProduct, setBacklogProduct] = useState<string | null>(null);

  // Base data: products, members, standup last dates, tasks
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*'),
      supabase.from('members').select('*').eq('active', true).order('name'),
      supabase.from('standup_logs').select('member_id, date'),
      supabase.from('tasks').select('*').neq('status', 'Done').order('due_date', { ascending: true }),
    ]).then(([{ data: prods }, { data: mems }, { data: standups }, { data: taskData }]) => {
      const CODE_ORDER = ['HOTEL', 'MENU', 'EVENT', 'ACCOUNT'];
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

      setTasks(taskData ?? []);
      setBaseLoading(false);
    });
  }, []);

  // Month stats + per-member ticket counts
  useEffect(() => {
    setStatsLoading(true);
    setSelectedProductId(null);

    supabase
      .from('ticket_imports')
      .select('product_id, status, primary_member_id')
      .eq('imported_month', selectedMonth + '-01')
      .then(({ data: tix }) => {
        const stats = new Map<string, ProductStats>();
        const memberCounts = new Map<string, number>();

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

          if (row.primary_member_id) {
            memberCounts.set(
              row.primary_member_id,
              (memberCounts.get(row.primary_member_id) ?? 0) + 1
            );
          }
        }

        setProductStats(stats);
        setMemberTicketCounts(memberCounts);
        setStatsLoading(false);
      });
  }, [selectedMonth]);

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
      .eq('imported_month', selectedMonth + '-01')
      .order('ticket_ref')
      .then(({ data }) => {
        setSelectedProductTickets((data ?? []) as TicketImport[]);
        setTicketsLoading(false);
      });
  }, [selectedProductId, selectedMonth]);

  const totals = useMemo(() => {
    let active = 0, deployed = 0;
    for (const s of productStats.values()) {
      active += s.open + s.in_progress + s.qc + s.to_deploy + s.reopen;
      deployed += s.deployed;
    }
    return { active, deployed };
  }, [productStats]);

  const filteredTasks = useMemo(() => {
    if (!backlogProduct) return tasks;
    return tasks.filter(t => t.product_id === backlogProduct);
  }, [tasks, backlogProduct]);

  const isCurrentMonth = selectedMonth === (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const selectedProduct = useMemo(
    () => products.find(p => p.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  if (baseLoading) {
    return <div style={{ padding: 32, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div style={pageStyle}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            {greeting()}{member ? `, ${member.name.split(' ')[0]}` : ''}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            {new Date().toLocaleDateString('en-MY', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
            {' · '}Management overview across all products
          </div>
        </div>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setSelectedMonth(m => shiftMonth(m, -1))}
            style={{
              background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 7,
              padding: '7px 10px', cursor: 'pointer', color: 'var(--text2)', display: 'flex',
            }}
          >
            <ChevronLeft size={14} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', minWidth: 130 }}>
              {fmtMonth(selectedMonth)}
            </div>
            {!isCurrentMonth && (
              <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, marginTop: 1 }}>
                Presentation month
              </div>
            )}
          </div>
          <button
            onClick={() => setSelectedMonth(m => shiftMonth(m, +1))}
            disabled={isCurrentMonth}
            style={{
              background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 7,
              padding: '7px 10px', cursor: isCurrentMonth ? 'not-allowed' : 'pointer',
              color: 'var(--text2)', display: 'flex', opacity: isCurrentMonth ? 0.3 : 1,
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiPill
          icon={<Users size={18} />}
          label="Active members"
          value={members.length}
          color="var(--accent)"
        />
        <KpiPill
          icon={<Activity size={18} />}
          label={`Active tickets · ${fmtMonth(selectedMonth)}`}
          value={totals.active}
          color="var(--blue)"
        />
        <KpiPill
          icon={<TrendingUp size={18} />}
          label={`Deployed · ${fmtMonth(selectedMonth)}`}
          value={totals.deployed}
          color="var(--green)"
        />
      </div>

      {/* Active Members */}
      <Section title={`Active Members · ${members.length}`}>
        {(() => {
          const maxTickets = Math.max(1, ...members.map(m => memberTicketCounts.get(m.id) ?? 0));
          return (
            <div className="dp-member-grid">
              {members.map(m => (
                <MemberCard
                  key={m.id}
                  member={m}
                  ticketCount={memberTicketCounts.get(m.id) ?? 0}
                  maxTickets={maxTickets}
                  lastStandup={memberLastStandup.get(m.id)}
                />
              ))}
            </div>
          );
        })()}
      </Section>

      {/* Product snapshot + inline detail panel */}
      <Section title={`Product Snapshot · ${fmtMonth(selectedMonth)}`}>
        {statsLoading ? (
          <div style={{ fontSize: 13, color: 'var(--text3)', padding: '16px 0' }}>Loading…</div>
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
                    onClick={() => setSelectedProductId(prev => prev === p.id ? null : p.id)}
                    style={{
                      background: 'var(--bg2)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 12, padding: 16, cursor: 'pointer',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                      boxShadow: isSelected ? '0 0 0 3px var(--accent-dim)' : 'none',
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
                        No import data for {fmtMonth(selectedMonth)}
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

      {/* Backlog / Upcoming Features */}
      <Section
        title="Backlog · Upcoming Features"
        action={
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
        }
      >
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {filteredTasks.length === 0 ? (
            <div style={{
              padding: '24px 20px', textAlign: 'center',
              fontSize: 13, color: 'var(--text3)',
            }}>
              No upcoming tasks{backlogProduct ? ' for this product' : ''}.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: 12, color: 'var(--text)',
              }}>
                <thead>
                  <tr>
                    {['Title', 'Product', 'Type', 'Status', 'Due Date', 'Assignees'].map(h => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left',
                        fontWeight: 600, fontSize: 11, color: 'var(--text2)',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((t, i) => {
                    const prod = products.find(p => p.id === t.product_id);
                    const assigneeNames = (t.assignees ?? [])
                      .map(id => memberMap.get(id)?.name.split(' ')[0] ?? '?')
                      .join(', ');
                    const isOverdue = t.due_date && new Date(t.due_date) < new Date();

                    return (
                      <tr key={t.id} style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 === 0 ? 'transparent' : 'var(--bg3, rgba(0,0,0,0.02))',
                      }}>
                        <td style={{
                          padding: '10px 16px', fontWeight: 600,
                          maxWidth: 260, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {t.title}
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                          {prod?.code ?? '—'}
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                          {t.type || '—'}
                        </td>
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          <StatusBadge
                            label={t.status}
                            color={TASK_STATUS_COLOR[t.status] ?? 'var(--text3)'}
                          />
                        </td>
                        <td style={{
                          padding: '10px 16px', whiteSpace: 'nowrap',
                          color: isOverdue ? 'var(--red)' : 'var(--text2)',
                          fontWeight: isOverdue ? 600 : 400,
                        }}>
                          {fmtDate(t.due_date)}
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text2)' }}>
                          {assigneeNames || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Section>

    </div>
  );
}
