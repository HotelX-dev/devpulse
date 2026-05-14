import { useEffect, useRef, useState } from 'react';
import { Check, Edit2, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { usePageShellStyle } from '../../hooks/usePageShellStyle';
import type { Product } from '../../types';

/* ── constants ── */
const CODE_ORDER = ['HOTEL', 'MENU', 'EVENT', 'ACCOUNT'];
const TASK_TYPES = ['Ticket', 'Adhoc', 'Migration', 'Bug fix', 'Performance', 'Other'] as const;
type TType = typeof TASK_TYPES[number];

/* ── task entry shape ── */
interface TaskEntry {
  type: TType;
  ticket_ref: string;   // empty unless type === 'Ticket'
  desc: string;
}

function emptyTask(type: TType = 'Ticket'): TaskEntry {
  return { type, ticket_ref: '', desc: '' };
}

function serializeTasks(tasks: TaskEntry[]): string | null {
  const valid = tasks.filter(t => t.desc.trim());
  return valid.length > 0 ? JSON.stringify(valid) : null;
}

function parseTasks(raw: string | null | undefined): TaskEntry[] {
  if (!raw) return [emptyTask()];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch {
    // legacy plain text → wrap as single entry
    return [{ type: 'Other', ticket_ref: '', desc: raw }];
  }
  return [emptyTask()];
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ── styles ── */
const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 7,
  border: '1px solid var(--border2)', background: 'var(--bg3)',
  color: 'var(--text)', fontSize: 13, outline: 'none',
  fontFamily: 'var(--font-sans)',
};

/* ── TaskRow ── */
interface TaskRowProps {
  task: TaskEntry;
  onChange: (patch: Partial<TaskEntry>) => void;
  onRemove: () => void;
  canRemove: boolean;
  productId: string;
}

function TaskRow({ task, onChange, onRemove, canRemove, productId }: TaskRowProps) {
  const [hint, setHint] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTicketRef(val: string) {
    const upper = val.toUpperCase();
    onChange({ ticket_ref: upper });
    setHint('');

    if (debounce.current) clearTimeout(debounce.current);
    if (upper.match(/^[A-Z]{2,5}-\d+$/)) {
      debounce.current = setTimeout(async () => {
        const query = supabase
          .from('ticket_imports')
          .select('description, module_name, status')
          .eq('ticket_ref', upper);
        if (productId) query.eq('product_id', productId);
        const { data } = await query.order('imported_at', { ascending: false }).limit(1).maybeSingle();
        if (data) {
          const label = data.description || data.module_name || '';
          setHint(label);
          if (!task.desc.trim()) onChange({ desc: label });
        } else {
          setHint('Ticket not found in imports');
        }
      }, 400);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Type */}
        <select
          value={task.type}
          onChange={e => {
            const t = e.target.value as TType;
            onChange({ type: t, ticket_ref: t !== 'Ticket' ? '' : task.ticket_ref });
            setHint('');
          }}
          style={{
            ...inputStyle, cursor: 'pointer', colorScheme: 'dark',
            width: 120, flexShrink: 0,
          }}
        >
          {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Ticket ref — only for Ticket type */}
        {task.type === 'Ticket' && (
          <input
            value={task.ticket_ref}
            onChange={e => handleTicketRef(e.target.value)}
            placeholder="HX-1234"
            style={{
              ...inputStyle,
              width: 100, flexShrink: 0,
              fontFamily: 'var(--font-mono)', fontSize: 12,
              borderColor: hint === 'Ticket not found in imports' ? 'var(--amber)' : 'var(--border2)',
            }}
          />
        )}

        {/* Description */}
        <input
          value={task.desc}
          onChange={e => onChange({ desc: e.target.value })}
          placeholder={task.type === 'Ticket' ? 'What was done on this ticket…' : 'Describe the task…'}
          style={{ ...inputStyle, flex: 1 }}
        />

        {/* Remove */}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', display: 'flex', padding: 4, borderRadius: 4, flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Ticket hint */}
      {hint && task.type === 'Ticket' && (
        <div style={{
          marginLeft: 126, fontSize: 11,
          color: hint === 'Ticket not found in imports' ? 'var(--amber)' : 'var(--green)',
          fontStyle: hint === 'Ticket not found in imports' ? 'normal' : 'italic',
        }}>
          {hint === 'Ticket not found in imports' ? '⚠ ' : '✓ '}{hint}
        </div>
      )}
    </div>
  );
}

/* ── TaskList ── */
function TaskList({
  label, tasks, onChange, productId, required,
}: {
  label: string;
  tasks: TaskEntry[];
  onChange: (tasks: TaskEntry[]) => void;
  productId: string;
  required?: boolean;
}) {
  function update(i: number, patch: Partial<TaskEntry>) {
    onChange(tasks.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  }
  function remove(i: number) {
    onChange(tasks.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...tasks, emptyTask()]);
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 8 }}>
        {label}
        {required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
      </div>
      <div style={{
        background: 'var(--bg3)', border: '1px solid var(--border2)',
        borderRadius: 9, padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {tasks.map((task, i) => (
          <TaskRow
            key={i}
            task={task}
            onChange={patch => update(i, patch)}
            onRemove={() => remove(i)}
            canRemove={tasks.length > 1}
            productId={productId}
          />
        ))}
        <button
          type="button"
          onClick={add}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent)', fontSize: 12, fontWeight: 600,
            padding: '2px 0', fontFamily: 'var(--font-sans)',
            alignSelf: 'flex-start',
          }}
        >
          <Plus size={13} /> Add task
        </button>
      </div>
    </div>
  );
}

/* ── read-only task display ── */
function TaskDisplay({ raw }: { raw: string | null }) {
  const tasks = parseTasks(raw);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tasks.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3,
            background: 'var(--bg4)', color: 'var(--text3)', flexShrink: 0, marginTop: 2,
          }}>
            {t.type}
          </span>
          {t.ticket_ref && (
            <span style={{
              fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
              background: 'var(--accent-dim)', borderRadius: 3, padding: '2px 7px',
              flexShrink: 0, marginTop: 1,
            }}>
              {t.ticket_ref}
            </span>
          )}
          <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{t.desc}</span>
        </div>
      ))}
    </div>
  );
}

/* ── LogEntry ── */
interface LogEntry {
  id: string;
  product_id: string | null;
  date: string;
  yesterday: string | null;
  today: string | null;
  blockers: string | null;
  ticket_ref: string | null;
}

/* ── Main component ── */
export default function MemberStandup() {
  const { member } = useAuth();
  const today = localToday();
  const pageStyle = usePageShellStyle({ maxWidth: 760, gap: 24 });

  const [products, setProducts] = useState<Product[]>([]);
  const [existing, setExisting] = useState<LogEntry | null>(null);
  const [history, setHistory]   = useState<LogEntry[]>([]);
  const [editing, setEditing]   = useState(false);
  const [loading, setLoading]   = useState(true);

  const [productId, setProductId]       = useState('');
  const [yesterdayTasks, setYesterday]  = useState<TaskEntry[]>([emptyTask()]);
  const [todayTasks, setToday]          = useState<TaskEntry[]>([emptyTask()]);
  const [blockers, setBlockers]         = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');

  function fillForm(log: LogEntry) {
    setProductId(log.product_id ?? '');
    setYesterday(parseTasks(log.yesterday));
    setToday(parseTasks(log.today));
    setBlockers(log.blockers ?? '');
  }

  useEffect(() => {
    if (!member) return;
    Promise.all([
      supabase.from('products').select('*'),
      supabase.from('standup_logs')
        .select('id, product_id, date, yesterday, today, blockers, ticket_ref')
        .eq('member_id', member.id).eq('date', today).maybeSingle(),
      supabase.from('standup_logs')
        .select('id, product_id, date, yesterday, today, blockers, ticket_ref')
        .eq('member_id', member.id)
        .order('date', { ascending: false }).limit(11),
    ]).then(([{ data: prods }, { data: todayLog }, { data: hist }]) => {
      const sorted = (prods ?? []).sort((a, b) => CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code));
      setProducts(sorted);

      if (todayLog) {
        setExisting(todayLog);
        fillForm(todayLog);
      } else if (sorted.length > 0) {
        setProductId(sorted[0].id);
      }

      setHistory((hist ?? []).filter(h => h.date !== today).slice(0, 7));
      setLoading(false);
    });
  }, [member]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    const todaySerialized = serializeTasks(todayTasks);
    if (!todaySerialized) { setError('Please add at least one task for today.'); return; }

    setSaving(true); setError('');

    // First ticket ref found across today + yesterday (for auto-link trigger)
    const allRefs = [...todayTasks, ...yesterdayTasks]
      .map(t => t.ticket_ref)
      .filter(Boolean);
    const primaryRef = allRefs[0] || null;

    // Primary task type (first today task)
    const primaryType = todayTasks[0]?.type ?? 'Other';

    const { error: err } = await supabase.from('standup_logs').upsert({
      member_id:  member.id,
      product_id: productId || null,
      date:       today,
      task_type:  primaryType,
      yesterday:  serializeTasks(yesterdayTasks),
      today:      todaySerialized,
      blockers:   blockers.trim() || null,
      ticket_ref: primaryRef,
    }, { onConflict: 'member_id,date' });

    setSaving(false);
    if (err) { setError(err.message); return; }

    const updated: LogEntry = {
      id: existing?.id ?? '',
      product_id: productId || null,
      date: today,
      yesterday: serializeTasks(yesterdayTasks),
      today: todaySerialized,
      blockers: blockers.trim() || null,
      ticket_ref: primaryRef,
    };
    setExisting(updated);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const showForm = !existing || editing;

  if (loading) return <div style={{ padding: 32, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;

  return (
    <div style={pageStyle}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Daily Standup</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
            {new Date(today + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        {existing && !editing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
              borderRadius: 99, background: 'var(--green-dim)', border: '1px solid var(--green)33',
              fontSize: 12, fontWeight: 600, color: 'var(--green)',
            }}>
              <Check size={13} /> Submitted
            </div>
            <button onClick={() => setEditing(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 99, border: '1px solid var(--border2)',
              background: 'transparent', color: 'var(--text2)', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              <Edit2 size={12} /> Edit
            </button>
          </div>
        )}
      </div>

      {saved && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          borderRadius: 8, background: 'var(--green-dim)', border: '1px solid var(--green)33',
          fontSize: 13, color: 'var(--green)', fontWeight: 500,
        }}>
          <Check size={14} /> Standup {existing ? 'updated' : 'submitted'} — have a productive day!
        </div>
      )}

      {/* Read-only view */}
      {existing && !editing && (
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 18,
        }}>
          {[
            { label: 'Yesterday', raw: existing.yesterday },
            { label: 'Today',     raw: existing.today },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {f.label}
              </div>
              <TaskDisplay raw={f.raw} />
            </div>
          ))}
          {existing.blockers && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                Blockers
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{existing.blockers}</div>
            </div>
          )}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          {/* Product */}
          <div style={{ maxWidth: 220 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>Product</div>
            <select value={productId} onChange={e => setProductId(e.target.value)}
              style={{ ...inputStyle, width: '100%', cursor: 'pointer', colorScheme: 'dark' }}>
              <option value="">— None —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <TaskList
            label="What did you do yesterday?"
            tasks={yesterdayTasks}
            onChange={setYesterday}
            productId={productId}
          />

          <TaskList
            label="What will you do today?"
            tasks={todayTasks}
            onChange={setToday}
            productId={productId}
            required
          />

          {/* Blockers */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
              Blockers <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span>
            </div>
            <textarea
              value={blockers}
              onChange={e => setBlockers(e.target.value)}
              rows={2}
              placeholder="None  /  Waiting for vendor reply on API docs"
              style={{
                ...inputStyle, width: '100%', resize: 'vertical',
                border: '1px solid var(--border2)',
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-dim)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--red)33' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            {editing && (
              <button type="button" onClick={() => { setEditing(false); fillForm(existing!); }} style={{
                padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border2)',
                background: 'transparent', color: 'var(--text2)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}>Cancel</button>
            )}
            <button type="submit" disabled={saving} style={{
              padding: '10px 28px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 7,
              transition: 'opacity 0.15s',
            }}>
              {saving ? 'Saving…' : <><Check size={14} />{existing ? 'Update standup' : 'Submit standup'}</>}
            </button>
          </div>
        </form>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recent history
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map(log => (
              <div key={log.id} style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 16px',
                display: 'flex', gap: 14, alignItems: 'flex-start',
              }}>
                <div style={{ flexShrink: 0, width: 36, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                    {new Date(log.date + 'T00:00:00').getDate()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                    {new Date(log.date + 'T00:00:00').toLocaleDateString('en-MY', { month: 'short' })}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TaskDisplay raw={log.today} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
