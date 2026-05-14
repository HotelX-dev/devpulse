import { useEffect, useRef, useState } from 'react';
import { Plus, X, Edit2, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { Task, Member, Product, TaskStatus } from '../../types';

/* ── constants ── */
const TASK_TYPES   = ['Migration', 'Performance', 'Bug fix', 'Infra', 'Integration', 'Other'] as const;
const STATUS_ORDER: TaskStatus[] = ['Pending', 'In Progress', 'Blocked', 'QC', 'Done'];
const CODE_ORDER   = ['HOTEL', 'MENU', 'EVENT', 'ACCOUNT'];

const STATUS_COLOR: Record<TaskStatus, string> = {
  Pending:      'var(--text3)',
  'In Progress':'var(--blue)',
  Blocked:      'var(--red)',
  QC:           'var(--purple)',
  Done:         'var(--green)',
};

const TYPE_COLOR: Record<string, string> = {
  Migration:   'var(--purple)',
  Performance: 'var(--blue)',
  'Bug fix':   'var(--red)',
  Infra:       'var(--amber)',
  Integration: 'var(--accent)',
  Other:       'var(--text3)',
};

/* ── helpers ── */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isOverdue(due: string | null, status: TaskStatus): boolean {
  if (!due || status === 'Done') return false;
  return due < localToday();
}

function calcWorkingDays(start: string | null | undefined, end: string): number {
  if (!start) return 0;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  if (s > e) return 0;
  let days = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/* ── shared input style ── */
const inp: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 7,
  border: '1px solid var(--border2)', background: 'var(--bg3)',
  color: 'var(--text)', fontSize: 13, outline: 'none',
  fontFamily: 'var(--font-sans)', width: '100%',
};

/* ── Avatar mini ── */
function AvatarMini({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {name.split(' ').map(w => w[0]).slice(0, 2).join('')}
    </div>
  );
}

/* ── Status cycle button ── */
function StatusBadge({ status, onChange }: { status: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 6,
          background: `${STATUS_COLOR[status]}18`,
          border: `1px solid ${STATUS_COLOR[status]}44`,
          color: STATUS_COLOR[status], fontSize: 11, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'var(--font-sans)',
        }}
      >
        {status} <ChevronDown size={10} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 4, minWidth: 120,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {STATUS_ORDER.map(s => (
            <button
              key={s}
              onClick={e => { e.stopPropagation(); onChange(s); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 10px', borderRadius: 5, border: 'none',
                background: s === status ? `${STATUS_COLOR[s]}18` : 'transparent',
                color: STATUS_COLOR[s], fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Task form modal ── */
interface TaskFormProps {
  task: Partial<Task> | null;
  members: Member[];
  products: Product[];
  currentMemberId: string;
  onSave: (t: Partial<Task>) => Promise<void>;
  onClose: () => void;
}

function TaskModal({ task, members, products, currentMemberId, onSave, onClose }: TaskFormProps) {
  const isEdit = !!task?.id;
  const [form, setForm] = useState<Partial<Task>>({
    title:       '',
    product_id:  '',
    type:        'Other',
    status:      'Pending',
    priority:    2,
    assignees:   [],
    est_days:    null,
    actual_days: null,
    task_date:   localToday(),
    due_date:    null,
    remarks:     null,
    jira_ref:    null,
    created_by:  currentMemberId,
    ...task,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function patch(p: Partial<Task>) { setForm(f => ({ ...f, ...p })); }

  function toggleAssignee(id: string) {
    patch({ assignees: form.assignees?.includes(id)
      ? form.assignees.filter(a => a !== id)
      : [...(form.assignees ?? []), id],
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title?.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError('');
    await onSave(form);
    setSaving(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 28, width: '100%', maxWidth: 560,
          maxHeight: '90vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            {isEdit ? 'Edit task' : 'New task'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              value={form.title ?? ''} onChange={e => patch({ title: e.target.value })}
              placeholder="Migrate database to new schema…"
              style={inp} autoFocus
            />
          </div>

          {/* Product + Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Product</label>
              <select value={form.product_id ?? ''} onChange={e => patch({ product_id: e.target.value || undefined })}
                style={{ ...inp, cursor: 'pointer', colorScheme: 'dark' }}>
                <option value="">— None —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={form.type ?? 'Other'} onChange={e => patch({ type: e.target.value })}
                style={{ ...inp, cursor: 'pointer', colorScheme: 'dark' }}>
                {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Status + Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status ?? 'Pending'} onChange={e => patch({ status: e.target.value as TaskStatus })}
                style={{ ...inp, cursor: 'pointer', colorScheme: 'dark' }}>
                {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select value={form.priority ?? 2} onChange={e => patch({ priority: Number(e.target.value) as 1 | 2 })}
                style={{ ...inp, cursor: 'pointer', colorScheme: 'dark' }}>
                <option value={1}>P1 — High</option>
                <option value={2}>P2 — Normal</option>
              </select>
            </div>
          </div>

          {/* Assignees */}
          <div>
            <label style={labelStyle}>Assignees</label>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              padding: '10px 12px', borderRadius: 7,
              border: '1px solid var(--border2)', background: 'var(--bg3)',
            }}>
              {members.map(m => {
                const active = form.assignees?.includes(m.id);
                return (
                  <button
                    key={m.id} type="button"
                    onClick={() => toggleAssignee(m.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 99,
                      border: `1px solid ${active ? m.avatar_color : 'var(--border2)'}`,
                      background: active ? `${m.avatar_color}22` : 'transparent',
                      color: active ? 'var(--text)' : 'var(--text3)',
                      fontSize: 12, fontWeight: active ? 600 : 400,
                      cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      transition: 'all 0.1s',
                    }}
                  >
                    <AvatarMini name={m.name} color={m.avatar_color} size={16} />
                    {m.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Start date</label>
              <input type="date" value={form.task_date ?? ''} onChange={e => patch({ task_date: e.target.value || null })}
                style={{ ...inp, colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={labelStyle}>Due date</label>
              <input type="date" value={form.due_date ?? ''} onChange={e => patch({ due_date: e.target.value || null })}
                style={{ ...inp, colorScheme: 'dark' }} />
            </div>
          </div>

          {/* Est + Actual days */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Est. days</label>
              <input type="number" min={0} step={0.5}
                value={form.est_days ?? ''} onChange={e => patch({ est_days: e.target.value ? Number(e.target.value) : null })}
                placeholder="e.g. 3" style={inp} />
            </div>
            <div>
              <label style={labelStyle}>Actual days</label>
              {form.status === 'Done' ? (
                <div style={{
                  ...inp, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  color: 'var(--text2)', background: 'var(--bg)', cursor: 'default',
                }}>
                  <span>{calcWorkingDays(form.task_date, localToday())}</span>
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>auto</span>
                </div>
              ) : (
                <input type="number" min={0} step={0.5}
                  value={form.actual_days ?? ''} onChange={e => patch({ actual_days: e.target.value ? Number(e.target.value) : null })}
                  placeholder="e.g. 4.5" style={inp} />
              )}
            </div>
          </div>

          {/* Jira ref */}
          <div>
            <label style={labelStyle}>Jira / ticket ref <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
            <input value={form.jira_ref ?? ''} onChange={e => patch({ jira_ref: e.target.value || null })}
              placeholder="PROJ-123" style={{ ...inp, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
          </div>

          {/* Remarks */}
          <div>
            <label style={labelStyle}>Remarks <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
            <textarea rows={2} value={form.remarks ?? ''} onChange={e => patch({ remarks: e.target.value || null })}
              placeholder="Any notes or context…"
              style={{ ...inp, resize: 'vertical' }} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-dim)', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--red)33' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border2)',
              background: 'transparent', color: 'var(--text2)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>Cancel</button>
            <button type="submit" disabled={saving} style={{
              padding: '9px 24px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              fontFamily: 'var(--font-sans)',
            }}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--text2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em',
};

/* ── Task row card ── */
function TaskCard({
  task, memberMap, productMap, onEdit, onStatusChange, readOnly,
}: {
  task: Task;
  memberMap: Map<string, Member>;
  productMap: Map<string, string>;
  onEdit: () => void;
  onStatusChange: (s: TaskStatus) => void;
  readOnly?: boolean;
}) {
  const overdue = isOverdue(task.due_date, task.status);

  return (
    <div style={{
      background: 'var(--bg2)', border: `1px solid ${task.status === 'Blocked' ? 'var(--red)33' : 'var(--border)'}`,
      borderRadius: 10, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      {/* Priority */}
      <div style={{
        width: 28, flexShrink: 0, textAlign: 'center',
        fontSize: 10, fontWeight: 800,
        color: task.priority === 1 ? 'var(--red)' : 'var(--text3)',
      }}>
        P{task.priority}
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {task.title}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
            color: TYPE_COLOR[task.type] ?? 'var(--text3)',
            background: `${TYPE_COLOR[task.type] ?? 'var(--text3)'}18`,
            textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
          }}>
            {task.type}
          </span>
          {task.jira_ref && (
            <span style={{
              fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
              background: 'var(--accent-dim)', borderRadius: 3, padding: '1px 6px', flexShrink: 0,
            }}>
              {task.jira_ref}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
          {productMap.get(task.product_id) && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{productMap.get(task.product_id)}</span>
          )}
          {task.due_date && (
            <span style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text3)', fontWeight: overdue ? 600 : 400 }}>
              {overdue ? '⚠ ' : ''}Due {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {task.est_days != null && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {task.actual_days != null ? `${task.actual_days}/${task.est_days}d` : `${task.est_days}d est`}
            </span>
          )}
        </div>
      </div>

      {/* Assignees */}
      <div style={{ display: 'flex', gap: -4, flexShrink: 0 }}>
        {(task.assignees ?? []).slice(0, 4).map((id, i) => {
          const m = memberMap.get(id);
          if (!m) return null;
          return (
            <div key={id} title={m.name} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: 10 - i }}>
              <AvatarMini name={m.name} color={m.avatar_color} size={24} />
            </div>
          );
        })}
        {(task.assignees ?? []).length > 4 && (
          <div style={{
            width: 24, height: 24, borderRadius: '50%', background: 'var(--bg3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: 'var(--text2)', marginLeft: -6,
          }}>
            +{task.assignees.length - 4}
          </div>
        )}
      </div>

      {/* Status */}
      <div style={{ flexShrink: 0 }}>
        <StatusBadge status={task.status} onChange={onStatusChange} />
      </div>

      {/* Edit */}
      {!readOnly && (
        <button onClick={onEdit} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text3)', display: 'flex', padding: 4, borderRadius: 5, flexShrink: 0,
        }}>
          <Edit2 size={14} />
        </button>
      )}
    </div>
  );
}

/* ── Filter pill ── */
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 13px', borderRadius: 99, border: '1px solid',
      borderColor: active ? 'var(--accent)' : 'var(--border2)',
      background: active ? 'var(--accent-dim)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text2)',
      fontSize: 12, fontWeight: active ? 600 : 400,
      cursor: 'pointer', fontFamily: 'var(--font-sans)',
      transition: 'all 0.12s',
    }}>
      {label}
    </button>
  );
}

/* ── Main ── */
export default function Tasks() {
  const { member } = useAuth();
  const isAdmin = member?.role === 'admin';

  const [tasks, setTasks]         = useState<Task[]>([]);
  const [members, setMembers]     = useState<Member[]>([]);
  const [products, setProducts]   = useState<Product[]>([]);
  const [loading, setLoading]     = useState(true);

  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter]   = useState<TaskStatus | ''>('');
  const [search, setSearch]               = useState('');

  const [modal, setModal] = useState<{ open: boolean; task: Partial<Task> | null }>({ open: false, task: null });

  const memberMap  = new Map(members.map(m => [m.id, m]));
  const productMap = new Map(products.map(p => [p.id, p.name]));

  useEffect(() => {
    Promise.all([
      supabase.from('members').select('*').eq('active', true).in('role', ['owner', 'admin', 'member']).order('name'),
      supabase.from('products').select('*'),
    ]).then(([{ data: mems }, { data: prods }]) => {
      setMembers(mems ?? []);
      const sorted = (prods ?? []).sort((a, b) => CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code));
      setProducts(sorted);
    });
  }, []);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    setLoading(true);
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });
    setTasks(data ?? []);
    setLoading(false);
  }

  async function handleSave(form: Partial<Task>) {
    const isEdit = !!form.id;
    const isDone = form.status === 'Done';
    const autoActual = isDone ? calcWorkingDays(form.task_date, localToday()) : null;

    const payload = {
      title:       form.title?.trim(),
      product_id:  form.product_id || null,
      type:        form.type,
      status:      form.status,
      priority:    form.priority,
      assignees:   form.assignees ?? [],
      est_days:    form.est_days ?? null,
      actual_days: isDone ? autoActual : (form.actual_days ?? null),
      task_date:   form.task_date ?? null,
      due_date:    form.due_date ?? null,
      remarks:     form.remarks ?? null,
      jira_ref:    form.jira_ref ?? null,
      created_by:  form.created_by ?? member?.id,
      closed_at:   isDone ? new Date().toISOString() : null,
    };

    if (isEdit) {
      await supabase.from('tasks').update(payload).eq('id', form.id!);
    } else {
      await supabase.from('tasks').insert(payload);
    }
    setModal({ open: false, task: null });
    loadTasks();
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    const task = tasks.find(t => t.id === taskId);
    const closedAt = status === 'Done' ? new Date().toISOString() : null;
    // auto-calculate when closing; clear if re-opened from Done
    const actualDays = status === 'Done'
      ? calcWorkingDays(task?.task_date, localToday())
      : (task?.status === 'Done' ? null : (task?.actual_days ?? null));

    await supabase.from('tasks').update({
      status,
      closed_at:   closedAt,
      actual_days: actualDays,
    }).eq('id', taskId);

    setTasks(ts => ts.map(t => t.id === taskId
      ? { ...t, status, closed_at: closedAt, actual_days: actualDays }
      : t,
    ));
  }

  /* Filtering */
  const filtered = tasks.filter(t => {
    if (productFilter && t.product_id !== productFilter) return false;
    if (statusFilter  && t.status !== statusFilter)       return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(t.jira_ref ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* Status counts */
  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = tasks.filter(t => t.status === s).length;
    return acc;
  }, {} as Record<TaskStatus, number>);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Tasks</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {tasks.filter(t => t.status !== 'Done').length} active · {counts['Done']} done
          </div>
        </div>
        <button
          onClick={() => setModal({ open: true, task: null })}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          <Plus size={15} /> New task
        </button>
      </div>

      {/* Status summary */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {STATUS_ORDER.map(s => (
          <div key={s} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            background: `${STATUS_COLOR[s]}12`, border: `1px solid ${STATUS_COLOR[s]}33`,
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: STATUS_COLOR[s] }}>{counts[s]}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{s}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Product filter */}
        <Pill label="All products" active={!productFilter} onClick={() => setProductFilter('')} />
        {products.map(p => (
          <Pill key={p.id} label={p.name} active={productFilter === p.id} onClick={() => setProductFilter(p.id)} />
        ))}
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        {/* Status filter */}
        <Pill label="All status" active={!statusFilter} onClick={() => setStatusFilter('')} />
        {STATUS_ORDER.filter(s => s !== 'Done').map(s => (
          <Pill key={s} label={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
        ))}
        {/* Search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search title or ref…"
          style={{
            marginLeft: 'auto', padding: '6px 12px', borderRadius: 7,
            border: '1px solid var(--border2)', background: 'var(--bg2)',
            color: 'var(--text)', fontSize: 12, outline: 'none',
            fontFamily: 'var(--font-sans)', width: 180,
          }}
        />
      </div>

      {/* Task list */}
      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg2)', border: '1px dashed var(--border2)',
          borderRadius: 12, padding: '48px 32px', textAlign: 'center', color: 'var(--text3)',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            {tasks.length === 0 ? 'No tasks yet' : 'No tasks match filters'}
          </div>
          <div style={{ fontSize: 13 }}>
            {tasks.length === 0 ? 'Create your first task to get started.' : 'Try clearing the filters.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              memberMap={memberMap}
              productMap={productMap}
              onEdit={() => setModal({ open: true, task })}
              onStatusChange={s => handleStatusChange(task.id, s)}
              readOnly={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <TaskModal
          task={modal.task}
          members={members}
          products={products}
          currentMemberId={member?.id ?? ''}
          onSave={handleSave}
          onClose={() => setModal({ open: false, task: null })}
        />
      )}
    </div>
  );
}
