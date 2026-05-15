-- Phase feature gap: Delivery Commitment Tracker
-- Adds committed_date + actual_delivery to tasks table
-- Trigger locks committed_date on first due_date set and records actual_delivery on Done

BEGIN;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS committed_date  date;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_delivery date;

-- Back-fill committed_date for existing tasks that already have a due_date
UPDATE tasks SET committed_date = due_date WHERE committed_date IS NULL AND due_date IS NOT NULL;

-- Back-fill actual_delivery for tasks already closed
UPDATE tasks SET actual_delivery = closed_at::date WHERE actual_delivery IS NULL AND closed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION lock_committed_date()
RETURNS TRIGGER AS $$
BEGIN
  -- Set committed_date once when due_date is first provided
  IF (OLD.committed_date IS NULL) AND (NEW.due_date IS NOT NULL) THEN
    NEW.committed_date = NEW.due_date;
  END IF;
  -- Record actual delivery date when task transitions to Done
  IF NEW.status = 'Done' AND OLD.status <> 'Done' AND NEW.actual_delivery IS NULL THEN
    NEW.actual_delivery = CURRENT_DATE;
  END IF;
  -- Clear actual_delivery if re-opened from Done
  IF OLD.status = 'Done' AND NEW.status <> 'Done' THEN
    NEW.actual_delivery = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_committed_date ON tasks;
CREATE TRIGGER set_committed_date
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION lock_committed_date();

COMMIT;
