-- Phase 3 — import audit trail + product write policy for manager roles

BEGIN;

CREATE TABLE IF NOT EXISTS import_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid REFERENCES products(id) ON DELETE CASCADE,
  import_type       text NOT NULL CHECK (import_type IN ('weekly_refresh', 'monthly_close')),
  imported_month    date,
  row_count         int NOT NULL,
  matched_count     int NOT NULL,
  unmatched_count   int NOT NULL,
  imported_by       uuid REFERENCES members(id) ON DELETE SET NULL,
  imported_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_log_product ON import_log(product_id);
CREATE INDEX IF NOT EXISTS idx_import_log_at ON import_log(imported_at DESC);

ALTER TABLE import_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_log_manager_all" ON import_log;
CREATE POLICY "import_log_manager_all" ON import_log
  FOR ALL USING (is_manager());

DROP POLICY IF EXISTS "import_log_admin_read" ON import_log;
CREATE POLICY "import_log_admin_read" ON import_log
  FOR SELECT USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "products_manager_write" ON products;
CREATE POLICY "products_manager_write" ON products
  FOR ALL USING (is_manager());

COMMIT;
