import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import type { Alert } from '../../types';
import AlertBanner from '../UI/AlertBanner';

interface AlertsFullscreenPanelProps {
  open: boolean;
  onClose: () => void;
  alerts: Alert[];
  loading: boolean;
}

export default function AlertsFullscreenPanel({
  open, onClose, alerts, loading,
}: AlertsFullscreenPanelProps) {
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open) return;
    supabase
      .from('members')
      .select('id, name')
      .then(({ data }) => {
        const m = new Map<string, string>();
        (data ?? []).forEach(row => m.set(row.id, row.name));
        setMemberNames(m);
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  async function resolveAlert(id: string) {
    await supabase.from('alerts').update({ resolved: true }).eq('id', id);
  }

  const unresolved = alerts.filter(a => !a.resolved);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alerts-panel-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <header style={{
        flexShrink: 0,
        height: 'var(--topbar-h)',
        minHeight: 52,
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(12px, env(safe-area-inset-right))',
        gap: 12,
        background: 'var(--bg2)',
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close alerts"
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
        <h2 id="alerts-panel-title" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
          Alerts
          {unresolved.length > 0 && (
            <span style={{ fontWeight: 500, color: 'var(--text2)', marginLeft: 8 }}>
              ({unresolved.length})
            </span>
          )}
        </h2>
      </header>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px max(16px, env(safe-area-inset-left)) 24px max(16px, env(safe-area-inset-right))',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 14, padding: 24 }}>Loading…</div>
        ) : unresolved.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '48px 20px',
            color: 'var(--text3)',
            fontSize: 14,
            lineHeight: 1.6,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>All clear</div>
            <div>No active alerts right now.</div>
          </div>
        ) : (
          unresolved.map(alert => (
            <div key={alert.id} style={{ touchAction: 'manipulation' }}>
              <AlertBanner
                alert={alert}
                memberName={alert.member_id ? memberNames.get(alert.member_id) : undefined}
                onResolve={resolveAlert}
                touchFriendly
              />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, marginLeft: 2 }}>
                {formatDate(alert.created_at)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
