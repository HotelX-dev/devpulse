import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, ChevronRight, ChevronLeft, Check, AlertTriangle, X, RefreshCw, Database } from 'lucide-react';
import { usePageShellStyle } from '../../hooks/usePageShellStyle';
import { supabase } from '../../lib/supabase';
import { parseCSV, workbookBytesToCsv, type ParsedTicket } from '../../lib/csvParser';
import Badge from '../../components/UI/Badge';
import type { ImportType, Product } from '../../types';

type Step = 1 | 2 | 3;

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface MemberInfo {
  id: string;
  name: string;
  avatar_color: string;
}

/* ── helpers ── */
function monthToDate(ym: string): string {
  // "2026-05" → "2026-05-01"
  return ym + '-01';
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/* ── sub-components ── */

function Stepper({ step }: { step: Step }) {
  const steps = ['Setup', 'Upload', 'Preview'];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28,
      overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch', paddingBottom: 4,
    }}
    >
      {steps.map((label, i) => {
        const n = (i + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                background: done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--bg4)',
                color: done || active ? '#fff' : 'var(--text3)',
                transition: 'all 0.2s',
                flexShrink: 0,
              }}>
                {done ? <Check size={13} /> : n}
              </div>
              <span style={{
                fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : done ? 'var(--text2)' : 'var(--text3)',
              }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 40, height: 1, background: 'var(--border2)', margin: '0 12px' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 24, ...style,
    }}>
      {children}
    </div>
  );
}

function Btn({
  onClick, disabled, variant = 'primary', children, icon,
}: {
  onClick?: () => void; disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  children: React.ReactNode; icon?: React.ReactNode;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#fff', border: 'none' },
    ghost:   { background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border2)' },
    danger:  { background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)33' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '9px 18px', borderRadius: 8,
        fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s',
        fontFamily: 'var(--font-sans)',
        ...styles[variant],
      }}
    >
      {icon}{children}
    </button>
  );
}

/* ── Step 1: product + import type + month + optional date filter ── */
function StepSetup({
  products, productId, setProductId,
  importType, setImportType,
  month, setMonth,
  dateFrom, setDateFrom, dateTo, setDateTo, onNext,
}: {
  products: Product[]; productId: string; setProductId: (v: string) => void;
  importType: ImportType; setImportType: (v: ImportType) => void;
  month: string; setMonth: (v: string) => void;
  dateFrom: string; setDateFrom: (v: string) => void;
  dateTo: string; setDateTo: (v: string) => void;
  onNext: () => void;
}) {
  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid var(--border2)', background: 'var(--bg3)',
    color: 'var(--text)', fontSize: 14, outline: 'none',
    fontFamily: 'var(--font-sans)', cursor: 'pointer', colorScheme: 'dark',
  };

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
            Product
          </label>
          <select value={productId} onChange={e => setProductId(e.target.value)} style={fieldStyle}>
            <option value="">Select product…</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
            Import type
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              { id: 'weekly_refresh' as const, title: 'Weekly refresh', sub: 'Operational ticket data only. No monthly snapshot or forecast run.' },
              { id: 'monthly_close' as const, title: 'Monthly close', sub: 'Same as weekly, plus compute monthly snapshot and rolling forecast for the selected month.' },
            ]).map(opt => (
              <label
                key={opt.id}
                style={{
                  display: 'flex', gap: 12, padding: 12, borderRadius: 8, cursor: 'pointer',
                  border: importType === opt.id ? '1px solid var(--accent)' : '1px solid var(--border2)',
                  background: importType === opt.id ? 'var(--accent-dim)' : 'var(--bg3)',
                }}
              >
                <input
                  type="radio"
                  name="importType"
                  checked={importType === opt.id}
                  onChange={() => {
                    setImportType(opt.id);
                    if (opt.id === 'weekly_refresh') setMonth(currentYearMonth());
                  }}
                  style={{ marginTop: 3, accentColor: 'var(--accent)' }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{opt.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, lineHeight: 1.45 }}>{opt.sub}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
            {importType === 'monthly_close' ? 'Close month' : 'Reporting month'}
          </label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            style={fieldStyle}
          />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
            {importType === 'monthly_close'
              ? 'Must match the month you are closing for management reporting.'
              : 'Tickets for this product replace existing rows for this month on the dashboard.'}
          </div>
        </div>

        {/* Date range filter */}
        <div style={{
          borderTop: '1px solid var(--border)', paddingTop: 20,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                Filter by created date
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                Only rows with <em>createdTs</em> within this range will be imported. Leave blank to import all.
              </div>
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                style={{
                  fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none',
                  cursor: 'pointer', textDecoration: 'underline', flexShrink: 0,
                }}
              >
                Clear
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                style={fieldStyle}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn onClick={onNext} disabled={!productId || !month} icon={<ChevronRight size={15} />}>
            Next
          </Btn>
        </div>
      </div>
    </Card>
  );
}

/* ── Step 2: file upload ── */
function StepUpload({
  onFile, onBack,
}: {
  onFile: (f: File) => void; onBack: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  return (
    <Card>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border2)'}`,
          borderRadius: 10, padding: '56px 32px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
          background: dragging ? 'var(--accent-dim)' : 'transparent',
          textAlign: 'center',
        }}
      >
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Upload size={22} color="var(--accent)" />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Drop CSV or Excel here</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>or click to browse</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Accepts .csv, .xlsx, or .xls exports from the ticket system
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-start' }}>
        <Btn onClick={onBack} variant="ghost" icon={<ChevronLeft size={15} />}>Back</Btn>
      </div>
    </Card>
  );
}

/* ── Step 3: preview + confirm ── */
function StepPreview({
  rows, totalParsed, members, productName, month, existingCount,
  importing, importType, onConfirm, onBack,
}: {
  rows: ParsedTicket[]; totalParsed: number; members: Map<string, MemberInfo>;
  productName: string; month: string; existingCount: number;
  importing: boolean; importType: ImportType;
  onConfirm: () => void; onBack: () => void;
}) {
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sortedRows = [...rows].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'Ticket':   return dir * a.ticket_ref.localeCompare(b.ticket_ref);
      case 'Status':   return dir * a.status.localeCompare(b.status);
      case 'P':        return dir * (a.priority - b.priority);
      case 'Type': {
        const ta = a.is_bug ? 'Bug' : a.is_enhancement ? 'Enh' : '—';
        const tb = b.is_bug ? 'Bug' : b.is_enhancement ? 'Enh' : '—';
        return dir * ta.localeCompare(tb);
      }
      case 'Assignee': {
        const na = (a.primary_member_id ? members.get(a.primary_member_id)?.name : a.raw_assignee) ?? '';
        const nb = (b.primary_member_id ? members.get(b.primary_member_id)?.name : b.raw_assignee) ?? '';
        return dir * na.localeCompare(nb);
      }
      case 'Expected': {
        const da = a.expected_date ?? '';
        const db = b.expected_date ?? '';
        return dir * da.localeCompare(db);
      }
      default: return 0;
    }
  });

  const matched   = rows.filter(r => r.assignee_matched).length;
  const unmatched = rows.length - matched;
  const filtered  = totalParsed - rows.length;

  const statusBreakdown: Record<string, number> = {};
  for (const r of rows) {
    statusBreakdown[r.status] = (statusBreakdown[r.status] ?? 0) + 1;
  }
  const statusOrder = ['OPEN', 'IN_PROGRESS', 'QC', 'TO_DEPLOY', 'NO_ACTION', 'DEPLOYED', 'REOPEN'] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Date filter info */}
      {filtered > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 8, fontSize: 12,
          background: 'var(--accent-dim)', border: '1px solid var(--accent)33',
          color: 'var(--accent)',
        }}>
          <span style={{ fontWeight: 600 }}>{rows.length.toLocaleString()}</span> of{' '}
          <span style={{ fontWeight: 600 }}>{totalParsed.toLocaleString()}</span> rows shown after date filter
          ({filtered.toLocaleString()} excluded).
        </div>
      )}

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Rows to import', value: rows.length, color: 'var(--accent)' },
          { label: 'Assignees matched', value: matched, color: 'var(--green)' },
          { label: 'Unmatched', value: unmatched, color: unmatched > 0 ? 'var(--amber)' : 'var(--text3)' },
        ].map(s => (
          <Card key={s.label} style={{ flex: 1, minWidth: 120, padding: '14px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Status breakdown */}
      <Card style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Status breakdown</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {statusOrder.map(st => {
            const n = statusBreakdown[st] ?? 0;
            if (n === 0) return null;
            return (
              <div
                key={st}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 8, background: 'var(--bg3)',
                  border: '1px solid var(--border)', fontSize: 12,
                }}
              >
                <Badge status={st} size="sm" />
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{n}</span>
              </div>
            );
          })}
          {Object.entries(statusBreakdown)
            .filter(([st]) => !statusOrder.includes(st as (typeof statusOrder)[number]))
            .map(([st, n]) => (
              <div
                key={st}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 8, background: 'var(--bg3)',
                  border: '1px solid var(--border)', fontSize: 12,
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{st}</span>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{n}</span>
              </div>
            ))}
        </div>
      </Card>

      {/* Replace warning */}
      {existingCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--amber-dim)', border: '1px solid var(--amber)44',
          fontSize: 13, color: 'var(--amber)',
        }}>
          <AlertTriangle size={15} />
          {existingCount} existing records for {productName} {month} will be replaced.
        </div>
      )}

      {/* Preview table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 440, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)', position: 'sticky', top: 0, zIndex: 1 }}>
                {['Ticket', 'Module', 'Status', 'P', 'Type', 'Assignee', 'Expected'].map(h => {
                  const sortable = h !== 'Module';
                  const active = sortKey === h;
                  return (
                    <th
                      key={h}
                      onClick={sortable ? () => toggleSort(h) : undefined}
                      style={{
                        padding: '9px 12px', textAlign: 'left',
                        fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text2)',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        cursor: sortable ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                    >
                      {h}
                      {sortable && (
                        <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10 }}>
                          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => {
                const memberInfo = row.primary_member_id ? members.get(row.primary_member_id) : null;
                return (
                  <tr key={i} style={{
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'transparent' : 'var(--bg3)11',
                  }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                      {row.ticket_ref}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.module_name || '—'}
                    </td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      <Badge status={row.status} size="sm" />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: row.priority === 1 ? 'var(--red-dim)' : 'var(--blue-dim)',
                        color: row.priority === 1 ? 'var(--red)' : 'var(--blue)',
                      }}>
                        P{row.priority}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      {row.is_bug && <span style={{ color: 'var(--red)', fontSize: 11, fontWeight: 500 }}>Bug </span>}
                      {row.is_enhancement && <span style={{ color: 'var(--blue)', fontSize: 11, fontWeight: 500 }}>Enh </span>}
                      {!row.is_bug && !row.is_enhancement && <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      {memberInfo ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 11, fontWeight: 500, color: 'var(--green)',
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: memberInfo.avatar_color, flexShrink: 0 }} />
                          {memberInfo.name}
                        </span>
                      ) : row.raw_assignee ? (
                        <span style={{ fontSize: 11, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={11} />
                          {row.raw_assignee.length > 22 ? row.raw_assignee.slice(0, 22) + '…' : row.raw_assignee}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)', fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {row.expected_date ? new Date(row.expected_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Btn onClick={onBack} variant="ghost" disabled={importing} icon={<ChevronLeft size={15} />}>
          Back
        </Btn>
        <Btn
          onClick={onConfirm}
          disabled={importing || rows.length === 0}
          icon={importing ? undefined : <Check size={15} />}
        >
          {importing
            ? 'Importing…'
            : importType === 'monthly_close'
              ? `Import ${rows.length} tickets + compute snapshot`
              : `Import ${rows.length} tickets`}
        </Btn>
      </div>
    </div>
  );
}

/* ── Success screen ── */
function SuccessScreen({ count, productName, month, snapshotWarning, onReset }: {
  count: number; productName: string; month: string; snapshotWarning?: string;
  onReset: () => void;
}) {
  return (
    <Card style={{ textAlign: 'center', padding: '48px 32px' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'var(--green-dim)', border: '2px solid var(--green)44',
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
      }}>
        <Check size={24} color="var(--green)" />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
        Import complete
      </div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>
        {count} tickets imported for <strong style={{ color: 'var(--text)' }}>{productName}</strong> — {month}
      </div>
      {snapshotWarning && (
        <div style={{
          textAlign: 'left', marginBottom: 20, padding: '10px 14px', borderRadius: 8,
          background: 'var(--amber-dim)', border: '1px solid var(--amber)44', fontSize: 13, color: 'var(--amber)',
        }}>
          <strong>Snapshot</strong> — {snapshotWarning}
        </div>
      )}
      <Btn onClick={onReset}>Import another file</Btn>
    </Card>
  );
}

/* ── Resync-from-database panel ── */
interface ResyncProductResult {
  product_id: string;
  inserted?: number;
  matched?: number;
  unmatched?: number;
  error?: string;
}
interface ResyncResponse {
  ok?: boolean;
  error?: string;
  month_range?: { from: string; to: string } | null;
  months_spanned?: number;
  total_source_rows?: number;
  products_synced?: number;
  results?: ResyncProductResult[];
  skipped_no_ref?: number;
  skipped_unknown_codes?: Record<string, number>;
}

function ResyncCard() {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ResyncResponse | null>(null);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    setResult(null);
    setConfirming(false);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<ResyncResponse>('resync-tickets');
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      setResult(data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resync failed.');
    } finally {
      setBusy(false);
    }
  }

  const totalInserted = (result?.results ?? []).reduce((s, r) => s + (r.inserted ?? 0), 0);
  const unknownCodes = Object.entries(result?.skipped_unknown_codes ?? {});

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Database size={20} color="var(--accent)" />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
            Resync from source database
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>
            Pulls the full ticket log directly from the source DB and <strong style={{ color: 'var(--text2)' }}>replaces</strong> each
            product's existing tickets. No file needed. Each ticket is filed under its own created-month.
          </div>
        </div>
        {!confirming ? (
          <Btn onClick={() => setConfirming(true)} disabled={busy} icon={<RefreshCw size={15} />}>
            Resync now
          </Btn>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Btn onClick={() => setConfirming(false)} variant="ghost" disabled={busy}>Cancel</Btn>
            <Btn onClick={run} variant="danger" disabled={busy} icon={busy ? undefined : <Check size={15} />}>
              {busy ? 'Syncing…' : 'Confirm replace'}
            </Btn>
          </div>
        )}
      </div>

      {confirming && !busy && (
        <div style={{
          marginTop: 14, display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--amber-dim)', border: '1px solid var(--amber)44',
          fontSize: 13, color: 'var(--amber)',
        }}>
          <AlertTriangle size={15} />
          This deletes and rebuilds every product's tickets from the source view. This cannot be undone.
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--red-dim)', border: '1px solid var(--red)33',
          fontSize: 13, color: 'var(--red)',
        }}>
          <X size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {result?.ok && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 8,
            background: 'var(--green-dim)', border: '1px solid var(--green)44',
            fontSize: 13, color: 'var(--green)',
          }}>
            <Check size={15} />
            Synced {totalInserted.toLocaleString()} tickets across {result.products_synced} product(s)
            from {result.total_source_rows?.toLocaleString()} source rows
            {result.month_range
              ? ` — spanning ${result.month_range.from} → ${result.month_range.to} (${result.months_spanned} months)`
              : ''}.
          </div>

          {(result.results ?? []).some(r => r.error) && (
            <div style={{ fontSize: 12, color: 'var(--red)' }}>
              {(result.results ?? []).filter(r => r.error).map(r => (
                <div key={r.product_id}>⚠ {r.product_id}: {r.error}</div>
              ))}
            </div>
          )}

          {(unknownCodes.length > 0 || (result.skipped_no_ref ?? 0) > 0) && (
            <div style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 12,
              background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)',
            }}>
              {unknownCodes.length > 0 && (
                <div>
                  Skipped unknown product codes:{' '}
                  {unknownCodes.map(([code, n]) => `${code || '(blank)'} (${n})`).join(', ')}
                  {' '}— add these to the products table to include them.
                </div>
              )}
              {(result.skipped_no_ref ?? 0) > 0 && (
                <div style={{ marginTop: unknownCodes.length ? 4 : 0 }}>
                  Skipped {result.skipped_no_ref} row(s) with no ticket reference.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── Main component ── */
export default function Import() {
  const [step, setStep]               = useState<Step>(1);
  const [products, setProducts]       = useState<Product[]>([]);
  const [productId, setProductId]     = useState('');
  const [importType, setImportType]   = useState<ImportType>('weekly_refresh');
  const [month, setMonth]             = useState(() => currentYearMonth());
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [rows, setRows]               = useState<ParsedTicket[]>([]);
  const [totalParsed, setTotalParsed] = useState(0);
  const [members, setMembers]         = useState<Map<string, MemberInfo>>(new Map());
  const [memberMap, setMemberMap]         = useState<Map<string, string>>(new Map());
  const [memberNameMap, setMemberNameMap] = useState<Map<string, string>>(new Map());
  const [existingCount, setExisting]  = useState(0);
  const [importing, setImporting]     = useState(false);
  const [done, setDone]               = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [error, setError]             = useState('');
  const [snapshotWarning, setSnapshotWarning] = useState('');

  const productName = products.find(p => p.id === productId)?.name ?? '';
  const pageStyle = usePageShellStyle({ maxWidth: 960, gap: 24, paddingDesktop: '32px' });

  /* Load products + member_ticket_map + members on mount */
  useEffect(() => {
    async function load() {
      const [{ data: prods }, { data: mapRows }, { data: memberRows }] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('member_ticket_map').select('raw_name, member_id'),
        supabase.from('members').select('id, name, avatar_color').eq('active', true),
      ]);

      setProducts(prods ?? []);

      const mm = new Map<string, string>();
      (mapRows ?? []).forEach(r => { if (r.member_id) mm.set(r.raw_name, r.member_id); });
      setMemberMap(mm);

      const mi = new Map<string, MemberInfo>();
      (memberRows ?? []).forEach(r => mi.set(r.id, { id: r.id, name: r.name, avatar_color: r.avatar_color }));
      setMembers(mi);

      // Build member name map for fallback lookup (name → id, case-insensitive)
      const mn = new Map<string, string>();
      (memberRows ?? []).forEach(r => mn.set(r.name.toLowerCase(), r.id));
      setMemberNameMap(mn);
    }
    load();
  }, []);

  async function handleFile(file: File) {
    setError('');
    try {
      const lower = file.name.toLowerCase();
      let text: string;
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const buf = await file.arrayBuffer();
        text = workbookBytesToCsv(buf);
      } else {
        text = await file.text();
      }

      if (!text.trim()) {
        setError('Could not read any data from this file.');
        return;
      }

      const parsed = parseCSV(text, memberMap, memberNameMap);
      if (parsed.length === 0) {
        setError('No valid ticket rows found. Check that the file uses the expected column headers.');
        return;
      }

      setTotalParsed(parsed.length);

      // Apply created-date range filter
      const fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
      const toMs   = dateTo   ? new Date(dateTo + 'T23:59:59.999Z').getTime() : null;

      const filtered = (fromMs || toMs)
        ? parsed.filter(r => {
            if (!r.created_ts) return true; // no date → always include
            const ts = new Date(r.created_ts).getTime();
            if (fromMs && ts < fromMs) return false;
            if (toMs   && ts > toMs)   return false;
            return true;
          })
        : parsed;

      if (filtered.length === 0) {
        setError(`No rows fall within the selected date range (${dateFrom || '…'} → ${dateTo || '…'}). Try widening the range.`);
        return;
      }

      setRows(filtered);

      // Check for existing records for this product+month
      const { count } = await supabase
        .from('ticket_imports')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
        .eq('imported_month', monthToDate(month));
      setExisting(count ?? 0);

      setStep(3);
    } catch (err) {
      setError('Failed to parse file. Use a UTF-8 CSV or a valid Excel export.');
      console.error(err);
    }
  }

  async function handleConfirm() {
    setImporting(true);
    setError('');
    setSnapshotWarning('');
    try {
      const importedMonth = monthToDate(month);
      const matchedCount = rows.filter(r => r.assignee_matched).length;
      const unmatchedCount = rows.length - matchedCount;

      // Replace strategy: delete existing, then insert
      if (existingCount > 0) {
        await supabase
          .from('ticket_imports')
          .delete()
          .eq('product_id', productId)
          .eq('imported_month', importedMonth);
      }

      const records = rows.map(r => ({
        product_id:          productId,
        ticket_ref:          r.ticket_ref,
        customer_name:       r.customer_name,
        module_name:         r.module_name,
        description:         r.description,
        is_bug:              r.is_bug,
        is_enhancement:      r.is_enhancement,
        priority:            r.priority,
        status:              r.status,
        is_deployed:         r.is_deployed,
        raw_assignee:        r.raw_assignee,
        primary_member_id:   r.primary_member_id,
        secondary_assignees: [],
        created_ts:          r.created_ts,
        mod_ts:              r.mod_ts,
        expected_date:       r.expected_date,
        target_date:         r.target_date,
        imported_month:      importedMonth,
      }));

      for (const chunk of chunkArray(records, 500)) {
        const { error: err } = await supabase.from('ticket_imports').insert(chunk);
        if (err) throw new Error(err.message);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const importedBy = session?.user?.id ?? null;

      const { error: logErr } = await supabase.from('import_log').insert({
        product_id:       productId,
        import_type:      importType,
        imported_month:   importType === 'monthly_close' ? importedMonth : null,
        row_count:        rows.length,
        matched_count:    matchedCount,
        unmatched_count:  unmatchedCount,
        imported_by:      importedBy,
      });
      if (logErr) console.warn('import_log insert:', logErr.message);

      const { error: prodErr } = await supabase.from('products').update({
        last_imported_at: new Date().toISOString(),
        last_import_type: importType,
      }).eq('id', productId);
      if (prodErr) console.warn('products staleness update:', prodErr.message);

      let snapWarn = '';
      if (importType === 'monthly_close') {
        const { data: snapData, error: fnErr } = await supabase.functions.invoke(
          'monthly-snapshot-compute',
          { body: { product_id: productId, month: importedMonth } },
        );
        if (fnErr) snapWarn = fnErr.message;
        else if (snapData && typeof snapData === 'object' && 'ok' in snapData && !(snapData as { ok: boolean }).ok) {
          snapWarn = (snapData as { error?: string }).error ?? 'Snapshot computation failed.';
        }
      }
      setSnapshotWarning(snapWarn);

      setImportedCount(rows.length);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setStep(1);
    setProductId('');
    setImportType('weekly_refresh');
    setMonth(currentYearMonth());
    setDateFrom('');
    setDateTo('');
    setRows([]);
    setTotalParsed(0);
    setExisting(0);
    setDone(false);
    setImportedCount(0);
    setError('');
    setSnapshotWarning('');
  }

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Import tickets</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
          Resync directly from the source database, or upload a CSV/Excel export and preview before confirming.
        </p>
      </div>

      {!done && <ResyncCard />}

      {!done && <Stepper step={step} />}

      {error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16,
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--red-dim)', border: '1px solid var(--red)33',
          fontSize: 13, color: 'var(--red)',
        }}>
          <X size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {done ? (
        <SuccessScreen
          count={importedCount}
          productName={productName}
          month={month}
          snapshotWarning={snapshotWarning || undefined}
          onReset={handleReset}
        />
      ) : step === 1 ? (
        <StepSetup
          products={products}
          productId={productId}
          setProductId={setProductId}
          importType={importType}
          setImportType={setImportType}
          month={month}
          setMonth={setMonth}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          onNext={() => setStep(2)}
        />
      ) : step === 2 ? (
        <StepUpload
          onFile={handleFile}
          onBack={() => setStep(1)}
        />
      ) : (
        <StepPreview
          rows={rows}
          totalParsed={totalParsed}
          members={members}
          productName={productName}
          month={month}
          existingCount={existingCount}
          importing={importing}
          importType={importType}
          onConfirm={handleConfirm}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
}
