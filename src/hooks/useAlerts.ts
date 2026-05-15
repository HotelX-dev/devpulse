import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Alert } from '../types';
import { useAuth } from './useAuth';

export function useAlerts() {
  const { member } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestNewAlert, setLatestNewAlert] = useState<Alert | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!member) return;
    let query = supabase
      .from('alerts')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false });

    if (member.role === 'member') {
      query = query.eq('member_id', member.id);
    }

    const { data } = await query;
    setAlerts(data ?? []);
    setLoading(false);
  }, [member]);

  useEffect(() => {
    fetchAlerts();

    // Unique name per effect invocation prevents StrictMode double-mount collisions
    const channelName = `alerts-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
        fetchAlerts();
        if (payload.eventType === 'INSERT' && payload.new) {
          setLatestNewAlert(payload.new as Alert);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [fetchAlerts]);

  return { alerts, loading, latestNewAlert };
}
