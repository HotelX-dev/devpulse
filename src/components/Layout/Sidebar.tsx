import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Upload, CheckSquare, MessageSquare, PenLine,
  Calendar, Users, LogOut, BarChart2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import Avatar from '../UI/Avatar';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const managerNav: NavItem[] = [
  { to: '/management/overview', icon: <BarChart2 size={18} />,      label: 'Overview' },
  { to: '/manager/dashboard',   icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { to: '/manager/import',      icon: <Upload size={18} />,          label: 'Import' },
  { to: '/manager/tasks',       icon: <CheckSquare size={18} />,     label: 'Tasks' },
  { to: '/manager/standup',     icon: <MessageSquare size={18} />,   label: 'Standup' },
  { to: '/manager/my-standup',  icon: <PenLine size={18} />,         label: 'My standup' },
  { to: '/manager/leave',       icon: <Calendar size={18} />,        label: 'Leave' },
  { to: '/manager/team',        icon: <Users size={18} />,           label: 'Team' },
];

const memberNav: NavItem[] = [
  { to: '/member/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { to: '/member/tasks',     icon: <CheckSquare size={18} />,     label: 'My Tasks' },
  { to: '/member/standup',   icon: <MessageSquare size={18} />,   label: 'Standup' },
];

const ROLE_LABEL: Record<string, string> = {
  owner:  'Owner',
  admin:  'Admin',
  member: 'Member',
};

const navLinkBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '9px 12px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text2)',
  transition: 'background 0.15s, color 0.15s',
  textDecoration: 'none',
};

export default function Sidebar() {
  const { member, signOut } = useAuth();

  const navItems =
    member?.role === 'owner' || member?.role === 'admin' ? managerNav :
    memberNav;

  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      minHeight: '100vh',
      background: 'var(--bg2)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 13,
          color: '#fff',
          flexShrink: 0,
        }}>
          DP
        </div>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>DevPulse</span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              ...navLinkBase,
              background: isActive ? 'var(--accent-dim)' : 'transparent',
              color: isActive ? 'var(--accent)' : 'var(--text2)',
            })}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer: avatar + sign out */}
      {member && (
        <div style={{
          padding: '12px 8px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px' }}>
            <Avatar name={member.name} color={member.avatar_color} size="sm" />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {member.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                {ROLE_LABEL[member.role] ?? member.role}
              </div>
            </div>
          </div>
          <button
            onClick={signOut}
            style={{
              ...navLinkBase,
              background: 'transparent',
              border: 'none',
              width: '100%',
              justifyContent: 'flex-start',
              color: 'var(--text3)',
              fontSize: 13,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--red)';
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--red-dim)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text3)';
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
