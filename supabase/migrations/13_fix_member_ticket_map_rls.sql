-- Fix member_ticket_map RLS: allow owner/admin full access, all authenticated users can read.
-- The old "mtm_manager_all" policy used get_my_role() = 'manager' which never matches
-- any real role (roles are owner/admin/member). Replace with is_manager().

BEGIN;

DROP POLICY IF EXISTS "mtm_manager_all" ON member_ticket_map;

CREATE POLICY "mtm_manager_all" ON member_ticket_map
  FOR ALL USING (is_manager());

-- mtm_member_read already exists and allows SELECT for any authenticated user — keep it.

COMMIT;
