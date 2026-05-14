-- =============================================================
-- DevPulse — Phase 1: Row Level Security
-- Run AFTER 01_schema.sql
-- =============================================================

-- ─── ENABLE RLS ──────────────────────────────────────────────
ALTER TABLE members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_ticket_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_imports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE standup_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summary    ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_snapshot ENABLE ROW LEVEL SECURITY;

-- ─── HELPER FUNCTIONS ────────────────────────────────────────

-- Returns the role of the currently authenticated user
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM members WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns true if auth.uid() is in the given assignees array
CREATE OR REPLACE FUNCTION is_task_assignee(task_assignees uuid[])
RETURNS boolean AS $$
  SELECT auth.uid() = ANY(task_assignees)
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── MEMBERS ─────────────────────────────────────────────────
-- Everyone can read members (needed for name resolution in UI)
CREATE POLICY "members_read_all" ON members
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only manager can insert/update/delete members
CREATE POLICY "members_manager_write" ON members
  FOR ALL USING (get_my_role() = 'manager');

-- ─── PRODUCTS ────────────────────────────────────────────────
-- All authenticated users can read products
CREATE POLICY "products_read_all" ON products
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only manager can modify products
CREATE POLICY "products_manager_write" ON products
  FOR ALL USING (get_my_role() = 'manager');

-- ─── MEMBER TICKET MAP ───────────────────────────────────────
-- Manager full access; members read-only (needed for import preview)
CREATE POLICY "mtm_manager_all" ON member_ticket_map
  FOR ALL USING (get_my_role() = 'manager');

CREATE POLICY "mtm_member_read" ON member_ticket_map
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─── TICKET IMPORTS ──────────────────────────────────────────
CREATE POLICY "tickets_manager_all" ON ticket_imports
  FOR ALL USING (get_my_role() = 'manager');

-- Members see only their own tickets (primary or secondary assignee)
CREATE POLICY "tickets_member_own" ON ticket_imports
  FOR SELECT USING (
    get_my_role() = 'member' AND (
      primary_member_id = auth.uid() OR
      auth.uid() = ANY(secondary_assignees)
    )
  );

-- Management (read-only across all tickets)
CREATE POLICY "tickets_management_read" ON ticket_imports
  FOR SELECT USING (get_my_role() = 'management');

-- ─── STANDUP LOGS ────────────────────────────────────────────
-- Members can do everything on their own standup rows
CREATE POLICY "standup_member_own" ON standup_logs
  FOR ALL USING (member_id = auth.uid());

-- Manager can read and manage all standup logs
CREATE POLICY "standup_manager_all" ON standup_logs
  FOR ALL USING (get_my_role() = 'manager');

-- ─── TASKS ───────────────────────────────────────────────────
CREATE POLICY "tasks_manager_all" ON tasks
  FOR ALL USING (get_my_role() = 'manager');

-- Members can see tasks they are assigned to
CREATE POLICY "tasks_member_assigned" ON tasks
  FOR SELECT USING (
    get_my_role() = 'member' AND
    is_task_assignee(assignees)
  );

-- Members can log actual_days on their own tasks only
-- (status field is protected — members cannot change it)
CREATE POLICY "tasks_member_log" ON tasks
  FOR UPDATE USING (
    get_my_role() = 'member' AND
    is_task_assignee(assignees)
  )
  WITH CHECK (
    status = (SELECT t.status FROM tasks t WHERE t.id = tasks.id)
  );

-- ─── LEAVE LOG ───────────────────────────────────────────────
-- Manager full access
CREATE POLICY "leave_manager_all" ON leave_log
  FOR ALL USING (get_my_role() = 'manager');

-- Members can only read their own leave entries
CREATE POLICY "leave_member_read_own" ON leave_log
  FOR SELECT USING (member_id = auth.uid());

-- ─── ALERTS ──────────────────────────────────────────────────
CREATE POLICY "alerts_manager_all" ON alerts
  FOR ALL USING (get_my_role() = 'manager');

-- Members see alerts targeted at them
CREATE POLICY "alerts_member_own" ON alerts
  FOR SELECT USING (member_id = auth.uid());

-- Management can read all alerts (read-only)
CREATE POLICY "alerts_management_read" ON alerts
  FOR SELECT USING (get_my_role() = 'management');

-- ─── MONTHLY SNAPSHOT ────────────────────────────────────────
-- All authenticated users can read snapshots (powers charts)
CREATE POLICY "snapshot_read_all" ON monthly_snapshot
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Edge Functions write via service_role key (bypasses RLS)

-- ─── DAILY SUMMARY ───────────────────────────────────────────
CREATE POLICY "summary_manager_all" ON daily_summary
  FOR ALL USING (get_my_role() = 'manager');

CREATE POLICY "summary_member_own" ON daily_summary
  FOR SELECT USING (member_id = auth.uid());

-- Management can view daily summaries
CREATE POLICY "summary_management_read" ON daily_summary
  FOR SELECT USING (get_my_role() = 'management');
