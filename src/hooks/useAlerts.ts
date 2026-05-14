import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Alert } from '../types';
import { useAuth } from './useAuth';

export function useAlerts() {
  const { member } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchAlerts() {
    if (!member) return;
    let query = supabase
      .from('alerts')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false });

    // Members only see their own alerts; manager sees all
    if (member.role === 'member') {
      query = query.eq('member_id', member.id);
    }

    const { data } = await query;
    setAlerts(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [member]);

  return { alerts, loading };
}
