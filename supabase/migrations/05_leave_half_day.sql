-- Phase 7 addition: half-day leave support
ALTER TABLE leave_log
  ADD COLUMN IF NOT EXISTS is_half_day     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS half_day_period text    CHECK (half_day_period IN ('AM', 'PM'));

-- half_day_period is only meaningful when is_half_day = true and start_date = end_date
ALTER TABLE leave_log
  ADD CONSTRAINT leave_half_day_check
    CHECK (
      (is_half_day = false AND half_day_period IS NULL)
      OR
      (is_half_day = true  AND half_day_period IS NOT NULL AND start_date = end_date)
    );
