-- Backlog items synced from the "HotelX Tech Capacity Planning" Google Sheet
-- (Backlog tab). Replaces the tasks-based "Upcoming Features" list on the
-- management Overview. Populated by `npm run sync:backlog`.

CREATE TABLE IF NOT EXISTS backlog_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_index        int,                 -- row order from the sheet
  app               text,                -- sheet "App" (HotelX/MenuX/EventX/AccountX)
  product_id        uuid REFERENCES products(id) ON DELETE SET NULL,
  category          text,
  task              text,
  requested_by      text,
  priority          text,
  status            text,
  pct_complete      numeric,
  owner             text,
  ai_substitutable  text,
  effort_wo_ai      numeric,
  effort_w_ai       numeric,
  productivity_gain numeric,
  delivery_bucket   text,
  target_start      text,
  target_end        text,
  date_added        text,
  last_updated      text,
  remarks           text,
  synced_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backlog_product ON backlog_items(product_id);
CREATE INDEX IF NOT EXISTS idx_backlog_sort    ON backlog_items(sort_index);

ALTER TABLE backlog_items ENABLE ROW LEVEL SECURITY;

-- Managers/admins/owners can read + write (Overview is owner/admin).
DROP POLICY IF EXISTS "backlog_manager_all" ON backlog_items;
CREATE POLICY "backlog_manager_all" ON backlog_items
  FOR ALL USING (is_manager());
