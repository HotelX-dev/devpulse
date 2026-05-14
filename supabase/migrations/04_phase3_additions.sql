-- =============================================================
-- DevPulse — Phase 3 additions
-- Run in Supabase SQL Editor after 01_schema.sql, 02_rls.sql, 03_seed.sql
-- =============================================================

-- ─── 1. Add TO_DEPLOY to ticket_imports status constraint ─────
ALTER TABLE ticket_imports DROP CONSTRAINT IF EXISTS ticket_imports_status_check;
ALTER TABLE ticket_imports ADD CONSTRAINT ticket_imports_status_check
  CHECK (status IN ('OPEN','IN_PROGRESS','QC','NO_ACTION','DEPLOYED','REOPEN','TO_DEPLOY'));

-- ─── 2. Add linked_ticket_id to standup_logs ──────────────────
-- NULL  = orphan standup (ticket not yet imported)
-- Populated automatically by trigger when matching ticket arrives
ALTER TABLE standup_logs
  ADD COLUMN IF NOT EXISTS linked_ticket_id uuid REFERENCES ticket_imports(id) ON DELETE SET NULL;

-- ─── 3. Auto-link function ────────────────────────────────────
-- When a new ticket_imports row is inserted, find any standup_logs
-- that referenced the same ticket_ref and link them retroactively.
CREATE OR REPLACE FUNCTION link_orphan_standups()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE standup_logs
  SET linked_ticket_id = NEW.id
  WHERE ticket_ref = NEW.ticket_ref
    AND linked_ticket_id IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 4. Trigger on ticket_imports insert ──────────────────────
DROP TRIGGER IF EXISTS on_ticket_import ON ticket_imports;
CREATE TRIGGER on_ticket_import
  AFTER INSERT ON ticket_imports
  FOR EACH ROW EXECUTE FUNCTION link_orphan_standups();
