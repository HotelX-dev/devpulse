import { type ReactNode, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { ThemeContext, useThemeState } from './hooks/useTheme';
import { AuthContext, useAuthState, useAuth } from './hooks/useAuth';
import { useAlerts } from './hooks/useAlerts';
import { useIsMobile } from './hooks/useIsMobile';
import type { Role } from './types';

import Sidebar from './components/Layout/Sidebar';
import Topbar from './components/Layout/Topbar';
import MobileBottomNav from './components/Layout/MobileBottomNav';
import AlertsFullscreenPanel from './components/Layout/AlertsFullscreenPanel';

import Login from './pages/Login';
import ManagerDashboard from './pages/manager/Dashboard';
import Import from './pages/manager/Import';
import Tasks from './pages/manager/Tasks';
import ManagerStandup from './pages/manager/Standup';
import LeaveLog from './pages/manager/LeaveLog';
import Team from './pages/manager/Team';
import MyDashboard from './pages/member/MyDashboard';
import MyTasks from './pages/member/MyTasks';
import MemberStandup from './pages/member/Standup';
import UpdateAvailableBanner from './components/UpdateAvailableBanner';
import Overview from './pages/management/Overview';
import { ToastProvider, useToast } from './context/ToastContext';


/* ── Providers ── */

function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeState();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ── Route guard ── */

function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { member, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!member) return <Navigate to="/login" replace />;
  if (!roles.includes(member.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/* ── Role-based root redirect ── */

function RootRedirect() {
  const { member, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!member) return <Navigate to="/login" replace />;
  if (member.role === 'owner' || member.role === 'admin') return <Navigate to="/manager/dashboard" replace />;
  return <Navigate to="/member/dashboard" replace />;
}

/* ── App shell (sidebar + topbar + outlet) ── */

const PAGE_TITLES: Record<string, string> = {
  '/manager/dashboard': 'Dashboard',
  '/manager/import':    'Import',
  '/manager/tasks':     'Tasks',
  '/manager/standup':   'Standup',
  '/manager/my-standup': 'My standup',
  '/manager/leave':     'Leave Log',
  '/manager/team':      'Team',
  '/member/dashboard':  'My Dashboard',
  '/member/tasks':      'My Tasks',
  '/member/standup':    'Standup',
  '/management/overview': 'Overview',
};

function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? 'DevPulse';
  const isMobile = useIsMobile();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const { alerts, loading: alertsLoading, latestNewAlert } = useAlerts();
  const alertCount = alerts.filter(a => !a.resolved).length;
  const { addToast } = useToast();

  useEffect(() => {
    if (!latestNewAlert) return;
    addToast(latestNewAlert.message || latestNewAlert.type, latestNewAlert.severity);
  }, [latestNewAlert, addToast]);

  const mainPadBottom = isMobile
    ? 'calc(68px + env(safe-area-inset-bottom, 0px))'
    : undefined;

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      {!isMobile && <Sidebar />}
      <div style={{
        marginLeft: isMobile ? 0 : 'var(--sidebar-w)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        minWidth: 0,
        background: 'var(--bg)',
      }}>
        <Topbar
          title={title}
          isMobile={isMobile}
          alertCount={alertCount}
          onOpenAlerts={() => setAlertsOpen(true)}
        />
        <main style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingBottom: mainPadBottom,
        }}>
          {children}
        </main>
      </div>
      {isMobile && <MobileBottomNav />}
      <AlertsFullscreenPanel
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        alerts={alerts}
        loading={alertsLoading}
      />
    </div>
  );
}

/* ── Loading screen ── */

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      color: 'var(--text2)',
      fontSize: 14,
      gap: 10,
    }}>
      <div style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 9,
        color: '#fff',
      }}>
        DP
      </div>
      Loading…
    </div>
  );
}

/* ── Root ── */

export default function App() {
  const basename =
    import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');

  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
        <BrowserRouter basename={basename}>
          <UpdateAvailableBanner />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RootRedirect />} />

            {/* Manager routes */}
            <Route path="/manager/*" element={
              <ProtectedRoute roles={['owner', 'admin']}>
                <AppShell>
                  <Routes>
                    <Route path="dashboard" element={<ManagerDashboard />} />
                    <Route path="import"    element={<Import />} />
                    <Route path="tasks"     element={<Tasks />} />
                    <Route path="standup"   element={<ManagerStandup />} />
                    <Route path="my-standup" element={<MemberStandup />} />
                    <Route path="leave"     element={<LeaveLog />} />
                    <Route path="team"      element={<Team />} />
                    <Route path="*"         element={<Navigate to="dashboard" replace />} />
                  </Routes>
                </AppShell>
              </ProtectedRoute>
            } />

            {/* Member routes */}
            <Route path="/member/*" element={
              <ProtectedRoute roles={['member']}>
                <AppShell>
                  <Routes>
                    <Route path="dashboard" element={<MyDashboard />} />
                    <Route path="tasks"     element={<MyTasks />} />
                    <Route path="standup"   element={<MemberStandup />} />
                    <Route path="*"         element={<Navigate to="dashboard" replace />} />
                  </Routes>
                </AppShell>
              </ProtectedRoute>
            } />

            {/* Management routes (owner + admin + member) */}
            <Route path="/management/*" element={
              <ProtectedRoute roles={['owner', 'admin', 'member']}>
                <AppShell>
                  <Routes>
                    <Route path="overview" element={<Overview />} />
                    <Route path="*"        element={<Navigate to="overview" replace />} />
                  </Routes>
                </AppShell>
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
