import Papa from 'papaparse';
import * as XLSX from 'xlsx';
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

/** First sheet of an .xlsx / .xls workbook → CSV text for Papa */
export function workbookBytesToCsv(buffer: ArrayBuffer): string {
  const wb = XLSX.read(buffer, { type: 'array' });
  const name = wb.SheetNames[0];
  if (!name) return '';
  return XLSX.utils.sheet_to_csv(wb.Sheets[name]);
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
  reopened:      'REOPEN',
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

/** Normalize a raw assignee string: strip leading symbols, unify dashes, collapse spaces. */
function normalizeDash(s: string): string {
  return s
    .trim()
    .replace(/^[^\wÀ-ɏ]+/, '') // strip leading non-letter chars (⚠, emojis, etc.)
    .replace(/[–—‒―−﹣－]/g, '-') // en/em/minus variants → hyphen
    .replace(/\s+/g, ' ')
    .trim();
}

/** Variants of assignedToName for member_ticket_map lookup (prefix stripping). */
export function assigneeLookupKeys(raw: string): string[] {
  const t = normalizeDash(raw);
  if (!t) return [];
  const keys: string[] = [t];

  // "HotelX RND - Aaron Lee …" → try suffix after RND -
  const rnd = t.replace(/^[\w\s]*RND\s*-\s*/i, '').trim();
  if (rnd && rnd !== t) keys.push(rnd);

  // "ProductX - Chia" (single dash segment after product-ish prefix)
  const simple = t.replace(/^[\w]+\s*-\s*/, '').trim();
  if (simple && simple !== t && !keys.includes(simple)) keys.push(simple);

  // Deeper strip: keep last " - " segment if it looks like a person name
  const lastSeg = t.split(/\s+-\s+/).pop()?.trim();
  if (lastSeg && lastSeg !== t && !keys.includes(lastSeg)) keys.push(lastSeg);

  return [...new Set(keys)];
}

/**
 * Resolves a raw assignee string to a member ID.
 * First tries member_ticket_map exact lookup, then falls back to matching
 * extracted name keys directly against member names (case-insensitive).
 */
export function lookupMemberId(
  raw: string,
  memberMap: Map<string, string>,
  memberNameMap?: Map<string, string>,
): string | null {
  for (const k of assigneeLookupKeys(raw)) {
    const id = memberMap.get(k);
    if (id) return id;
  }
  if (memberNameMap) {
    for (const k of assigneeLookupKeys(raw)) {
      const id = memberNameMap.get(k.toLowerCase());
      if (id) return id;
    }
  }
  return null;
}

export function parseCSV(
  text: string,
  memberMap: Map<string, string>,
  memberNameMap?: Map<string, string>,
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
    if (row.__typename && row.__typename !== 'IssueExportRow') continue;

    const ticketRef = extractTicketRef(row.issueNo ?? '');
    if (!ticketRef) continue;

    const rawAssignee = (row.assignedToName ?? '').trim();
    const primaryMemberId = lookupMemberId(rawAssignee, memberMap, memberNameMap);

    rows.push({
      ticket_ref:        ticketRef,
      customer_name:     (row.customerName ?? '').trim(),
      module_name:       (row.productModuleName ?? '').trim(),
      description:       (row.description ?? '').trim(),
      is_bug:            parseBool(row.isBug),
      is_enhancement:    parseBool(row.isEnhancement),
      priority:          parseInt(row.priorityLevel, 10) === 2 ? 2 : 1,
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
