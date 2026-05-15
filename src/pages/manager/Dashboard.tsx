import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAlerts } from '../../hooks/useAlerts';
import { useIsMobile } from '../../hooks/useIsMobile';
import { usePageShellStyle } from '../../hooks/usePageShellStyle';
import { formatDate, sortMembers } from '../../lib/utils';
import MetricCard from '../../components/UI/MetricCard';
import AlertBanner from '../../components/UI/AlertBanner';
import ProductTabs from '../../components/UI/ProductTabs';
import PipelineFlow from '../../components/Charts/PipelineFlow';
import BarChart, { type BarChartMonth } from '../../components/Charts/BarChart';
import HeatmapGrid, { type HeatmapEntry } from '../../components/Charts/HeatmapGrid';
import type { Product, Member } from '../../types';

/* ── helpers ── */

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 0); // last day of month, local
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtMonth(ym: string): string {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
}

function daysSinceImport(iso: string | null | undefined): number {
  if (!iso) return 999;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 999;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
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

/* ── TicketRow type (local) ── */
interface TicketRow {
  status: string;
  priority: number;
  is_bug: boolean;
  is_enhancement: boolean;
  ticket_ref: string | null;
  description: string | null;
  customer_name: string | null;
  created_ts: string | null;
  primary_member_id: string | null;
}

type AgeBand = 'fresh' | 'watch' | 'overdue' | 'critical';

function ageBand(createdTs: string | null): AgeBand {
  if (!createdTs) return 'watch';
  const days = Math.floor((Date.now() - new Date(createdTs).getTime()) / 86_400_000);
  if (days < 7)  return 'fresh';
  if (days < 15) return 'watch';
  if (days < 30) return 'overdue';
  return 'critical';
}

function ageDays(createdTs: string | null): number {
  if (!createdTs) return 0;
  return Math.floor((Date.now() - new Date(createdTs).getTime()) / 86_400_000);
}

const AGE_BAND_COLOR: Record<AgeBand, string> = {
  fresh:    'var(--green)',
  watch:    'var(--amber)',
  overdue:  'var(--red)',
  critical: 'var(--red)',
};

const AGE_BAND_LABEL: Record<AgeBand, string> = {
  fresh:    '< 7 days',
  watch:    '7–14 days',
  overdue:  '15–30 days',
  critical: '30+ days',
};

/* ── Main component ── */
export default function ManagerDashboard() {
  const [products, setProducts]           = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]); // "YYYY-MM"
  const [monthIdx, setMonthIdx]           = useState(0); // index into availableMonths (0 = latest)
  const [tickets, setTickets]             = useState<TicketRow[]>([]);
  const [chartData, setChartData]         = useState<BarChartMonth[]>([]);
  const [members, setMembers]             = useState<Member[]>([]);
  const [standups, setStandups]           = useState<HeatmapEntry[]>([]);
  const [memberMap, setMemberMap]         = useState<Map<string, string>>(new Map());
  const [loading, setLoading]             = useState(true);

  const { alerts } = useAlerts();
  const isMobile = useIsMobile();
  const pageStyle = usePageShellStyle({ maxWidth: 1200, gap: 28 });
  const selectedMonth = availableMonths[monthIdx] ?? '';

  /* Load products + members once */
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*'),
      supabase.from('members').select('id, name, email, role, active, avatar_color, created_at')
        .eq('active', true)
        .in('role', ['owner', 'admin', 'member'])
        .order('name'),
    ]).then(([{ data: prods }, { data: mems }]) => {
      const CODE_ORDER = ['HOTEL', 'MENU', 'EVENT', 'ACCOUNT'];
      const sorted = (prods ?? []).sort(
        (a, b) => CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code),
      );
      setProducts(sorted);
      if (sorted.length > 0) setSelectedProduct(sorted[0].id);
      const mems_ = sortMembers(mems ?? []);
      setMembers(mems_);
      const mm = new Map<string, string>();
      mems_.forEach(m => mm.set(m.id, m.name));
      setMemberMap(mm);
    });
  }, []);

  /* Load available months when product changes */
  useEffect(() => {
    if (!selectedProduct) return;
    supabase
      .from('ticket_imports')
      .select('imported_month')
      .eq('product_id', selectedProduct)
      .then(({ data }) => {
        const months = [...new Set(
          (data ?? [])
            .map(r => r.imported_month)
            .filter((v): v is string => v != null && String(v).length >= 7)
            .map(v => String(v).slice(0, 7)),
        )]
          .sort()
          .reverse();
        setAvailableMonths(months);
        setMonthIdx(0);
      });
  }, [selectedProduct]);

  /* Load ticket + standup data when product/month changes */
  useEffect(() => {
    if (!selectedProduct || !selectedMonth) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const monthDate = selectedMonth + '-01';
    const startDate = monthDate;
    const endDate   = lastDayOfMonth(selectedMonth);

    Promise.all([
      // KPI + pipeline tickets for selected month
      supabase
        .from('ticket_imports')
        .select('status, priority, is_bug, is_enhancement, ticket_ref, description, customer_name, created_ts, primary_member_id')
        .eq('product_id', selectedProduct)
        .eq('imported_month', monthDate),

      // All imported months for bar chart
      supabase
        .from('ticket_imports')
        .select('imported_month, status')
        .eq('product_id', selectedProduct)
        .order('imported_month', { ascending: true }),

      // Standup logs for heatmap (just presence per member per day)
      supabase
        .from('standup_logs')
        .select('member_id, date')
        .gte('date', startDate)
        .lte('date', endDate),
    ]).then(([{ data: tix }, { data: allTix }, { data: slog }]) => {
      setTickets(tix ?? []);

      // Aggregate chart data by month
      const monthMap = new Map<string, { active: number; deployed: number }>();
      for (const t of allTix ?? []) {
        const raw = t.imported_month as string | null;
        if (raw == null || String(raw).length < 7) continue;
        const m = String(raw).slice(0, 7);
        if (!monthMap.has(m)) monthMap.set(m, { active: 0, deployed: 0 });
        const entry = monthMap.get(m)!;
        if (t.status === 'DEPLOYED') entry.deployed++;
        else entry.active++;
      }
      setChartData(
        Array.from(monthMap.entries())
          .map(([month, counts]) => ({ month, ...counts }))
          .sort((a, b) => a.month.localeCompare(b.month))
          .slice(-8),  // last 8 months max
      );

      setStandups(slog ?? []);
      setLoading(false);
    });
  }, [selectedProduct, selectedMonth]);

  /* KPI aggregation */
  const kpi = useMemo(() => ({
    open:        tickets.filter(t => t.status === 'OPEN').length,
    in_progress: tickets.filter(t => t.status === 'IN_PROGRESS').length,
    qc:          tickets.filter(t => t.status === 'QC').length,
    to_deploy:   tickets.filter(t => t.status === 'TO_DEPLOY').length,
    deployed:    tickets.filter(t => t.status === 'DEPLOYED').length,
    reopen:      tickets.filter(t => t.status === 'REOPEN').length,
    p1:          tickets.filter(t => t.priority === 1).length,
    bugs:        tickets.filter(t => t.is_bug).length,
    enhancements:tickets.filter(t => t.is_enhancement).length,
    total:       tickets.length,
  }), [tickets]);

  /* Resolve an alert */
  async function resolveAlert(id: string) {
    await supabase.from('alerts').update({ resolved: true }).eq('id', id);
  }

  const productName = products.find(p => p.id === selectedProduct)?.name ?? '';
  const selectedProductMeta = useMemo(
    () => products.find(p => p.id === selectedProduct),
    [products, selectedProduct],
  );
  const staleDays = daysSinceImport(selectedProductMeta?.last_imported_at ?? null);
  const importStale = !selectedProductMeta?.last_imported_at || staleDays > 7;
  const unresolved = alerts.filter(a => !a.resolved);

  if (loading && products.length === 0) {
    return (
      <div style={{
        padding: 'max(16px, env(safe-area-inset-top)) 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: 'var(--text3)',
        fontSize: 13,
      }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div style={pageStyle}>

      {selectedProduct && importStale && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 16px', borderRadius: 10,
          background: 'var(--amber-dim)', border: '1px solid var(--amber)44',
          fontSize: 13, color: 'var(--amber)',
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text)' }}>{productName || 'This product'}</strong>
            {' '}ticket data is{' '}
            {!selectedProductMeta?.last_imported_at
              ? 'missing a recorded import'
              : `${staleDays} days old (last imported ${formatDate(selectedProductMeta.last_imported_at)})`}
            .{' '}
            <Link
              to="/manager/import"
              style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline' }}
            >
              Import now to refresh
            </Link>
            .
          </div>
        </div>
      )}

      {/* ── Header: product tabs + month nav ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <ProductTabs products={products} selected={selectedProduct} onChange={id => { setSelectedProduct(id); }} />

        {availableMonths.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setMonthIdx(i => Math.min(i + 1, availableMonths.length - 1))}
              disabled={monthIdx >= availableMonths.length - 1}
              style={{
                background: 'none', border: '1px solid var(--border2)', borderRadius: 6,
                padding: '5px 8px', cursor: 'pointer', color: 'var(--text2)', display: 'flex',
                opacity: monthIdx >= availableMonths.length - 1 ? 0.4 : 1,
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 120, textAlign: 'center' }}>
              {fmtMonth(selectedMonth)}
            </span>
            <button
              onClick={() => setMonthIdx(i => Math.max(i - 1, 0))}
              disabled={monthIdx <= 0}
              style={{
                background: 'none', border: '1px solid var(--border2)', borderRadius: 6,
                padding: '5px 8px', cursor: 'pointer', color: 'var(--text2)', display: 'flex',
                opacity: monthIdx <= 0 ? 0.4 : 1,
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── No data state ── */}
      {!loading && availableMonths.length === 0 && (
        <Card style={{ textAlign: 'center', padding: '48px 32px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            No data for {productName}
          </div>
          <div style={{ fontSize: 13 }}>Import a CSV file to populate the dashboard.</div>
        </Card>
      )}

      {availableMonths.length > 0 && (
        <>
          {/* ── KPI Cards ── */}
          <Section title="Ticket snapshot">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <MetricCard label="Open"        value={kpi.open}        color="var(--red)" />
              <MetricCard label="In Progress" value={kpi.in_progress} color="var(--blue)" />
              <MetricCard label="QC"          value={kpi.qc}          color="var(--purple)" />
              <MetricCard label="Deployed"    value={kpi.deployed}    color="var(--green)" />
              <MetricCard label="P1 Tickets"  value={kpi.p1}          color="var(--red)" sub={`${kpi.bugs} bugs · ${kpi.enhancements} enh`} />
              <MetricCard label="Total"       value={kpi.total}       color="var(--accent)" />
            </div>
          </Section>

          {/* ── Ticket Age ── */}
          {(() => {
            const activeTickets = tickets.filter(t =>
              !['DEPLOYED', 'NO_ACTION'].includes(t.status) && t.created_ts,
            );
            const bands: Record<AgeBand, TicketRow[]> = {
              fresh: [], watch: [], overdue: [], critical: [],
            };
            for (const t of activeTickets) bands[ageBand(t.created_ts)].push(t);
            const criticalTickets = bands.critical
              .sort((a, b) => ageDays(b.created_ts) - ageDays(a.created_ts))
              .slice(0, 8);
            const total = activeTickets.length || 1;

            return (
              <Section title="Ticket age">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Age distribution bars */}
                  <Card>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(['fresh', 'watch', 'overdue', 'critical'] as AgeBand[]).map(band => {
                        const count = bands[band].length;
                        const pct   = Math.round((count / total) * 100);
                        const color = AGE_BAND_COLOR[band];
                        return (
                          <div key={band} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, color: 'var(--text2)', width: 80, flexShrink: 0 }}>
                              {AGE_BAND_LABEL[band]}
                            </span>
                            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  {/* Critical tickets list */}
                  {criticalTickets.length > 0 && (
                    <Card style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Critical — open 30+ days ({bands.critical.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {criticalTickets.map((t, i) => {
                          const assignee = t.primary_member_id ? memberMap.get(t.primary_member_id) : undefined;
                          const days = ageDays(t.created_ts);
                          return (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '9px 16px',
                              borderBottom: i < criticalTickets.length - 1 ? '1px solid var(--border)' : 'none',
                            }}>
                              <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', flexShrink: 0, minWidth: 70 }}>
                                {t.ticket_ref ?? '—'}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.customer_name ? `${t.customer_name} — ` : ''}{t.description ?? ''}
                              </span>
                              {assignee && (
                                <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>{assignee}</span>
                              )}
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', flexShrink: 0 }}>{days}d</span>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}
                </div>
              </Section>
            );
          })()}

          {/* ── Pipeline + Alerts row ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 320px',
            gap: 16,
            alignItems: 'start',
          }}
          >
            <Section title="Pipeline flow">
              <Card>
                <PipelineFlow
                  open={kpi.open}
                  in_progress={kpi.in_progress}
                  qc={kpi.qc}
                  to_deploy={kpi.to_deploy}
                  deployed={kpi.deployed}
                  reopen={kpi.reopen}
                />
              </Card>
            </Section>

            <Section title={`Alerts${unresolved.length > 0 ? ` (${unresolved.length})` : ''}`}>
              <Card style={{ padding: 12 }}>
                {unresolved.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--text3)', fontSize: 13 }}>
                    All clear — no active alerts.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                    {unresolved.map(alert => (
                      <AlertBanner
                        key={alert.id}
                        alert={alert}
                        memberName={alert.member_id ? memberMap.get(alert.member_id) : undefined}
                        onResolve={resolveAlert}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </Section>
          </div>

          {/* ── Monthly Trend Chart ── */}
          <Section title="Monthly delivery trend">
            <Card>
              <BarChart data={chartData} />
            </Card>
          </Section>

          {/* ── Team Workload Heatmap ── */}
          <Section title="Team standup heatmap">
            <Card>
              <HeatmapGrid
                members={members}
                entries={standups}
                month={selectedMonth}
              />
            </Card>
          </Section>
        </>
      )}
    </div>
  );
}
