-- Phase 10 additions
-- 1. Fix RLS policies for renamed roles (manager→owner/admin, management→admin)
-- 2. Create blockers table
-- 3. Update alerts type constraint
-- 4. Add staleness columns to products

BEGIN;

-- ── 1. Update get_my_role helper ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM members WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: is current user a manager-level role (owner or admin)
CREATE OR REPLACE FUNCTION is_manager()
RETURNS boolean AS $$
  SELECT role IN ('owner', 'admin') FROM members WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- ── 2. Fix RLS policies on all tables ─────────────────────────────────────────
-- members
DROP POLICY IF EXISTS "members_manager_write" ON members;
CREATE POLICY "members_manager_write" ON members
  FOR ALL USING (is_manager());

-- ticket_imports
DROP POLICY IF EXISTS "tickets_manager_all"      ON ticket_imports;
DROP POLICY IF EXISTS "tickets_management_read"  ON ticket_imports;
CREATE POLICY "tickets_manager_all" ON ticket_imports
  FOR ALL USING (is_manager());
CREATE POLICY "tickets_admin_read" ON ticket_imports
  FOR SELECT USING (get_my_role() = 'admin');

-- standup_logs
DROP POLICY IF EXISTS "standup_manager_all" ON standup_logs;
CREATE POLICY "standup_manager_all" ON standup_logs
  FOR ALL USING (is_manager());

-- tasks
DROP POLICY IF EXISTS "tasks_manager_all" ON tasks;
CREATE POLICY "tasks_manager_all" ON tasks
  FOR ALL USING (is_manager());

-- leave_log
DROP POLICY IF EXISTS "leave_manager_all" ON leave_log;
CREATE POLICY "leave_manager_all" ON leave_log
  FOR ALL USING (is_manager());

-- alerts
DROP POLICY IF EXISTS "alerts_manager_all"      ON alerts;
DROP POLICY IF EXISTS "alerts_management_read"  ON alerts;
CREATE POLICY "alerts_manager_all" ON alerts
  FOR ALL USING (is_manager());

-- daily_summary
DROP POLICY IF EXISTS "summary_manager_all" ON daily_summary;
CREATE POLICY "summary_manager_all" ON daily_summary
  FOR ALL USING (is_manager());

-- ── 3. Blockers table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blockers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standup_log_id  uuid REFERENCES standup_logs(id),
  member_id       uuid REFERENCES members(id),
  product_id      uuid REFERENCES products(id),
  ticket_ref      text,
  description     text NOT NULL,
  action_required text,
  assigned_to     uuid REFERENCES members(id),
  status          text DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  raised_at       date NOT NULL DEFAULT CURRENT_DATE,
  resolved_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blockers_status  ON blockers(status);
CREATE INDEX IF NOT EXISTS idx_blockers_member  ON blockers(member_id);
CREATE INDEX IF NOT EXISTS idx_blockers_product ON blockers(product_id);

ALTER TABLE blockers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blockers_manager_all" ON blockers
  FOR ALL USING (is_manager());

CREATE POLICY "blockers_member_own" ON blockers
  FOR SELECT USING (member_id = auth.uid());

-- ── 4. Update alerts type constraint ─────────────────────────────────────────
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
  CHECK (type IN (
    'MISSING_STANDUP',
    'STALE_TICKET',
    'ADHOC_OVERLOAD',
    'BACKLOG_GROWING',
    'STALE_BLOCKER',
    'TICKET_AGED_CRITICAL',
    'DELIVERY_AT_RISK'
  ));

-- ── 5. Product staleness columns ──────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_imported_at  timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_import_type  text
  CHECK (last_import_type IN ('weekly_refresh', 'monthly_close'));

-- ── 6. daily_summary table (if not created in Phase 1) ───────────────────────
CREATE TABLE IF NOT EXISTS daily_summary (
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

ALTER TABLE daily_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "summary_manager_all_p10" ON daily_summary
  FOR ALL USING (is_manager());

CREATE POLICY "summary_member_own" ON daily_summary
  FOR SELECT USING (member_id = auth.uid());

-- ── 7. monthly_snapshot table (if not created in Phase 1) ────────────────────
CREATE TABLE IF NOT EXISTS monthly_snapshot (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month              date NOT NULL,
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

ALTER TABLE monthly_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snapshot_read_all" ON monthly_snapshot;
CREATE POLICY "snapshot_read_all" ON monthly_snapshot
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "snapshot_manager_write" ON monthly_snapshot
  FOR ALL USING (is_manager());

-- ── 8. Auto-create blocker from standup (trigger) ────────────────────────────
CREATE OR REPLACE FUNCTION create_blocker_from_standup()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.blockers IS NOT NULL AND trim(NEW.blockers) <> '' THEN
    INSERT INTO blockers (standup_log_id, member_id, product_id, ticket_ref, description)
    VALUES (NEW.id, NEW.member_id, NEW.product_id, NEW.ticket_ref, NEW.blockers)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_standup_blocker ON standup_logs;
CREATE TRIGGER on_standup_blocker
  AFTER INSERT ON standup_logs
  FOR EACH ROW EXECUTE FUNCTION create_blocker_from_standup();

COMMIT;
