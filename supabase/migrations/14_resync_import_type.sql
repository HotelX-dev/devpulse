-- Phase 5 — allow a 'db_resync' import type for direct source-DB pulls.
-- Extends the existing CHECK constraints on import_log.import_type and
-- products.last_import_type so the resync Edge Function can audit its runs.

BEGIN;

-- import_log.import_type
ALTER TABLE import_log DROP CONSTRAINT IF EXISTS import_log_import_type_check;
ALTER TABLE import_log ADD CONSTRAINT import_log_import_type_check
  CHECK (import_type IN ('weekly_refresh', 'monthly_close', 'db_resync'));

-- products.last_import_type
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_last_import_type_check;
ALTER TABLE products ADD CONSTRAINT products_last_import_type_check
  CHECK (last_import_type IN ('weekly_refresh', 'monthly_close', 'db_resync'));

COMMIT;
