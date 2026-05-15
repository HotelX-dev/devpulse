// Phase 11 — Management Overview (owner + admin)
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Users, Bell, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAlerts } from '../../hooks/useAlerts';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { usePageShellStyle } from '../../hooks/usePageShellStyle';
import { formatDate, sortMembers } from '../../lib/utils';
import AlertBanner from '../../components/UI/AlertBanner';
import Avatar from '../../components/UI/Avatar';
import type { Product, Member } from '../../types';

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

/* ── Local types ── */

interface TicketRow {
  product_id: string;
  status: string;
}

interface ProductStats {
  open: number;
  in_progress: number;
  qc: number;
  to_deploy: number;
  deployed: number;
  reopen: number;
  total: number;
}

/* ── Sub-components ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {title}
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
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

function StatusRow({ label, value, color, total }: {
  label: string; value: number; color: string; total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <StatusDot color={color} />
      <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{label}</span>
      <div style={{ width: 80, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 24, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

/* ── Main ── */

export default function Overview() {
  const { member } = useAuth();
  const isMobile = useIsMobile();
  const pageStyle = usePageShellStyle({ maxWidth: 1200, gap: 28 });
  const { alerts } = useAlerts();

  // Default to previous month — this is for management presentations
  const [selectedMonth, setSelectedMonth] = useState(prevMonth);

  const [products, setProducts]         = useState<Product[]>([]);
  const [productStats, setProductStats] = useState<Map<string, ProductStats>>(new Map());
  const [statsLoading, setStatsLoading] = useState(true);
  const [members, setMembers]           = useState<Member[]>([]);
  const [memberMap, setMemberMap]       = useState<Map<string, Member>>(new Map());
  const [baseLoading, setBaseLoading]   = useState(true);

  // Load products, members once (live data)
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*'),
      supabase.from('members').select('*').eq('active', true).order('name'),
    ]).then(([{ data: prods }, { data: mems }]) => {
      const CODE_ORDER = ['HOTEL', 'MENU', 'EVENT', 'ACCOUNT'];
      setProducts((prods ?? []).sort((a, b) => CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code)));

      const mems_ = sortMembers(mems ?? []);
      setMembers(mems_);
      const mm = new Map<string, Member>();
      mems_.forEach(m => mm.set(m.id, m));
      setMemberMap(mm);

      setBaseLoading(false);
    });
  }, []);

  // Re-fetch product stats whenever selected month changes
  useEffect(() => {
    setStatsLoading(true);
    const monthDate = selectedMonth + '-01';

    supabase
      .from('ticket_imports')
      .select('product_id, status')
      .eq('imported_month', monthDate)
      .then(({ data: tix }) => {
        const stats = new Map<string, ProductStats>();
        for (const row of (tix ?? []) as TicketRow[]) {
          if (!stats.has(row.product_id)) {
            stats.set(row.product_id, { open: 0, in_progress: 0, qc: 0, to_deploy: 0, deployed: 0, reopen: 0, total: 0 });
          }
          const s = stats.get(row.product_id)!;
          s.total++;
          if (row.status === 'OPEN')        s.open++;
          else if (row.status === 'IN_PROGRESS') s.in_progress++;
          else if (row.status === 'QC')     s.qc++;
          else if (row.status === 'TO_DEPLOY') s.to_deploy++;
          else if (row.status === 'DEPLOYED')  s.deployed++;
          else if (row.status === 'REOPEN') s.reopen++;
        }
        setProductStats(stats);
        setStatsLoading(false);
      });
  }, [selectedMonth]);

  const unresolved = useMemo(() => alerts.filter(a => !a.resolved), [alerts]);

  const totals = useMemo(() => {
    let active = 0, deployed = 0;
    for (const s of productStats.values()) {
      active += s.open + s.in_progress + s.qc + s.to_deploy + s.reopen;
      deployed += s.deployed;
    }
    return { active, deployed };
  }, [productStats]);

  const isCurrentMonth = selectedMonth === (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  if (baseLoading) {
    return <div style={{ padding: 32, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div style={pageStyle}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
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
              color: 'var(--text2)', display: 'flex',
              opacity: isCurrentMonth ? 0.3 : 1,
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* KPI strip — live data (today) */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiPill icon={<Activity size={18} />}  label={`Active tickets · ${fmtMonth(selectedMonth)}`} value={totals.active}     color="var(--blue)" />
        <KpiPill icon={<TrendingUp size={18} />} label={`Deployed · ${fmtMonth(selectedMonth)}`}       value={totals.deployed}   color="var(--green)" />
        <KpiPill icon={<Users size={18} />}      label="Active members"                                 value={members.length}    color="var(--accent)" />
        <KpiPill icon={<Bell size={18} />}       label="Open alerts"                                    value={unresolved.length} color={unresolved.length > 0 ? 'var(--red)' : 'var(--green)'} />
      </div>

      {/* Per-product snapshot */}
      <Section title={`Product snapshot · ${fmtMonth(selectedMonth)}`}>
        {statsLoading ? (
          <div style={{ fontSize: 13, color: 'var(--text3)', padding: '16px 0' }}>Loading…</div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}>
            {products.map(p => {
              const s = productStats.get(p.id);
              const stale = !p.last_imported_at || daysSince(p.last_imported_at) > 7;
              return (
                <Card key={p.id} style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
                    {stale && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                        background: 'var(--amber-dim)', color: 'var(--amber)',
                        border: '1px solid var(--amber)44', whiteSpace: 'nowrap',
                      }}>
                        Stale
                      </span>
                    )}
                  </div>

                  {s && s.total > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <StatusRow label="Open"       value={s.open}        color="var(--red)"    total={s.total} />
                      <StatusRow label="In Progress" value={s.in_progress} color="var(--blue)"   total={s.total} />
                      <StatusRow label="QC"          value={s.qc}          color="var(--purple)" total={s.total} />
                      <StatusRow label="To Deploy"   value={s.to_deploy}   color="var(--amber)"  total={s.total} />
                      <StatusRow label="Deployed"    value={s.deployed}    color="var(--green)"  total={s.total} />
                      {s.reopen > 0 && <StatusRow label="Reopen" value={s.reopen} color="var(--red)" total={s.total} />}
                      <div style={{
                        marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)',
                        fontSize: 12, color: 'var(--text3)', display: 'flex', justifyContent: 'space-between',
                      }}>
                        <span>Total</span>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{s.total}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '16px 0' }}>
                      No import data for {fmtMonth(selectedMonth)}
                    </div>
                  )}

                  {p.last_imported_at && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
                      Last imported {formatDate(p.last_imported_at)}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {/* Alerts + Team */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 300px',
        gap: 16, alignItems: 'start',
      }}>
        <Section title={`Alerts${unresolved.length > 0 ? ` (${unresolved.length})` : ''}`}>
          <Card style={{ padding: 12 }}>
            {unresolved.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--text3)', fontSize: 13 }}>
                All clear — no active alerts.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {unresolved.map(alert => (
                  <AlertBanner
                    key={alert.id}
                    alert={alert}
                    memberName={alert.member_id ? memberMap.get(alert.member_id)?.name : undefined}
                    onResolve={async (id) => {
                      await supabase.from('alerts').update({ resolved: true }).eq('id', id);
                    }}
                  />
                ))}
              </div>
            )}
          </Card>
        </Section>

        <Section title="Team">
          <Card style={{ padding: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
              {members.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 8px', borderRadius: 8,
                }}>
                  <Avatar name={m.name} color={m.avatar_color} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'capitalize' }}>
                      {m.role}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      </div>

    </div>
  );
}
