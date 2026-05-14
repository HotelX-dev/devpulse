-- =============================================================
-- DevPulse — Migration: add TO_DEPLOY to ticket_imports status
-- Run in Supabase SQL Editor
-- =============================================================

ALTER TABLE ticket_imports
  DROP CONSTRAINT ticket_imports_status_check;

ALTER TABLE ticket_imports
  ADD CONSTRAINT ticket_imports_status_check
  CHECK (status IN ('OPEN','IN_PROGRESS','QC','NO_ACTION','DEPLOYED','REOPEN','TO_DEPLOY'));
