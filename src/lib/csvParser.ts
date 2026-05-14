import Papa from 'papaparse';
import type { TicketStatus } from '../types';

export interface ParsedTicket {
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
  assignee_matched: boolean;
  created_ts: string | null;
  mod_ts: string | null;
  expected_date: string | null;
  target_date: string | null;
}

// Handles: =HYPERLINK("https://...", "HX-4161")  or  just  HX-4161
function extractTicketRef(raw: string): string {
  if (!raw) return '';
  const match = raw.match(/"([^"]+)"\s*\)$/);
  return match ? match[1].trim() : raw.trim();
}

const STATUS_MAP: Record<string, TicketStatus> = {
  open:          'OPEN',
  in_progress:   'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  qc:            'QC',
  no_action:     'NO_ACTION',
  'no action':   'NO_ACTION',
  deployed:      'DEPLOYED',
  reopen:        'REOPEN',
  reopened:      'REOPEN',   // CSV variant
  to_deploy:     'TO_DEPLOY',
  'to deploy':   'TO_DEPLOY',
  todeploy:      'TO_DEPLOY',
};

function normalizeStatus(raw: string): TicketStatus {
  const key = (raw ?? '').toLowerCase().trim();
  return STATUS_MAP[key] ?? (raw.toUpperCase() as TicketStatus) ?? 'OPEN';
}

function parseBool(val: string | undefined): boolean {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function parseISODate(val: string | undefined): string | null {
  if (!val || val.trim() === '') return null;
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseCSV(
  text: string,
  memberMap: Map<string, string>,  // raw_name → member_id
): ParsedTicket[] {
  const { data, errors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  });

  if (errors.length > 0) {
    console.warn('CSV parse warnings:', errors.slice(0, 5));
  }

  const rows: ParsedTicket[] = [];

  for (const row of data) {
    // Skip non-ticket rows (GraphQL export artifact)
    if (row.__typename && row.__typename !== 'IssueExportRow') continue;

    const ticketRef = extractTicketRef(row.issueNo ?? '');
    if (!ticketRef) continue; // skip blank rows

    const rawAssignee = (row.assignedToName ?? '').trim();
    const primaryMemberId = memberMap.get(rawAssignee) ?? null;

    rows.push({
      ticket_ref:        ticketRef,
      customer_name:     (row.customerName ?? '').trim(),
      module_name:       (row.productModuleName ?? '').trim(),
      description:       (row.description ?? '').trim(),
      is_bug:            parseBool(row.isBug),
      is_enhancement:    parseBool(row.isEnhancement),
      priority:          parseInt(row.priorityLevel) === 2 ? 2 : 1,
      status:            normalizeStatus(row.status ?? ''),
      is_deployed:       parseBool(row.isDeployed),
      raw_assignee:      rawAssignee,
      primary_member_id: primaryMemberId,
      assignee_matched:  !!primaryMemberId,
      created_ts:        parseISODate(row.createdTs),
      mod_ts:            parseISODate(row.modTs),
      expected_date:     parseISODate(row.expectedDate),
      target_date:       parseISODate(row.targetDate),
    });
  }

  return rows;
}
