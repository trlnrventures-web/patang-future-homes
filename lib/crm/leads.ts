import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./schema";

const FINAL_LEAD_STATUSES = new Set(["booked", "lost", "invalid", "dnc", "no_response"]);

/** Statuses a caller still owns/qualifies even after an SM is attached. */
export const CALLER_SCOPE_STATUSES = new Set([
  "new",
  "calling",
  "connected",
  "qualified",
  "no_response",
  "nurture",
]);

/**
 * A lead is a caller's primary responsibility when it is unassigned to an SM
 * (still being qualified) OR it is still in the qualification pipeline even
 * though an SM may already be attached.
 */
export function isInCallerScope(l: { status: string; assignedSmId: number | null }): boolean {
  return l.assignedSmId == null || CALLER_SCOPE_STATUSES.has(l.status);
}

export type CrmDb = ReturnType<typeof getDb>;

/** Earliest pending scheduled follow-up per lead, keyed by leadId. */
export function buildEarliestFollowUpMap(db: CrmDb): Map<number, string> {
  const map = new Map<number, string>();
  const rows = db
    .select()
    .from(schema.followUps)
    .where(eq(schema.followUps.status, "pending"))
    .all();
  for (const f of rows) {
    if (!f.scheduledFor) continue;
    const existing = map.get(f.leadId);
    if (!existing || f.scheduledFor < existing) {
      map.set(f.leadId, f.scheduledFor);
    }
  }
  return map;
}

export function resolveDefaultCallerId(
  db: CrmDb,
  opts: { preferredId?: number | null } = {}
): number | null {
  const callers = db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.role, "caller"), eq(schema.users.active, true)))
    .orderBy(schema.users.id)
    .all();

  if (callers.length === 0) return null;

  if (opts.preferredId != null && callers.some((c) => c.id === opts.preferredId)) {
    return opts.preferredId;
  }

  const allLeads = db.select().from(schema.leads).all();
  const openCounts = new Map(callers.map((c) => [c.id, 0]));
  for (const lead of allLeads) {
    if (lead.assignedCallerId != null && openCounts.has(lead.assignedCallerId)) {
      if (!FINAL_LEAD_STATUSES.has(lead.status)) {
        openCounts.set(lead.assignedCallerId, openCounts.get(lead.assignedCallerId)! + 1);
      }
    }
  }

  const sorted = [...callers].sort((a, b) => {
    const diff = (openCounts.get(a.id) ?? 0) - (openCounts.get(b.id) ?? 0);
    return diff !== 0 ? diff : a.id - b.id;
  });
  return sorted[0].id;
}

export const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "calling", label: "Calling" },
  { value: "connected", label: "Connected" },
  { value: "qualified", label: "Qualified" },
  { value: "assigned", label: "Assigned" },
  { value: "follow_up", label: "Follow-up" },
  { value: "visit_proposed", label: "Visit Proposed" },
  { value: "visit_booked", label: "Visit Booked" },
  { value: "visit_confirmed", label: "Visit Confirmed" },
  { value: "visit_done", label: "Visit Done" },
  { value: "negotiation", label: "Negotiation" },
  { value: "booked", label: "Booked" },
  { value: "nurture", label: "Nurture" },
  { value: "lost", label: "Lost" },
  { value: "invalid", label: "Invalid" },
  { value: "dnc", label: "DNC" },
  { value: "no_response", label: "No Response" },
] as const;

export const LEAD_STATUS_LABELS: Record<string, string> =
  Object.fromEntries(LEAD_STATUSES.map((s) => [s.value, s.label]));

export const LEAD_STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  calling: "bg-amber-100 text-amber-800",
  connected: "bg-orange-100 text-orange-800",
  qualified: "bg-emerald-100 text-emerald-800",
  assigned: "bg-violet-100 text-violet-800",
  follow_up: "bg-yellow-100 text-yellow-800",
  visit_proposed: "bg-cyan-100 text-cyan-800",
  visit_booked: "bg-teal-100 text-teal-800",
  visit_confirmed: "bg-teal-200 text-teal-900",
  visit_done: "bg-sky-100 text-sky-800",
  negotiation: "bg-fuchsia-100 text-fuchsia-800",
  booked: "bg-green-100 text-green-800",
  nurture: "bg-indigo-100 text-indigo-800",
  lost: "bg-red-100 text-red-800",
  invalid: "bg-gray-100 text-gray-600",
  dnc: "bg-gray-200 text-gray-700",
  no_response: "bg-slate-100 text-slate-700",
};

export const LEAD_LOST_REASONS = [
  { value: "budget", label: "Budget" },
  { value: "location", label: "Location" },
  { value: "project", label: "Project" },
  { value: "bhk", label: "BHK" },
  { value: "possession", label: "Possession" },
  { value: "family", label: "Family" },
  { value: "loan", label: "Loan" },
  { value: "bought_elsewhere", label: "Bought Elsewhere" },
  { value: "not_reachable", label: "Not Reachable" },
  { value: "not_interested", label: "Not Interested" },
  { value: "duplicate", label: "Duplicate" },
  { value: "other", label: "Other" },
] as const;

export function lostReasonLabel(value: string): string {
  return LEAD_LOST_REASONS.find((r) => r.value === value)?.label ?? value;
}

const LOST_REASON_MARKER_RE = /\[Lost reason: ([^\]]+)\]/;

export function getLeadLostReason(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(LOST_REASON_MARKER_RE);
  return m ? m[1] : null;
}

export function setLeadLostReasonInNotes(notes: string | null | undefined, value: string): string {
  const label = lostReasonLabel(value);
  const marker = `[Lost reason: ${label}]`;
  const rest = (notes || "").replace(LOST_REASON_MARKER_RE, "").trim();
  return rest ? `${marker} ${rest}` : marker;
}

export const ACTIVITY_LABELS: Record<string, string> = {
  call: "Call made",
  call_connected: "Call connected",
  call_no_answer: "No answer",
  call_busy: "Busy",
  call_wrong_number: "Wrong number",
  call_back: "Call back scheduled",
  call_not_interested: "Not interested",
  call_other: "Call - Other outcome",
  whatsapp: "WhatsApp",
  note: "Note added",
  status_change: "Status changed",
  qualification: "Qualification captured",
  assignment: "Assigned to SM",
  follow_up: "Follow-up",
  follow_up_completed: "Follow-up done",
  visit_proposed: "Visit proposed",
  visit_booked: "Visit booked",
  visit_confirmed: "Visit confirmed",
  visit_done: "Visit done",
  visit_no_show: "No show",
  visit_cancelled: "Visit cancelled",
  post_visit_feedback: "Post-visit feedback",
  booking: "Booking",
  booking_created: "Booking initiated",
  booking_confirmed: "Booking confirmed",
  booking_cancelled: "Booking cancelled",
  negotiation_started: "Moved to negotiation",
  negotiation_updated: "Negotiation updated",
  negotiation_lost: "Negotiation lost",
  objection_added: "Objection added",
  competing_project: "Competing project",
  alternative_selected: "Alternative property selected",
  concern: "Concern recorded",
  message_generated: "Message generated",
  message_copied: "Message copied",
  message_whatsapp_opened: "WhatsApp opened",
  requirement_changed: "Requirement changed",
  tag_generated: "Lead tag generated",
  tag_copied: "Lead tag copied",
};

export const LEAD_STATUS_GROUPS: { label: string; values: string[] }[] = [
  {
    label: "Early",
    values: ["new", "calling", "connected", "no_response"],
  },
  {
    label: "Mid",
    values: ["qualified", "assigned", "follow_up", "nurture"],
  },
  {
    label: "Late",
    values: [
      "visit_proposed", "visit_booked", "visit_confirmed", "visit_done",
      "negotiation", "booked",
    ],
  },
  {
    label: "Exit",
    values: ["lost", "invalid", "dnc"],
  },
];

export function leadStatusGroupLabel(status: string): string {
  for (const g of LEAD_STATUS_GROUPS) {
    if (g.values.includes(status)) return g.label;
  }
  return "";
}

export function bhkLabel(v: string | null | undefined): string {
  if (!v) return "";
  const n = String(v).replace(/\s*BHK\s*$/i, "").trim();
  if (!n) return "";
  return /^\d+$/.test(n) ? `${n} BHK` : n;
}

export const CALLER_ACTIVITY_KEYS = [
  "call",
  "call_connected",
  "call_no_answer",
  "call_busy",
  "call_wrong_number",
  "call_back",
  "whatsapp",
  "note",
];

export const SM_ACTIVITY_KEYS = [
  "call",
  "call_connected",
  "call_no_answer",
  "whatsapp",
  "note",
  "follow_up",
  "visit_proposed",
  "visit_booked",
  "visit_confirmed",
  "visit_done",
  "post_visit_feedback",
  "booking",
  "booking_created",
  "booking_confirmed",
  "booking_cancelled",
  "negotiation_started",
  "negotiation_updated",
  "negotiation_lost",
  "objection_added",
  "competing_project",
  "alternative_selected",
];