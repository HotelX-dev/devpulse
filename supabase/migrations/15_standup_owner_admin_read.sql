-- Allow owner and admin roles to read all standup logs (manager view)
CREATE POLICY "standup_owner_admin_read" ON standup_logs
  FOR SELECT USING (get_my_role() IN ('owner', 'admin'));
