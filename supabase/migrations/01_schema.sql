-- =============================================================
-- DevPulse — Phase 1: Schema
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================

-- ─── MEMBERS ─────────────────────────────────────────────────
CREATE TABLE members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text UNIQUE NOT NULL,
  role          text NOT NULL CHECK (role IN ('manager','member','management')),
  active        boolean DEFAULT true,
  avatar_color  text DEFAULT '#A78BFA',
  created_at    timestamptz DEFAULT now()
);

-- ─── PRODUCTS ────────────────────────────────────────────────
CREATE TABLE products (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL,
  code  text NOT NULL UNIQUE
);

-- ─── MEMBER TICKET MAP ───────────────────────────────────────
-- Maps raw CSV assignedToName strings → internal member IDs
-- Manager configures once; auto-applied on every import
CREATE TABLE member_ticket_map (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_name    text UNIQUE NOT NULL,
  member_id   uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

-- ─── TICKET IMPORTS ──────────────────────────────────────────
CREATE TABLE ticket_imports (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id           uuid REFERENCES products(id) ON DELETE RESTRICT,
  ticket_ref           text,
  customer_name        text,
  module_name          text,
  description          text,
  is_bug               boolean DEFAULT false,
  is_enhancement       boolean DEFAULT false,
  priority             int CHECK (priority IN (1,2)),
  status               text CHECK (status IN (
                         'OPEN','IN_PROGRESS','QC','NO_ACTION','DEPLOYED','REOPEN','TO_DEPLOY'
                       )),
  is_deployed          boolean DEFAULT false,
  raw_assignee         text,
  primary_member_id    uuid REFERENCES members(id) ON DELETE SET NULL,
  secondary_assignees  uuid[] DEFAULT '{}',
  total_hours_logged   numeric DEFAULT 0,
  created_ts           timestamptz,
  mod_ts               timestamptz,
  expected_date        date,
  target_date          date,
  imported_month       date,
  imported_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_ticket_imports_product ON ticket_imports(product_id);
CREATE INDEX idx_ticket_imports_status  ON ticket_imports(status);
CREATE INDEX idx_ticket_imports_month   ON ticket_imports(imported_month);
CREATE INDEX idx_ticket_imports_primary ON ticket_imports(primary_member_id);

-- ─── STANDUP LOGS ────────────────────────────────────────────
CREATE TABLE standup_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  product_id   uuid REFERENCES products(id) ON DELETE SET NULL,
  date         date NOT NULL DEFAULT CURRENT_DATE,
  task_type    text CHECK (task_type IN (
                 'Ticket','Adhoc','Migration','Bug fix','Performance','Other'
               )),
  yesterday    text,
  today        text,
  blockers     text,
  hours_spent  numeric CHECK (hours_spent >= 0 AND hours_spent <= 24),
  ticket_ref        text,
  linked_ticket_id  uuid REFERENCES ticket_imports(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  UNIQUE(member_id, date)
);

CREATE INDEX idx_standup_member ON standup_logs(member_id);
CREATE INDEX idx_standup_date   ON standup_logs(date);

-- ─── TASKS ───────────────────────────────────────────────────
CREATE TABLE tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid REFERENCES products(id) ON DELETE SET NULL,
  title        text NOT NULL,
  type         text CHECK (type IN (
                 'Migration','Performance','Bug fix','Infra','Integration','Other'
               )),
  status       text DEFAULT 'Pending' CHECK (status IN (
                 'Pending','In Progress','Blocked','QC','Done'
               )),
  priority     int DEFAULT 1 CHECK (priority IN (1,2)),
  assignees    uuid[] DEFAULT '{}',
  est_days     numeric,
  actual_days  numeric,
  task_date    date,
  due_date     date,
  remarks      text,
  jira_ref     text,
  created_by   uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  closed_at    timestamptz
);

CREATE INDEX idx_tasks_product    ON tasks(product_id);
CREATE INDEX idx_tasks_status     ON tasks(status);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);

-- ─── LEAVE LOG ───────────────────────────────────────────────
CREATE TABLE leave_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  type          text CHECK (type IN ('Annual Leave','MC','Emergency')),
  reason        text,
  submitted_by  uuid REFERENCES members(id) ON DELETE SET NULL NOT NULL,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT leave_dates_order CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_member ON leave_log(member_id);
CREATE INDEX idx_leave_dates  ON leave_log(start_date, end_date);

-- ─── MONTHLY SNAPSHOT ────────────────────────────────────────
CREATE TABLE monthly_snapshot (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month              date NOT NULL,
  product_id         uuid REFERENCES products(id) ON DELETE CASCADE,
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
  tickets_created    int DEFAULT 0,
  tickets_closed     int DEFAULT 0,
  net_velocity       int DEFAULT 0,
  avg_inflow_6m      numeric DEFAULT 0,
  avg_outflow_6m     numeric DEFAULT 0,
  net_velocity_6m    numeric DEFAULT 0,
  forecast_json      jsonb,
  created_at         timestamptz DEFAULT now(),
  UNIQUE(month, product_id)
);

-- ─── DAILY SUMMARY ───────────────────────────────────────────
CREATE TABLE daily_summary (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date          date NOT NULL DEFAULT CURRENT_DATE,
  member_id     uuid REFERENCES members(id) ON DELETE CASCADE,
  submitted     boolean DEFAULT false,
  on_leave      boolean DEFAULT false,
  hours         numeric DEFAULT 0,
  ticket_count  int DEFAULT 0,
  flags         jsonb DEFAULT '[]',
  UNIQUE(date, member_id)
);

-- ─── ALERTS ──────────────────────────────────────────────────
CREATE TABLE alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text CHECK (type IN (
                'MISSING_STANDUP','STALE_TICKET','ADHOC_OVERLOAD','BACKLOG_GROWING'
              )),
  member_id   uuid REFERENCES members(id) ON DELETE SET NULL,
  ticket_id   uuid REFERENCES ticket_imports(id) ON DELETE SET NULL,
  task_id     uuid REFERENCES tasks(id) ON DELETE SET NULL,
  message     text,
  severity    text CHECK (severity IN ('HIGH','MEDIUM','LOW')),
  resolved    boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_alerts_resolved ON alerts(resolved);
CREATE INDEX idx_alerts_type     ON alerts(type);
