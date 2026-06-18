-- Allow members to read all standup_logs and tasks so the Overview page
-- can display team standup status dots and the backlog section.

BEGIN;

-- Standup: members already own their row (ALL via standup_member_own).
-- Add a SELECT-only policy so they can also see other members' standup rows.
DROP POLICY IF EXISTS "standup_member_read_all" ON standup_logs;
CREATE POLICY "standup_member_read_all" ON standup_logs
  FOR SELECT USING (get_my_role() = 'member');

-- Tasks: extend read access beyond just assigned tasks so the Overview
-- backlog section shows the full team backlog (not just the member's tasks).
DROP POLICY IF EXISTS "tasks_member_read_all" ON tasks;
CREATE POLICY "tasks_member_read_all" ON tasks
  FOR SELECT USING (get_my_role() = 'member');

COMMIT;
