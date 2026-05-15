export type ImportType = 'weekly_refresh' | 'monthly_close';

export type Role = 'owner' | 'admin' | 'member';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'QC' | 'NO_ACTION' | 'DEPLOYED' | 'REOPEN' | 'TO_DEPLOY';
export type TaskStatus = 'Pending' | 'In Progress' | 'Blocked' | 'QC' | 'Done';
export type AlertType =
  | 'MISSING_STANDUP'
  | 'STALE_TICKET'
  | 'ADHOC_OVERLOAD'
  | 'BACKLOG_GROWING'
  | 'STALE_BLOCKER'
  | 'TICKET_AGED_CRITICAL'
  | 'DELIVERY_AT_RISK';

export interface Blocker {
  id: string;
  standup_log_id: string | null;
  member_id: string;
  product_id: string | null;
  ticket_ref: string | null;
  description: string;
  action_required: string | null;
  assigned_to: string | null;
  status: 'Open' | 'In Progress' | 'Resolved';
  raised_at: string;
  resolved_at: string | null;
  created_at: string;
}
export type LeaveType = 'Annual Leave' | 'MC' | 'Emergency';
export type TaskType = 'Ticket' | 'Adhoc' | 'Migration' | 'Bug fix' | 'Performance' | 'Other';
export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  avatar_color: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  last_imported_at?: string | null;
  last_import_type?: ImportType | null;
}

export interface TicketImport {
  id: string;
  product_id: string;
  ticket_ref: string;
  customer_name: string;
  module_name: string;
  description: string;
  is_bug: boolean;
  is_enhancement: boolean;
  priority: 1 | 2;
  status: TicketStatus;
  is_deployed: boolean;
  raw_assignee: string;
  primary_member_id: string | null;
  secondary_assignees: string[];
  total_hours_logged: number;
  created_ts: string;
  mod_ts: string;
  expected_date: string | null;
  target_date: string | null;
  imported_month: string;
  imported_at: string;
}

export interface StandupLog {
  id: string;
  member_id: string;
  product_id: string;
  date: string;
  task_type: TaskType;
  yesterday: string;
  today: string;
  blockers: string;
  hours_spent: number;
  ticket_ref: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  product_id: string;
  title: string;
  type: string;
  status: TaskStatus;
  priority: 1 | 2;
  assignees: string[];
  est_days: number | null;
  actual_days: number | null;
  task_date: string | null;
  due_date: string | null;
  remarks: string | null;
  jira_ref: string | null;
  created_by: string;
  created_at: string;
  closed_at: string | null;
  committed_date: string | null;
  actual_delivery: string | null;
}

export interface LeaveLog {
  id: string;
  member_id: string;
  start_date: string;
  end_date: string;
  type: LeaveType;
  reason: string | null;
  submitted_by: string;
  is_half_day: boolean;
  half_day_period: 'AM' | 'PM' | null;
  created_at: string;
}

export interface Alert {
  id: string;
  type: AlertType;
  member_id: string | null;
  ticket_id: string | null;
  task_id: string | null;
  message: string;
  severity: Severity;
  resolved: boolean;
  created_at: string;
}

export interface ForecastPoint {
  month: string;
  optimistic: number;
  expected: number;
  pessimistic: number;
}

export interface MemberTicketMap {
  id: string;
  raw_name: string;
  member_id: string | null;
  created_at: string;
}

export interface MonthlySnapshot {
  id: string;
  month: string;
  product_id: string;
  open: number;
  reopen: number;
  in_progress: number;
  qc: number;
  to_deploy: number;
  deployed: number;
  p1_count: number;
  p2_count: number;
  bug_count: number;
  enhancement_count: number;
  tickets_created: number;
  tickets_closed: number;
  net_velocity: number;
  avg_inflow_6m: number;
  avg_outflow_6m: number;
  net_velocity_6m: number;
  forecast_json: ForecastPoint[];
}
