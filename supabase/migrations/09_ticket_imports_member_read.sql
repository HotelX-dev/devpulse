-- Members could not resolve standup ticket refs unless they were primary/secondary
-- assignee on the row (tickets_member_own). Standup validates by product + ticket_ref
-- for anyone logging work on org imports — allow read-only SELECT on all imports.

BEGIN;

DROP POLICY IF EXISTS "tickets_member_read_imports" ON ticket_imports;
CREATE POLICY "tickets_member_read_imports" ON ticket_imports
  FOR SELECT USING (get_my_role() = 'member');

COMMIT;
