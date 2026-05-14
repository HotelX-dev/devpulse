import type { Member } from '../../types';

export interface HeatmapEntry {
  member_id: string;
  date: string;  // "YYYY-MM-DD"
}

interface HeatmapGridProps {
  members: Member[];
  entries: HeatmapEntry[];
  month: string;  // "YYYY-MM"
}

function getDaysInMonth(month: string): Date[] {
  const [y, m] = month.split('-').map(Number);
  const days: Date[] = [];
  const d = new Date(y, m - 1, 1);
  while (d.getMonth() === m - 1) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function HeatmapGrid({ members, entries, month }: HeatmapGridProps) {
  if (!month || members.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
        No standup data for this period.
      </div>
    );
  }

  const days = getDaysInMonth(month);

  // Build lookup: "memberId::date" → submitted
  const submitted = new Set(entries.map(e => `${e.member_id}::${e.date}`));

  const CELL = 22;
  const NAME_W = 108;

  // Count submission rate per member for the month
  const workingDays = days.filter(d => d.getDay() !== 0 && d.getDay() !== 6).length;

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Day header */}
      <div style={{ display: 'flex', marginBottom: 4, marginLeft: NAME_W }}>
        {days.map(day => {
          const dow = day.getDay();
          const isWknd = dow === 0 || dow === 6;
          return (
            <div key={day.toISOString()} style={{
              width: CELL, flexShrink: 0, textAlign: 'center',
              fontSize: 9, opacity: isWknd ? 0.3 : 0.7,
              color: 'var(--text3)',
            }}>
              <div>{day.getDate()}</div>
              <div style={{ fontSize: 8 }}>{DAY_ABBR[dow]}</div>
            </div>
          );
        })}
      </div>

      {/* Member rows */}
      {members.map(member => {
        const memberDays = days.filter(d => {
          const dow = d.getDay();
          if (dow === 0 || dow === 6) return false;
          const key = `${member.id}::${d.toISOString().split('T')[0]}`;
          return submitted.has(key);
        }).length;

        const rate = workingDays > 0 ? Math.round((memberDays / workingDays) * 100) : 0;

        return (
          <div key={member.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            {/* Name */}
            <div style={{
              width: NAME_W, flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 7, paddingRight: 8,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: member.avatar_color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 700, color: '#fff',
              }}>
                {member.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {member.name.split(' ')[0]}
                </div>
                <div style={{ fontSize: 9, color: rate >= 80 ? 'var(--green)' : rate >= 50 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>
                  {rate}%
                </div>
              </div>
            </div>

            {/* Day cells */}
            {days.map(day => {
              const dateStr = day.toISOString().split('T')[0];
              const dow = day.getDay();
              const isWknd = dow === 0 || dow === 6;
              const isDone = submitted.has(`${member.id}::${dateStr}`);

              return (
                <div
                  key={dateStr}
                  title={!isWknd ? `${member.name.split(' ')[0]} · ${dateStr} · ${isDone ? 'Submitted' : 'No standup'}` : ''}
                  style={{
                    width: CELL, height: CELL, flexShrink: 0,
                    borderRadius: 3, margin: '0 1px',
                    background: isWknd
                      ? 'transparent'
                      : isDone
                        ? 'var(--green)'
                        : 'var(--bg3)',
                    opacity: isWknd ? 1 : isDone ? 0.75 : 1,
                    border: isWknd ? 'none' : '1px solid var(--border)',
                    transition: 'background 0.15s',
                  }}
                />
              );
            })}
          </div>
        );
      })}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, fontSize: 11, color: 'var(--text3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--green)', opacity: 0.75, border: '1px solid var(--border)' }} />
          Submitted
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--bg3)', border: '1px solid var(--border)' }} />
          No standup
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: 'transparent' }} />
          Weekend
        </div>
      </div>
    </div>
  );
}
