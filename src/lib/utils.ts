/** Format a date string as "14 May 2026" */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Format a date as relative time — "2 days ago", "just now" */
export function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Return "AB" initials from a name string */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** First day of a given month — used for imported_month */
export function monthStart(year: number, month: number): string {
  return new Date(year, month, 1).toISOString().split('T')[0];
}

/** Month abbreviation for chart x-axis */
export function monthLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-MY', { month: 'short' });
}

/** Join class names, filtering falsy values */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

/** Sort members: owner → admin → member, then A–Z within each role */
export function sortMembers<T extends { role: string; name: string }>(members: T[]): T[] {
  return [...members].sort((a, b) => {
    const roleA = ROLE_ORDER[a.role] ?? 99;
    const roleB = ROLE_ORDER[b.role] ?? 99;
    if (roleA !== roleB) return roleA - roleB;
    return a.name.localeCompare(b.name);
  });
}
