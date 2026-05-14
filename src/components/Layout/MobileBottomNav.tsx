import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Upload, CheckSquare, MessageSquare, Menu,
  Calendar, Users, LogOut, X, PenLine,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { Role } from '../../types';

const ITEM: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  padding: '8px 4px',
  minHeight: 48,
  borderRadius: 10,
  textDecoration: 'none',
  color: 'var(--text2)',
  fontSize: 10,
  fontWeight: 600,
  transition: 'color 0.15s, background 0.15s',
};

function MoreSheet({
  open, onClose, role, onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
  onSignOut: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const isManager = role === 'owner' || role === 'admin';

  const linkStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    color: active ? 'var(--accent)' : 'var(--text)',
    background: active ? 'var(--accent-dim)' : 'var(--bg2)',
    border: `1px solid ${active ? 'var(--accent)44' : 'var(--border)'}`,
    textDecoration: 'none',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="more-sheet-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 280,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <header style={{
        flexShrink: 0,
        minHeight: 52,
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 'max(8px, env(safe-area-inset-left))',
        paddingRight: 'max(8px, env(safe-area-inset-right))',
        background: 'var(--bg2)',
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          style={{
            minWidth: 44,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            color: 'var(--text2)',
            borderRadius: 10,
            cursor: 'pointer',
          }}
        >
          <X size={22} />
        </button>
        <h2 id="more-sheet-title" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
          More
        </h2>
      </header>

      <nav style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px max(16px, env(safe-area-inset-left)) 24px max(16px, env(safe-area-inset-right))',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {isManager && (
          <>
            <NavLink to="/manager/leave" onClick={onClose} style={({ isActive }) => linkStyle(isActive)}>
              <Calendar size={20} />
              Leave Log
            </NavLink>
            <NavLink to="/manager/team" onClick={onClose} style={({ isActive }) => linkStyle(isActive)}>
              <Users size={20} />
              Team
            </NavLink>
            <NavLink to="/manager/my-standup" onClick={onClose} style={({ isActive }) => linkStyle(isActive)}>
              <PenLine size={20} />
              My standup
            </NavLink>
          </>
        )}
        <button
          type="button"
          onClick={() => { onSignOut(); onClose(); }}
          style={{
            ...linkStyle(false),
            width: '100%',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            color: 'var(--red)',
            background: 'var(--red-dim)',
            border: '1px solid var(--red)33',
            justifyContent: 'flex-start',
          }}
        >
          <LogOut size={20} />
          Sign out
        </button>
      </nav>
    </div>
  );
}

function TabLink({
  to, label, Icon,
}: {
  to: string;
  label: string;
  Icon: LucideIcon;
}) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        ...ITEM,
        color: isActive ? 'var(--accent)' : 'var(--text2)',
        background: isActive ? 'var(--accent-dim)' : 'transparent',
      })}
    >
      <Icon size={20} strokeWidth={2.25} />
      <span style={{ lineHeight: 1.1, textAlign: 'center' }}>{label}</span>
    </NavLink>
  );
}

const barStyle: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 90,
  background: 'var(--bg2)',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'stretch',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  paddingLeft: 'max(0px, env(safe-area-inset-left))',
  paddingRight: 'max(0px, env(safe-area-inset-right))',
};

export default function MobileBottomNav() {
  const { member, signOut } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  if (!member) return null;

  const role = member.role;
  const isManager = role === 'owner' || role === 'admin';

  const moreActive = isManager && (
    location.pathname.startsWith('/manager/leave') ||
    location.pathname.startsWith('/manager/team') ||
    location.pathname.startsWith('/manager/my-standup')
  );

  if (isManager) {
    return (
      <>
        <nav style={barStyle} aria-label="Primary">
          <TabLink to="/manager/dashboard" label="Home" Icon={LayoutDashboard} />
          <TabLink to="/manager/import" label="Import" Icon={Upload} />
          <TabLink to="/manager/tasks" label="Tasks" Icon={CheckSquare} />
          <TabLink to="/manager/standup" label="Standup" Icon={MessageSquare} />
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            style={{
              ...ITEM,
              border: 'none',
              background: moreActive ? 'var(--accent-dim)' : 'transparent',
              color: moreActive ? 'var(--accent)' : 'var(--text2)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <Menu size={20} strokeWidth={2.25} />
            <span style={{ lineHeight: 1.1 }}>More</span>
          </button>
        </nav>
        <MoreSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          role={role}
          onSignOut={signOut}
        />
      </>
    );
  }

  return (
    <nav style={barStyle} aria-label="Primary">
      <TabLink to="/member/dashboard" label="Home" Icon={LayoutDashboard} />
      <TabLink to="/member/tasks" label="Tasks" Icon={CheckSquare} />
      <TabLink to="/member/standup" label="Standup" Icon={MessageSquare} />
      <button
        type="button"
        onClick={() => setMoreOpen(true)}
        style={{
          ...ITEM,
          border: 'none',
          background: 'transparent',
          color: 'var(--text2)',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <Menu size={20} strokeWidth={2.25} />
        <span style={{ lineHeight: 1.1 }}>More</span>
      </button>
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        role={role}
        onSignOut={signOut}
      />
    </nav>
  );
}
