-- Standup trigger create_blocker_from_standup() INSERTs into blockers as the member.
-- blockers_member_own was SELECT-only; members had no INSERT policy → RLS violation.

BEGIN;

DROP POLICY IF EXISTS "blockers_member_insert_own" ON blockers;
CREATE POLICY "blockers_member_insert_own" ON blockers
  FOR INSERT
  WITH CHECK (member_id = auth.uid());

COMMIT;
