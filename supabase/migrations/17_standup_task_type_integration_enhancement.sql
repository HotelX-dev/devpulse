-- Add 'Integration' and 'Enhancement' to standup_logs task_type check constraint
ALTER TABLE standup_logs
  DROP CONSTRAINT standup_logs_task_type_check;

ALTER TABLE standup_logs
  ADD CONSTRAINT standup_logs_task_type_check
  CHECK (task_type IN (
    'Ticket','Adhoc','Migration','Bug fix','Performance','Integration','Enhancement','Other'
  ));
