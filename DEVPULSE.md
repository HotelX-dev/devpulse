# Devpulse — Claude Code Context

> **Tagline:** Your team's heartbeat  
> **Logo initials:** DP  
> **Audience:** Product development managers + dev teams (Malaysia SME context)

---

## How to Use This File

Paste this entire file at the start of any Claude Code session and say:

```
This is the Devpulse CLAUDE.md context. Start Phase [N].
```

Claude Code will pick up exactly where you left off.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend / DB | Supabase (Postgres + Auth + RLS) |
| Scheduled jobs | Supabase Edge Functions + pg_cron |
| Font | DM Sans + DM Mono (Google Fonts) |
| Theme | Slate & Violet · Dark / Light toggle |
| Hosting | Vercel / Netlify / self-host |

---

## Products Tracked

```
HotelX    (code: HOTEL)
MenuX     (code: MENU)
EventX    (code: EVENT)
AccountX  (code: ACCOUNT) — coming soon
```

---

## Roles & Access Matrix

| Feature | Manager (Chia) | Member (Dev/QA) | Management |
|---|---|---|---|
| Dashboard — all products | Full | No | Read-only |
| Dashboard — own tasks | Yes | Own only | No |
| Add / edit task | Yes — past + future dates | Log own only | No |
| Assign task to member | Yes | No | No |
| Import CSV / Excel | Yes | No | No |
| Standup log | Yes | Yes | No |
| Leave log | Yes — manager submits only | No | No |
| Team management | Yes | No | No |
| View team structure | Yes | Read-only | Read-only |
| Alerts & flags | Full | Own only | Yes |
| Dark / light theme toggle | Yes | Yes | Yes |
| Monthly report view | Yes | No | Yes |
| Update ticket status | Yes | No | No |
| Add co-assignees to ticket | Yes | No | No |

---

## Team Structure

```
Leader:              Chia (role: manager)
Senior Programmers:  Syafiq, Aaron, Lum
Programmers:         Hasan, Aina, Azwaar, Madiha, Kai Hao
Total:               9 members
```

---

## Theme — Slate & Violet

### Dark Mode (default)

```css
--bg:           #111118;   /* page background */
--bg2:          #18181F;   /* cards */
--bg3:          #1E1E2A;   /* inputs, inner surfaces */
--bg4:          #2D2A40;   /* hover states */
--accent:       #A78BFA;   /* violet — primary CTA */
--accent-dim:   rgba(167,139,250,0.12);
--accent-dark:  #7C5CDB;   /* hover state */
--pink:         #F472B6;   /* highlights, secondary accent */
--pink-dim:     rgba(244,114,182,0.12);
--green:        #34D399;   /* success / deployed */
--green-dim:    rgba(52,211,153,0.12);
--amber:        #FBBF24;   /* warning / pending */
--amber-dim:    rgba(251,191,36,0.12);
--red:          #F87171;   /* danger / overdue */
--red-dim:      rgba(248,113,113,0.12);
--blue:         #60A5FA;   /* info / in progress */
--blue-dim:     rgba(96,165,250,0.12);
--purple:       #8B5CF6;   /* QC status */
--purple-dim:   rgba(139,92,246,0.12);
--text:         #DDD8F0;   /* primary text */
--text2:        #7B7599;   /* muted text */
--text3:        #4A4668;   /* hint text */
--border:       rgba(167,139,250,0.08);
--border2:      rgba(167,139,250,0.16);
--font-sans:    'DM Sans', system-ui;
--font-mono:    'DM Mono', monospace;
```

### Light Mode

```css
--bg:           #FFFFFF;
--bg2:          #F4F3FA;
--bg3:          #ECEAF5;
--bg4:          #E2DFF2;
--accent:       #7C5CDB;
--accent-dim:   rgba(124,92,219,0.10);
--text:         #1A1730;
--text2:        #6B6589;
--text3:        #9D99B8;
--border:       rgba(124,92,219,0.10);
--border2:      rgba(124,92,219,0.20);
```

### Status Color Mapping

```
OPEN         → --red
IN_PROGRESS  → --blue
QC           → --purple
NO_ACTION    → --text3 (gray)
DEPLOYED     → --green
PENDING      → --amber
BLOCKED      → --red
```

---

## Supabase Schema (Full)

### `members`
```sql
CREATE TABLE members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text UNIQUE NOT NULL,
  role          text NOT NULL CHECK (role IN ('manager','member','management')),
  active        boolean DEFAULT true,
  avatar_color  text DEFAULT '#A78BFA',
  created_at    timestamptz DEFAULT now()
);
```

### `products`
```sql
CREATE TABLE products (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL,   -- HotelX, MenuX, EventX, AccountX
  code  text NOT NULL    -- HOTEL, MENU, EVENT, ACCOUNT
);

-- Seed data
INSERT INTO products (name, code) VALUES
  ('HotelX',   'HOTEL'),
  ('MenuX',    'MENU'),
  ('EventX',   'EVENT'),
  ('AccountX', 'ACCOUNT');
```

### `member_ticket_map`
```sql
-- Maps raw CSV assignedToName strings to internal member IDs
-- Manager configures once, auto-applied on every import
CREATE TABLE member_ticket_map (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_name    text UNIQUE NOT NULL,  -- "HotelX RND - Aaron Lee Jun Sheng"
  member_id   uuid REFERENCES members(id),
  created_at  timestamptz DEFAULT now()
);
```

### `ticket_imports`
```sql
CREATE TABLE ticket_imports (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id           uuid REFERENCES products(id),
  ticket_ref           text,                  -- e.g. HX-4161
  customer_name        text,
  module_name          text,                  -- HMS - Booking, HMS - Front Desk etc.
  description          text,
  is_bug               boolean DEFAULT false,
  is_enhancement       boolean DEFAULT false,
  priority             int CHECK (priority IN (1,2)),
  status               text CHECK (status IN (
                         'OPEN','IN_PROGRESS','QC','NO_ACTION','DEPLOYED','REOPEN'
                       )),
  is_deployed          boolean DEFAULT false,
  raw_assignee         text,                  -- original string from CSV
  primary_member_id    uuid REFERENCES members(id),   -- parsed from raw_assignee
  secondary_assignees  uuid[] DEFAULT '{}',            -- manager adds manually
  total_hours_logged   numeric DEFAULT 0,              -- computed from standup_logs
  created_ts           timestamptz,
  mod_ts               timestamptz,           -- proxy for last action date
  expected_date        date,
  target_date          date,
  imported_month       date,                  -- first day of month this import covers
  imported_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_ticket_imports_product ON ticket_imports(product_id);
CREATE INDEX idx_ticket_imports_status  ON ticket_imports(status);
CREATE INDEX idx_ticket_imports_month   ON ticket_imports(imported_month);
CREATE INDEX idx_ticket_imports_primary ON ticket_imports(primary_member_id);
```

### `standup_logs`
```sql
CREATE TABLE standup_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid REFERENCES members(id) NOT NULL,  -- from auth session, no dropdown
  product_id   uuid REFERENCES products(id),
  date         date NOT NULL DEFAULT CURRENT_DATE,
  task_type    text CHECK (task_type IN (
                 'Ticket','Adhoc','Migration','Bug fix','Performance','Other'
               )),
  yesterday    text,
  today        text,
  blockers     text,
  hours_spent  numeric CHECK (hours_spent >= 0 AND hours_spent <= 24),
  ticket_ref   text,          -- optional link back to ticket_imports.ticket_ref
  created_at   timestamptz DEFAULT now(),
  UNIQUE(member_id, date)     -- one standup per member per day
);

CREATE INDEX idx_standup_member ON standup_logs(member_id);
CREATE INDEX idx_standup_date   ON standup_logs(date);
```

### `tasks`
```sql
CREATE TABLE tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid REFERENCES products(id),
  title        text NOT NULL,
  type         text CHECK (type IN (
                 'Migration','Performance','Bug fix','Infra','Integration','Other'
               )),
  status       text DEFAULT 'Pending' CHECK (status IN (
                 'Pending','In Progress','Blocked','QC','Done'
               )),
  priority     int DEFAULT 1 CHECK (priority IN (1,2)),
  assignees    uuid[] DEFAULT '{}',   -- all assignees; first element = primary
  est_days     numeric,
  actual_days  numeric,
  task_date    date,                  -- can be past or future
  due_date     date,
  remarks      text,
  jira_ref     text,
  created_by   uuid REFERENCES members(id),  -- manager only
  created_at   timestamptz DEFAULT now(),
  closed_at    timestamptz
);

CREATE INDEX idx_tasks_product    ON tasks(product_id);
CREATE INDEX idx_tasks_status     ON tasks(status);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
```

### `leave_log`
```sql
-- Manager submits only — no staff access
CREATE TABLE leave_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid REFERENCES members(id) NOT NULL,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  type          text CHECK (type IN ('Annual Leave','MC','Emergency')),
  reason        text,
  submitted_by  uuid REFERENCES members(id) NOT NULL,  -- always manager
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_leave_member ON leave_log(member_id);
CREATE INDEX idx_leave_dates  ON leave_log(start_date, end_date);
```

### `monthly_snapshot`
```sql
-- Pre-computed by Edge Function on 1st of each month
CREATE TABLE monthly_snapshot (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month              date NOT NULL,             -- first day of month
  product_id         uuid REFERENCES products(id),
  open               int DEFAULT 0,
  reopen             int DEFAULT 0,
  in_progress        int DEFAULT 0,
  qc                 int DEFAULT 0,
  to_deploy          int DEFAULT 0,
  deployed           int DEFAULT 0,
  p1_count           int DEFAULT 0,
  p2_count           int DEFAULT 0,
  bug_count          int DEFAULT 0,
  enhancement_count  int DEFAULT 0,
  tickets_created    int DEFAULT 0,             -- inflow this month
  tickets_closed     int DEFAULT 0,             -- outflow this month
  net_velocity       int DEFAULT 0,             -- closed - created
  avg_inflow_6m      numeric DEFAULT 0,         -- 6-month rolling avg inflow
  avg_outflow_6m     numeric DEFAULT 0,         -- 6-month rolling avg outflow
  net_velocity_6m    numeric DEFAULT 0,         -- used for forecast
  forecast_json      jsonb,                     -- [{month, optimistic, expected, pessimistic}]
  created_at         timestamptz DEFAULT now(),
  UNIQUE(month, product_id)
);
```

### `daily_summary`
```sql
-- Pre-computed by Edge Function at 7PM daily
CREATE TABLE daily_summary (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date          date NOT NULL DEFAULT CURRENT_DATE,
  member_id     uuid REFERENCES members(id),
  submitted     boolean DEFAULT false,
  on_leave      boolean DEFAULT false,
  hours         numeric DEFAULT 0,
  ticket_count  int DEFAULT 0,
  flags         jsonb DEFAULT '[]',
  UNIQUE(date, member_id)
);
```

### `alerts`
```sql
CREATE TABLE alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text CHECK (type IN (
                'MISSING_STANDUP','STALE_TICKET','ADHOC_OVERLOAD','BACKLOG_GROWING'
              )),
  member_id   uuid REFERENCES members(id),
  ticket_id   uuid REFERENCES ticket_imports(id),
  task_id     uuid REFERENCES tasks(id),
  message     text,
  severity    text CHECK (severity IN ('HIGH','MEDIUM','LOW')),
  resolved    boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_alerts_resolved ON alerts(resolved);
CREATE INDEX idx_alerts_type     ON alerts(type);
```

---

## Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_imports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE standup_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summary    ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_snapshot ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM members WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: check if user is on a task
CREATE OR REPLACE FUNCTION is_task_assignee(task_assignees uuid[])
RETURNS boolean AS $$
  SELECT auth.uid() = ANY(task_assignees)
$$ LANGUAGE sql SECURITY DEFINER;

-- MEMBERS table
CREATE POLICY "members_read_all" ON members
  FOR SELECT USING (true);

CREATE POLICY "members_manager_write" ON members
  FOR ALL USING (get_my_role() = 'manager');

-- TICKET IMPORTS
CREATE POLICY "tickets_manager_all" ON ticket_imports
  FOR ALL USING (get_my_role() = 'manager');

CREATE POLICY "tickets_member_own" ON ticket_imports
  FOR SELECT USING (
    get_my_role() = 'member' AND (
      primary_member_id = auth.uid() OR
      auth.uid() = ANY(secondary_assignees)
    )
  );

CREATE POLICY "tickets_management_read" ON ticket_imports
  FOR SELECT USING (get_my_role() = 'management');

-- STANDUP LOGS
CREATE POLICY "standup_member_own" ON standup_logs
  FOR ALL USING (member_id = auth.uid());

CREATE POLICY "standup_manager_all" ON standup_logs
  FOR ALL USING (get_my_role() = 'manager');

-- TASKS
CREATE POLICY "tasks_manager_all" ON tasks
  FOR ALL USING (get_my_role() = 'manager');

CREATE POLICY "tasks_member_assigned" ON tasks
  FOR SELECT USING (
    get_my_role() = 'member' AND
    is_task_assignee(assignees)
  );

CREATE POLICY "tasks_member_log" ON tasks
  FOR UPDATE USING (
    get_my_role() = 'member' AND
    is_task_assignee(assignees)
  )
  WITH CHECK (
    -- members can only update hours, not status
    status = (SELECT status FROM tasks WHERE id = tasks.id)
  );

-- LEAVE LOG
CREATE POLICY "leave_manager_all" ON leave_log
  FOR ALL USING (get_my_role() = 'manager');

CREATE POLICY "leave_member_read_own" ON leave_log
  FOR SELECT USING (member_id = auth.uid());

-- ALERTS
CREATE POLICY "alerts_manager_all" ON alerts
  FOR ALL USING (get_my_role() = 'manager');

CREATE POLICY "alerts_member_own" ON alerts
  FOR SELECT USING (member_id = auth.uid());

CREATE POLICY "alerts_management_read" ON alerts
  FOR SELECT USING (get_my_role() = 'management');

-- MONTHLY SNAPSHOT + DAILY SUMMARY (read-only for all authenticated)
CREATE POLICY "snapshot_read_all" ON monthly_snapshot
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "summary_manager_all" ON daily_summary
  FOR ALL USING (get_my_role() = 'manager');

CREATE POLICY "summary_member_own" ON daily_summary
  FOR SELECT USING (member_id = auth.uid());
```

---

## CSV Import — Column Mapping

```
CSV Column        → DB Column           Notes
---------------------------------------------------------------------------
issueNo           → ticket_ref          e.g. HX-4161 (extract from HYPERLINK formula)
customerName      → customer_name
productModuleName → module_name         HMS - Booking, HMS - Front Desk etc.
description       → description
isBug             → is_bug              boolean
isEnhancement     → is_enhancement      boolean
priorityLevel     → priority            1 or 2
status            → status              OPEN|IN_PROGRESS|QC|NO_ACTION|DEPLOYED
isDeployed        → is_deployed         boolean
assignedToName    → raw_assignee        strip prefix, match via member_ticket_map
createdTs         → created_ts
modTs             → mod_ts              proxy for last action date
expectedDate      → expected_date
targetDate        → target_date
```

### issueNo Extraction

The `issueNo` field contains an Excel HYPERLINK formula:
```
=HYPERLINK("https://home.ifcax.asia/...", "HX-4161")
```
Extract the display text (e.g. `HX-4161`) using regex:
```js
const match = issueNo.match(/"([^"]+)"\s*\)$/);
const ticketRef = match ? match[1] : issueNo;
```

### assignedToName Parsing

Strip prefix patterns and match to `member_ticket_map`:
```js
// Examples:
// "HotelX RND - Aaron Lee Jun Sheng"  → Aaron
// "HotelX RND - Lum Wei Liang"        → Lum
// "HotelX - Chia"                     → Chia
// "HotelX RND Badrul Amin Abdul Jalil" → external (no match)

function parseAssignee(raw) {
  if (!raw) return null;
  // Look up member_ticket_map first
  // If no match found, store as raw_assignee only (external consultant)
}
```

---

## Forecast Model

```
Window: 6-month rolling per product

avg_inflow_6m   = SUM(tickets_created, last 6 months) / 6
avg_outflow_6m  = SUM(tickets_closed,  last 6 months) / 6
net_velocity_6m = avg_outflow_6m - avg_inflow_6m

forecast_month[N] = current_open - (N × net_velocity_6m)

Three forecast lines stored in forecast_json:
  optimistic   = best net_velocity month in last 6
  expected     = net_velocity_6m (rolling average)
  pessimistic  = worst net_velocity month in last 6

Colour coding on chart:
  net > 0  → green  (backlog shrinking)
  net = 0  → amber  (flat)
  net < 0  → red    (backlog growing)
```

---

## Alert & Flag Rules

```
MISSING_STANDUP
  Trigger : member has no standup_log for 2+ consecutive working days
  Skip if : leave_log covers that date for that member
  Severity: MEDIUM → HIGH after 3 days

STALE_TICKET
  Trigger : ticket status is OPEN or IN_PROGRESS
            AND mod_ts has not changed in 7+ days
  Severity: MEDIUM

ADHOC_OVERLOAD
  Trigger : member's adhoc hours > ticket hours in current month
            (calculated from standup_logs task_type grouping)
  Severity: LOW

BACKLOG_GROWING
  Trigger : net_velocity_6m < 0 for 2 consecutive months per product
  Checked : 1st of each month after snapshot computed
  Severity: HIGH
```

---

## Edge Functions Schedule

### 7PM Daily — `daily-standup-check`

```typescript
// Pseudocode
const today = new Date().toISOString().split('T')[0];
const members = await supabase.from('members').select('*').eq('active', true);

for (const member of members) {
  const submitted = await checkStandupSubmitted(member.id, today);
  const onLeave   = await checkOnLeave(member.id, today);

  await supabase.from('daily_summary').upsert({
    date: today,
    member_id: member.id,
    submitted,
    on_leave: onLeave,
  });

  if (!submitted && !onLeave) {
    const streak = await getMissingStreak(member.id);
    if (streak >= 2) {
      await insertAlert('MISSING_STANDUP', member.id, streak >= 3 ? 'HIGH' : 'MEDIUM');
    }
  }
}
```

### 1st of Month — `monthly-snapshot-compute`

```typescript
// Pseudocode
for (const product of products) {
  const thisMonth  = getThisMonthRange();
  const last6      = getLast6MonthsData(product.id);

  const avg_inflow_6m  = average(last6.map(m => m.tickets_created));
  const avg_outflow_6m = average(last6.map(m => m.tickets_closed));
  const net_6m         = avg_outflow_6m - avg_inflow_6m;

  // Forecast next 6 months
  const forecast = Array.from({length: 6}, (_, i) => ({
    month:       addMonths(today, i + 1),
    optimistic:  current_open - ((i+1) * Math.max(...last6.map(m => m.net_velocity))),
    expected:    current_open - ((i+1) * net_6m),
    pessimistic: current_open - ((i+1) * Math.min(...last6.map(m => m.net_velocity))),
  }));

  await supabase.from('monthly_snapshot').upsert({ ...snapshot, forecast_json: forecast });

  // Check BACKLOG_GROWING alert
  const last2 = last6.slice(-2);
  if (last2.every(m => m.net_velocity < 0)) {
    await insertAlert('BACKLOG_GROWING', null, 'HIGH', product.id);
  }
}
```

---

## Multi-Assignee Rules

```
Primary assignee   → parsed from CSV assignedToName on import
Secondary assignees → manager adds manually via ticket detail view
Status updates     → manager only (members cannot change ticket status)
Hours logging      → any assignee can log hours via standup ticket_ref

Member sees ticket in My Task List IF:
  primary_member_id = their ID
  OR their ID is in secondary_assignees[]

Dashboard workload heatmap:
  Hours split across all assignees based on standup_logs
  Each person's total reflects actual hours logged, not split equally
```

---

## React App Structure

```
devpulse/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    -- router + theme provider
│   ├── lib/
│   │   ├── supabase.ts            -- supabase client
│   │   ├── theme.ts               -- CSS variables, theme toggle logic
│   │   └── utils.ts               -- date helpers, formatters
│   ├── hooks/
│   │   ├── useAuth.ts             -- auth state, role detection
│   │   ├── useTheme.ts            -- dark/light toggle, persisted to localStorage
│   │   └── useAlerts.ts           -- real-time alerts subscription
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.tsx        -- DP logo, nav icons, avatar
│   │   │   └── Topbar.tsx         -- title, badge, theme toggle, CTA
│   │   ├── UI/
│   │   │   ├── Badge.tsx          -- status badges
│   │   │   ├── Avatar.tsx         -- member initials circle
│   │   │   ├── MetricCard.tsx     -- KPI cards with top accent bar
│   │   │   ├── AlertBanner.tsx    -- alert rows
│   │   │   └── ProductTabs.tsx    -- HotelX / MenuX / EventX tabs
│   │   └── Charts/
│   │       ├── BarChart.tsx       -- delivery trend + forecast
│   │       ├── PipelineFlow.tsx   -- Backlog → Active → QC → Deploy
│   │       └── HeatmapGrid.tsx    -- team workload heatmap
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── manager/
│   │   │   ├── Dashboard.tsx      -- Phase 4
│   │   │   ├── Import.tsx         -- Phase 3
│   │   │   ├── Tasks.tsx          -- Phase 6
│   │   │   ├── Standup.tsx        -- Phase 5
│   │   │   ├── LeaveLog.tsx       -- Phase 7
│   │   │   └── Team.tsx           -- Phase 9
│   │   ├── member/
│   │   │   ├── MyDashboard.tsx    -- Phase 8
│   │   │   ├── MyTasks.tsx        -- Phase 8
│   │   │   └── Standup.tsx        -- Phase 5
│   │   └── management/
│   │       └── Overview.tsx       -- Phase 11
│   └── types/
│       └── index.ts               -- TypeScript interfaces
├── .env.local                     -- VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├── vite.config.ts
└── package.json
```

---

## Environment Variables

```bash
# .env.local
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## TypeScript Interfaces

```typescript
type Role = 'manager' | 'member' | 'management';
type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'QC' | 'NO_ACTION' | 'DEPLOYED' | 'REOPEN';
type TaskStatus = 'Pending' | 'In Progress' | 'Blocked' | 'QC' | 'Done';
type AlertType = 'MISSING_STANDUP' | 'STALE_TICKET' | 'ADHOC_OVERLOAD' | 'BACKLOG_GROWING';
type LeaveType = 'Annual Leave' | 'MC' | 'Emergency';
type TaskType = 'Ticket' | 'Adhoc' | 'Migration' | 'Bug fix' | 'Performance' | 'Other';

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  avatar_color: string;
  created_at: string;
}

interface Product {
  id: string;
  name: string;   // HotelX, MenuX, EventX, AccountX
  code: string;   // HOTEL, MENU, EVENT, ACCOUNT
}

interface TicketImport {
  id: string;
  product_id: string;
  ticket_ref: string;
  customer_name: string;
  module_name: string;
  description: string;
  is_bug: boolean;
  is_enhancement: boolean;
  priority: 1 | 2;
  status: TicketStatus;
  is_deployed: boolean;
  raw_assignee: string;
  primary_member_id: string | null;
  secondary_assignees: string[];
  total_hours_logged: number;
  created_ts: string;
  mod_ts: string;
  expected_date: string | null;
  target_date: string | null;
  imported_month: string;
  imported_at: string;
}

interface StandupLog {
  id: string;
  member_id: string;
  product_id: string;
  date: string;
  task_type: TaskType;
  yesterday: string;
  today: string;
  blockers: string;
  hours_spent: number;
  ticket_ref: string | null;
  created_at: string;
}

interface Task {
  id: string;
  product_id: string;
  title: string;
  type: string;
  status: TaskStatus;
  priority: 1 | 2;
  assignees: string[];   // uuid[] — first = primary
  est_days: number | null;
  actual_days: number | null;
  task_date: string | null;
  due_date: string | null;
  remarks: string | null;
  jira_ref: string | null;
  created_by: string;
  created_at: string;
  closed_at: string | null;
}

interface LeaveLog {
  id: string;
  member_id: string;
  start_date: string;
  end_date: string;
  type: LeaveType;
  reason: string | null;
  submitted_by: string;
  created_at: string;
}

interface Alert {
  id: string;
  type: AlertType;
  member_id: string | null;
  ticket_id: string | null;
  task_id: string | null;
  message: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  resolved: boolean;
  created_at: string;
}

interface ForecastPoint {
  month: string;
  optimistic: number;
  expected: number;
  pessimistic: number;
}

interface MonthlySnapshot {
  id: string;
  month: string;
  product_id: string;
  open: number;
  reopen: number;
  in_progress: number;
  qc: number;
  to_deploy: number;
  deployed: number;
  p1_count: number;
  p2_count: number;
  bug_count: number;
  enhancement_count: number;
  tickets_created: number;
  tickets_closed: number;
  net_velocity: number;
  avg_inflow_6m: number;
  avg_outflow_6m: number;
  net_velocity_6m: number;
  forecast_json: ForecastPoint[];
}
```

---

## Build Phases

| Phase | What to build | Key files |
|---|---|---|
| **1** | Supabase SQL schema + RLS + seed data | Run SQL in Supabase dashboard |
| **2** | React scaffold — Vite, auth, routing, theme toggle, sidebar | App.tsx, Layout/, useAuth.ts, useTheme.ts |
| **3** | CSV import — upload, parse HYPERLINK + assignedToName, preview, confirm | Import.tsx, lib/csvParser.ts |
| **4** | Manager dashboard — KPIs, product cards, forecast chart, pipeline flow, alerts | Dashboard.tsx, Charts/ |
| **5** | Standup logger — member form (no name dropdown), today's submission view | Standup.tsx |
| **6** | Tasks module — add/edit/assign, past & future dates, multi-assignee | Tasks.tsx |
| **7** | Leave log — manager only, affects standup missing flag | LeaveLog.tsx |
| **8** | Member dashboard — my tasks, my stats, my standup form | member/MyDashboard.tsx |
| **9** | Team management — add/deactivate members, member_ticket_map config | Team.tsx |
| **10** | Supabase Edge Functions — 7PM daily + 1st of month | supabase/functions/ |
| **11** | Management read-only view — stripped dashboard by product | management/Overview.tsx |
| **12** | Polish — responsive, theme toggle, alert toasts, final QA | All |

---

## Key Business Rules

```
1. Standup form — member_id always from auth session, never a dropdown
2. Leave log — only manager can submit, no staff access
3. Ticket status — only manager can update, members log hours only
4. Multi-assignee — CSV sets primary, manager adds secondary manually
5. Forecast — 6-month rolling window, 3 lines (optimistic/expected/pessimistic)
6. Standup missing flag — skipped if leave_log covers that date
7. Tasks — manager can set past or future task_date freely
8. Workload heatmap — hours from standup_logs, split per actual person not equally
9. Import — manager selects product + month before upload, previews before confirm
10. assignedToName parsing — matched via member_ticket_map, unmatched stored as raw only
```

---

## Notes for Claude Code

- Always use `auth.uid()` for member_id — never trust client-supplied member_id
- Use Supabase realtime subscription for alerts (useAlerts hook)
- Theme stored in `localStorage` key `devpulse-theme` — default dark
- DM Sans + DM Mono loaded via Google Fonts in index.html
- All ticket status comparisons are uppercase strings
- `imported_month` is always first day of month: `new Date(year, month, 1)`
- Forecast chart x-axis shows month abbreviations: Jan, Feb, Mar...
- Heatmap intensity: 0h=bg4, 1-15h=low, 16-25h=mid, 26-35h=high, 36h+=heavy
- Avatar initials = first letter of first name + first letter of last name
- Member role guard: wrap manager routes with `useAuth` role check
- CSV parse: skip rows where `__typename !== 'IssueExportRow'`

---

## Import vs Standup — Conflict Resolution

### The Golden Rule

```
┌─────────────────────────────────────────────────┐
│  CSV import  =  official record (source of truth)│
│  Standup log =  daily signal + hours + context   │
│  Never auto-override CSV from standup            │
│  Manager is the only one who updates status      │
└─────────────────────────────────────────────────┘
```

### How Each Conflict Is Handled

**Conflict 1 — Status Mismatch**
```
CSV import says:     HTX-4159 → IN_PROGRESS
Member standup says: "I finished this yesterday, moving to QC"

Resolution:
  Official status: IN_PROGRESS  ← from CSV (source of truth)
  Last standup:    shown as commentary only
  Manager updates status manually — standup never auto-overrides
```

**Conflict 2 — Assignee Mismatch**
```
CSV primary:  Aaron
Standup logs: Lum logs hours against HTX-4159

Resolution:
  Hours attributed to Lum in workload heatmap
  Lum treated as implicit secondary assignee
  Manager can formally add Lum as secondary assignee
```

**Conflict 3 — Hours Gap (Complementary, Not a Conflict)**
```
CSV provides:  ticket existence, status, priority, customer
Standup adds:  actual hours spent, daily progress, blockers

Combined ticket detail view:
  HTX-4159
  Status:      IN_PROGRESS        ← from CSV
  Total hours: 13h                ← Aaron 6h + Lum 4h + Syafiq 3h (standup)
  Last update: "Waiting vendor"   ← from standup log
```

**Conflict 4 — Orphan Standup (Ticket Not Yet Imported)**
```
Member logs standup with ticket ref HTX-4200
CSV for that month not imported yet

Resolution:
  standup_logs.ticket_ref stored as TEXT (not a hard FK)
  Orphan standup saved safely — no error, no data lost
  When CSV is later imported → trigger auto-links retroactively
```

### Schema Addition — `standup_logs`

```sql
-- Add to standup_logs table
linked_ticket_id  uuid REFERENCES ticket_imports(id) NULL,
-- NULL = orphan (ticket not yet imported)
-- Auto-populated by trigger when matching CSV arrives
```

### Auto-Link Trigger

```sql
-- When new ticket_imports row inserted,
-- find matching orphan standup_logs and auto-link
CREATE OR REPLACE FUNCTION link_orphan_standups()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE standup_logs
  SET linked_ticket_id = NEW.id
  WHERE ticket_ref = NEW.ticket_ref
    AND linked_ticket_id IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_ticket_import
  AFTER INSERT ON ticket_imports
  FOR EACH ROW EXECUTE FUNCTION link_orphan_standups();
```
