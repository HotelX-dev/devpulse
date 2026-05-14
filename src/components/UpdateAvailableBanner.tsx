import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { RUNNING_BUILD_ID } from '../lib/buildMeta';

const POLL_MS = 5 * 60 * 1000;
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'devpulse_update_snooze';

function versionUrl(): string {
  const base = import.meta.env.BASE_URL;
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}version.json?t=${Date.now()}`;
}

async function fetchRemoteBuild(): Promise<string | null> {
  try {
    const res = await fetch(versionUrl(), { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && 'build' in data && typeof (data as { build: unknown }).build === 'string') {
      return (data as { build: string }).build;
    }
    return null;
  } catch {
    return null;
  }
}

function readSnooze(): { build: string; until: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { build?: string; until?: number };
    if (typeof j.build === 'string' && typeof j.until === 'number') return { build: j.build, until: j.until };
    return null;
  } catch {
    return null;
  }
}

function isSnoozed(remoteBuild: string): boolean {
  const s = readSnooze();
  if (!s || s.build !== remoteBuild) return false;
  return Date.now() < s.until;
}

/**
 * Shows when the deployed `version.json` build differs from this bundle’s `RUNNING_BUILD_ID`.
 * Polls on an interval and re-checks when the tab becomes visible again.
 */
export default function UpdateAvailableBanner() {
  const [visible, setVisible] = useState(false);
  const remoteRef = useRef<string | null>(null);
  const check = useCallback(async () => {
    const remote = await fetchRemoteBuild();
    if (!remote) return;

    if (remote === RUNNING_BUILD_ID) {
      setVisible(false);
      return;
    }
    remoteRef.current = remote;
    if (isSnoozed(remote)) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, []);

  useEffect(() => {
    void check();

    const id = window.setInterval(() => void check(), POLL_MS);

    const onVis = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [check]);

  function snooze() {
    const remote = remoteRef.current;
    if (remote) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ build: remote, until: Date.now() + SNOOZE_MS }),
      );
    }
    setVisible(false);
  }

  function refresh() {
    window.location.reload();
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 400,
        paddingTop: 'max(10px, env(safe-area-inset-top))',
        paddingLeft: 'max(12px, env(safe-area-inset-left))',
        paddingRight: 'max(12px, env(safe-area-inset-right))',
        paddingBottom: 10,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div style={{
        pointerEvents: 'auto',
        maxWidth: 560,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--bg2)',
        border: '1px solid var(--accent)44',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>New version</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>
            Refresh to load the latest DevPulse.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={snooze}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border2)',
              background: 'transparent',
              color: 'var(--text2)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Later
          </button>
          <button
            type="button"
            onClick={refresh}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          <button
            type="button"
            onClick={snooze}
            aria-label="Dismiss"
            title="Dismiss"
            style={{
              padding: 8,
              border: 'none',
              background: 'transparent',
              color: 'var(--text3)',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
