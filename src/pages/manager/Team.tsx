import { useEffect, useRef, useState } from 'react';
import { Plus, X, Trash2, UserCheck, UserX, Link2, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { usePageShellStyle } from '../../hooks/usePageShellStyle';
import Avatar from '../../components/UI/Avatar';
import type { Member, MemberTicketMap, Role } from '../../types';

/* ── constants ── */
const ROLES: Role[] = ['member', 'admin', 'owner'];
const AVATAR_COLORS = [
  '#A78BFA', '#60A5FA', '#34D399', '#F87171',
  '#FBBF24', '#F472B6', '#38BDF8', '#A3E635',
];

const ROLE_COLOR: Record<Role, string> = {
  owner:  'var(--accent)',
  admin:  'var(--purple)',
  member: 'var(--blue)',
};

const ROLE_LABEL: Record<Role, string> = {
  owner:  'Owner',
  admin:  'Admin',
  member: 'Member',
};

/* ── shared input style ── */
const inp: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 7,
  border: '1px solid var(--border2)', background: 'var(--bg3)',
  color: 'var(--text)', fontSize: 13, outline: 'none',
  fontFamily: 'var(--font-sans)', width: '100%',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--text2)', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.04em',
};

/* ── Role badge ── */
function RoleBadge({ role }: { role: Role }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 99,
      background: ROLE_COLOR[role] + '22',
      color: ROLE_COLOR[role],
      fontSize: 11, fontWeight: 600,
    }}>
      {ROLE_LABEL[role]}
    </span>
  );
}

/* ── Add Member Modal ── */
interface AddMemberModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function AddMemberModal({ onClose, onSaved }: AddMemberModalProps) {
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [role, setRole]       = useState<Role>('member');
  const [color, setColor]     = useState(AVATAR_COLORS[0]);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  async function handleSave() {
    if (!name.trim() || !email.trim()) { setErr('Name and email are required.'); return; }
    setSaving(true); setErr('');
    const { error } = await supabase.from('members').insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      avatar_color: color,
      active: true,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg2)', borderRadius: 14,
        border: '1px solid var(--border)', width: 440,
        padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Add Member</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input ref={nameRef} style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ahmad Razif" />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. razif@company.com" />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select style={inp} value={role} onChange={e => setRole(e.target.value as Role)}>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Avatar Colour</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: c + '33', border: `2px solid ${c === color ? c : 'transparent'}`,
                    cursor: 'pointer', padding: 0,
                    boxShadow: c === color ? `0 0 0 2px var(--bg2), 0 0 0 4px ${c}` : 'none',
                    transition: 'box-shadow 0.15s',
                  }}
                />
              ))}
            </div>
            {name && (
              <div style={{ marginTop: 10 }}>
                <Avatar name={name} color={color} size="md" />
              </div>
            )}
          </div>
        </div>

        {err && <div style={{ marginTop: 12, color: 'var(--red)', fontSize: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border2)',
            background: 'none', color: 'var(--text2)', fontSize: 13, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: 13,
            fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}>{saving ? 'Saving…' : 'Add Member'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Edit Member Modal ── */
interface EditMemberModalProps {
  member: Member;
  onClose: () => void;
  onSaved: () => void;
}

function EditMemberModal({ member, onClose, onSaved }: EditMemberModalProps) {
  const [name, setName]     = useState(member.name);
  const [email, setEmail]   = useState(member.email);
  const [role, setRole]     = useState<Role>(member.role);
  const [color, setColor]   = useState(member.avatar_color);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  async function handleSave() {
    if (!name.trim() || !email.trim()) { setErr('Name and email are required.'); return; }
    setSaving(true); setErr('');
    const { error } = await supabase.from('members').update({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      avatar_color: color,
    }).eq('id', member.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', borderRadius: 14,
        border: '1px solid var(--border)', width: 440,
        padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Edit Member</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input ref={nameRef} style={inp} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select style={{ ...inp, colorScheme: 'dark', cursor: 'pointer' }} value={role} onChange={e => setRole(e.target.value as Role)}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Avatar Colour</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: c + '33', border: `2px solid ${c === color ? c : 'transparent'}`,
                    cursor: 'pointer', padding: 0,
                    boxShadow: c === color ? `0 0 0 2px var(--bg2), 0 0 0 4px ${c}` : 'none',
                    transition: 'box-shadow 0.15s',
                  }}
                />
              ))}
            </div>
            {name && (
              <div style={{ marginTop: 10 }}>
                <Avatar name={name} color={color} size="md" />
              </div>
            )}
          </div>
        </div>

        {err && <div style={{ marginTop: 12, color: 'var(--red)', fontSize: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border2)',
            background: 'none', color: 'var(--text2)', fontSize: 13, cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: 13,
            fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1, fontFamily: 'var(--font-sans)',
          }}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Add Mapping Modal ── */
interface AddMapModalProps {
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}

function AddMapModal({ members, onClose, onSaved }: AddMapModalProps) {
  const [rawName, setRawName]   = useState('');
  const [memberId, setMemberId] = useState(members[0]?.id ?? '');
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');
  const rawRef = useRef<HTMLInputElement>(null);

  useEffect(() => { rawRef.current?.focus(); }, []);

  async function handleSave() {
    if (!rawName.trim()) { setErr('Raw name is required.'); return; }
    if (!memberId)       { setErr('Select a member.'); return; }
    setSaving(true); setErr('');
    const { error } = await supabase.from('member_ticket_map').insert({
      raw_name: rawName.trim(),
      member_id: memberId,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  const activeMembers = members.filter(m => m.active);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg2)', borderRadius: 14,
        border: '1px solid var(--border)', width: 420,
        padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Add Name Mapping</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={labelStyle}>Raw CSV Name</label>
            <input ref={rawRef} style={inp} value={rawName} onChange={e => setRawName(e.target.value)}
              placeholder="Exact name from CSV (e.g. Ahmad R.)" />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              This must match the assignedToName value in your CSV exports exactly.
            </div>
          </div>
          <div>
            <label style={labelStyle}>Maps to Member</label>
            <select style={inp} value={memberId} onChange={e => setMemberId(e.target.value)}>
              {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        {err && <div style={{ marginTop: 12, color: 'var(--red)', fontSize: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border2)',
            background: 'none', color: 'var(--text2)', fontSize: 13, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: 13,
            fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}>{saving ? 'Saving…' : 'Add Mapping'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main ── */
type Tab = 'members' | 'map';

export default function Team() {
  const { member: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const pageStyle = usePageShellStyle({ maxWidth: 900, gap: 20, paddingDesktop: '24px 28px' });
  const [tab, setTab]             = useState<Tab>('members');
  const [members, setMembers]     = useState<Member[]>([]);
  const [maps, setMaps]           = useState<MemberTicketMap[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [showMap, setShowMap]     = useState(false);
  const [editTarget, setEditTarget] = useState<Member | null>(null);
  const [toggling, setToggling]   = useState<string | null>(null);
  const [deletingMap, setDeletingMap] = useState<string | null>(null);

  async function fetchAll() {
    setLoading(true);
    const [{ data: mem }, { data: mp }] = await Promise.all([
      supabase.from('members').select('*').order('name'),
      supabase.from('member_ticket_map').select('*').order('raw_name'),
    ]);
    setMembers((mem ?? []) as Member[]);
    setMaps((mp ?? []) as MemberTicketMap[]);
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function toggleActive(m: Member) {
    setToggling(m.id);
    await supabase.from('members').update({ active: !m.active }).eq('id', m.id);
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, active: !x.active } : x));
    setToggling(null);
  }

  async function deleteMap(id: string) {
    setDeletingMap(id);
    await supabase.from('member_ticket_map').delete().eq('id', id);
    setMaps(prev => prev.filter(m => m.id !== id));
    setDeletingMap(null);
  }

  function memberName(id: string | null) {
    if (!id) return <span style={{ color: 'var(--text3)' }}>— unassigned —</span>;
    const m = members.find(x => x.id === id);
    return m ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar name={m.name} color={m.avatar_color} size="sm" />
        <span>{m.name}</span>
      </div>
    ) : <span style={{ color: 'var(--text3)' }}>Unknown</span>;
  }

  const activeCount   = members.filter(m => m.active).length;
  const inactiveCount = members.filter(m => !m.active).length;

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Team</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            {activeCount} active · {inactiveCount} inactive · {maps.length} ticket name mappings
          </div>
        </div>
        {!isAdmin && (
          <button
            onClick={() => tab === 'members' ? setShowAdd(true) : setShowMap(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={15} />
            {tab === 'members' ? 'Add Member' : 'Add Mapping'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border2)' }}>
        {(['members', 'map'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', background: 'none', border: 'none',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            color: tab === t ? 'var(--accent)' : 'var(--text2)',
            borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
            marginBottom: -1,
          }}>
            {t === 'members' ? 'Members' : 'Ticket Name Map'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Loading…</div>
      ) : tab === 'members' ? (
        /* ── Members grid ── */
        <div style={{ display: 'grid', gap: 10 }}>
          {members.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 18px',
              background: 'var(--bg2)',
              border: `1px solid ${m.active ? 'var(--border)' : 'var(--border2)'}`,
              borderRadius: 12,
              opacity: m.active ? 1 : 0.6,
            }}>
              <Avatar name={m.name} color={m.avatar_color} size="md" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{m.name}</span>
                  <RoleBadge role={m.role} />
                  {!m.active && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 99,
                      background: 'var(--border2)',
                      color: 'var(--text3)',
                      fontSize: 11, fontWeight: 600,
                    }}>Inactive</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{m.email}</div>
              </div>
              {!isAdmin && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setEditTarget(m)}
                    title="Edit member"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 7,
                      border: '1px solid var(--border2)',
                      background: 'transparent',
                      color: 'var(--text2)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    onClick={() => toggleActive(m)}
                    disabled={toggling === m.id}
                    title={m.active ? 'Deactivate' : 'Reactivate'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 7,
                      border: `1px solid ${m.active ? 'var(--red)' : 'var(--green)'}44`,
                      background: m.active ? 'var(--red)11' : 'var(--green)11',
                      color: m.active ? 'var(--red)' : 'var(--green)',
                      fontSize: 12, fontWeight: 600, cursor: toggling === m.id ? 'not-allowed' : 'pointer',
                      opacity: toggling === m.id ? 0.6 : 1,
                    }}
                  >
                    {m.active ? <><UserX size={13} /> Deactivate</> : <><UserCheck size={13} /> Reactivate</>}
                  </button>
                </div>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
              No members yet. Add your first team member.
            </div>
          )}
        </div>
      ) : (
        /* ── Ticket name map table ── */
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
            minWidth: 320,
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 44px',
              padding: '10px 18px',
              borderBottom: '1px solid var(--border2)',
              fontSize: 11, fontWeight: 600, color: 'var(--text2)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              <span>CSV Raw Name</span>
              <span>Maps to Member</span>
              <span />
            </div>

            {maps.length === 0 ? (
              <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                No mappings yet. Add one to auto-assign imported tickets.
              </div>
            ) : maps.map((mp, i) => (
              <div key={mp.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 44px',
                padding: '12px 18px',
                borderBottom: i < maps.length - 1 ? '1px solid var(--border2)' : 'none',
                alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Link2 size={13} color="var(--text3)" />
                  <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'monospace' }}>{mp.raw_name}</span>
                </div>
                <div style={{ fontSize: 13 }}>{memberName(mp.member_id)}</div>
                {!isAdmin && (
                  <button
                    onClick={() => deleteMap(mp.id)}
                    disabled={deletingMap === mp.id}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text3)', padding: 6, borderRadius: 6,
                      opacity: deletingMap === mp.id ? 0.4 : 1,
                    }}
                    title="Delete mapping"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
            These mappings are applied automatically when importing CSV files — the raw assignee name
            from the CSV is resolved to the matching member.
          </div>
        </div>
      )}

      {showAdd && (
        <AddMemberModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchAll(); }}
        />
      )}
      {showMap && (
        <AddMapModal
          members={members}
          onClose={() => setShowMap(false)}
          onSaved={() => { setShowMap(false); fetchAll(); }}
        />
      )}
      {editTarget && (
        <EditMemberModal
          member={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); fetchAll(); }}
        />
      )}
    </div>
  );
}
