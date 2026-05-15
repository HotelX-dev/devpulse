import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const REMEMBER_EMAIL_KEY = 'devpulse_login_email';

function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBER_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function Login() {
  const { signIn, member } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = readRememberedEmail();
    if (stored) {
      setEmail(stored);
      setRememberMe(true);
    }
  }, []);

  // Redirect if already signed in
  if (member) {
    const dest =
      member.role === 'owner' ? '/manager/dashboard' :
      member.role === 'admin' ? '/management/overview' :
      '/member/dashboard';
    return <Navigate to={dest} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    try {
      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }
    } catch {
      /* ignore quota / private mode */
    }
    // navigation happens via auth state change in App.tsx
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    minHeight: 48,
    borderRadius: 8,
    border: '1px solid var(--border2)',
    background: 'var(--bg3)',
    color: 'var(--text)',
    fontSize: 16,
    outline: 'none',
    fontFamily: 'var(--font-sans)',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 'max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 'clamp(24px, 5vw, 36px) clamp(20px, 5vw, 32px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 17,
            color: '#fff',
          }}>
            DP
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>DevPulse</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>Your team's heartbeat</div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>Email</label>
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@ifca.com.my"
              required
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border2)'; }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>Password</label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border2)'; }}
            />
          </div>

          <label
            htmlFor="remember-me"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              userSelect: 'none',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text)',
            }}
          >
            <input
              type="checkbox"
              id="remember-me"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              style={{
                width: 18,
                height: 18,
                accentColor: 'var(--accent)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            />
            Remember me
          </label>

          {error && (
            <div style={{
              fontSize: 13,
              color: 'var(--red)',
              background: 'var(--red-dim)',
              border: '1px solid var(--red)33',
              borderRadius: 8,
              padding: '8px 12px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: '14px 16px',
              minHeight: 48,
              borderRadius: 8,
              border: 'none',
              background: loading ? 'var(--accent-dim)' : 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 16,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-dark)'; }}
            onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
