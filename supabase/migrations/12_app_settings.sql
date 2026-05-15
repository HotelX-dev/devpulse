-- App-wide key/value settings (managers only)
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Only managers/admins/owners can read or write
CREATE POLICY "settings_manager_read" ON app_settings
  FOR SELECT USING (is_manager());

CREATE POLICY "settings_manager_write" ON app_settings
  FOR ALL USING (is_manager());

-- Seed default empty Discord webhook
INSERT INTO app_settings (key, value)
VALUES ('discord_standup_webhook', '')
ON CONFLICT (key) DO NOTHING;
