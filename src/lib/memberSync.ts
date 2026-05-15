import { supabase } from './supabase';
import { lookupMemberId, assigneeLookupKeys } from './csvParser';

interface SyncResult {
  scanned: number;
  updated: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Re-scans all ticket_imports rows where primary_member_id IS NULL and
 * raw_assignee is non-empty, then writes the resolved member ID.
 * Tries member_ticket_map first, then falls back to direct member name matching.
 */
export async function resyncMemberAssignees(): Promise<SyncResult> {
  const [{ data: mapRows }, { data: memberRows }, { data: tickets }] = await Promise.all([
    supabase.from('member_ticket_map').select('raw_name, member_id'),
    supabase.from('members').select('id, name').eq('active', true),
    supabase
      .from('ticket_imports')
      .select('id, raw_assignee')
      .is('primary_member_id', null)
      .neq('raw_assignee', '')
      .neq('raw_assignee', 'null'),
  ]);

  const memberMap = new Map<string, string>();
  for (const r of mapRows ?? []) {
    if (r.member_id) {
      // Normalize the stored key so it matches normalized lookup keys
      for (const k of assigneeLookupKeys(r.raw_name)) {
        memberMap.set(k, r.member_id);
      }
      memberMap.set(r.raw_name.trim(), r.member_id);
    }
  }

  const memberNameMap = new Map<string, string>();
  for (const m of memberRows ?? []) {
    memberNameMap.set(m.name.toLowerCase(), m.id);
  }

  // Debug: log map keys and first few ticket raw values to browser console
  console.log('[memberSync] memberMap keys:', [...memberMap.keys()].slice(0, 10));
  console.log('[memberSync] first ticket raw_assignees:', (tickets ?? []).slice(0, 5).map(t => ({
    raw: t.raw_assignee,
    codes: [...t.raw_assignee].map(c => c.charCodeAt(0).toString(16)).join(' '),
  })));

  const updates: { id: string; primary_member_id: string }[] = [];
  for (const t of tickets ?? []) {
    const resolved = lookupMemberId(t.raw_assignee, memberMap, memberNameMap);
    if (resolved) updates.push({ id: t.id, primary_member_id: resolved });
  }

  for (const batch of chunk(updates, 20)) {
    await Promise.all(
      batch.map(u =>
        supabase
          .from('ticket_imports')
          .update({ primary_member_id: u.primary_member_id })
          .eq('id', u.id)
      )
    );
  }

  return { scanned: (tickets ?? []).length, updated: updates.length };
}
