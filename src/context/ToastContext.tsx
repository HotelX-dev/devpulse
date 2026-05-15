import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Severity } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';

interface ToastItem {
  id: string;
  message: string;
  severity: Severity;
}

interface ToastContextValue {
  addToast: (message: string, severity?: Severity) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const SEVERITY_STYLES: Record<Severity, { color: string; Icon: LucideIcon }> = {
  HIGH:   { color: 'var(--red)',    Icon: Zap },
  MEDIUM: { color: 'var(--amber)',  Icon: AlertTriangle },
  LOW:    { color: 'var(--accent)', Icon: Info },
};

function ToastCard({
  toast,
  onDismiss,
  isMobile,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  isMobile: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const s = SEVERITY_STYLES[toast.severity];
  const { Icon } = s;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), 200);
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 10,
        background: 'var(--bg2)',
        border: `1px solid ${s.color}44`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
        minWidth: 280,
        maxWidth: isMobile ? 'calc(100vw - 32px)' : 360,
        opacity: visible ? 1 : 0,
        transform: visible
          ? 'none'
          : isMobile ? 'translateY(-10px)' : 'translateX(12px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        pointerEvents: 'auto',
      }}
    >
      <div style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        flexShrink: 0,
        background: `${s.color}18`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
      }}>
        <Icon size={14} color={s.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: s.color,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 3,
        }}>
          New Alert
        </div>
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
          {toast.message}
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss alert"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text3)',
          flexShrink: 0,
          padding: 4,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isMobile = useIsMobile();

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const addToast = useCallback((message: string, severity: Severity = 'MEDIUM') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-2), { id, message, severity }]); // cap at 3
    const timer = setTimeout(() => dismiss(id), 5000);
    timers.current.set(id, timer);
  }, [dismiss]);

  useEffect(() => () => {
    timers.current.forEach(t => clearTimeout(t));
  }, []);

  const stackStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        top: 'calc(var(--topbar-h) + env(safe-area-inset-top, 0px) + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
        alignItems: 'center',
        width: '100%',
      }
    : {
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
        pointerEvents: 'none',
      };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {toasts.length > 0 && (
        <div style={stackStyle} aria-label="Notifications">
          {toasts.map(toast => (
            <ToastCard
              key={toast.id}
              toast={toast}
              onDismiss={dismiss}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
