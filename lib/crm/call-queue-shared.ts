import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { desc, eq } from "drizzle-orm";
import { ACTIVITY_LABELS, bhkLabel, CALLER_ACTIVITY_KEYS } from "@/lib/crm/leads";

export type CallQueueNote = {
  id: number;
  type: string;
  label: string;
  notes: string;
  createdAt: string;
  userName: string;
};

export type CallQueueItem = {
  id: number;
  name: string;
  phone: string;
  whatsappNumber: string | null;
  status: string;
  priorityGroup: "overdue" | "due_today" | "new";
  dueIso: string | null;
  requirementLines: string[];
  lastNote: string;
  pastNotes: CallQueueNote[];
  leadAge: string;
  attemptCount: number;
  /**
   * Set by the API when the number is masked because it is outside office
   * hours. The UI uses it to disable Call/WhatsApp rather than dialling a
   * masked string.
   */
  contactHidden?: boolean;
};

/** Notes worth reading before dialling, newest first. */
export const PAST_NOTE_TYPES = new Set<string>([
  ...CALLER_ACTIVITY_KEYS,
  "concern",
  "objection_added",
  "qualification",
  "requirement_changed",
]);

const PAST_NOTE_LIMIT = 10;

const LOCATION_LABELS: Record<string, string> = {
  vasai_west: "Vasai West",
  vasai_east: "Vasai East",
  naigaon: "Naigaon",
  nalasopara: "Nalasopara",
  virar: "Virar",
  other: "Other",
};

const PURPOSE_LABELS: Record<string, string> = {
  self_use: "Self-use",
  investment: "Investment",
  both: "Both",
};

const TIMELINE_LABELS: Record<string, string> = {
  immediate: "Immediate",
  "1_3_months": "1–3 months",
  "3_6_months": "3–6 months",
  "6_plus_months": "6+ months",
  exploring: "Exploring",
};

function budgetLine(l: (typeof schema.leads.$inferSelect)): string {
  if (l.budget) return String(l.budget);
  const min = l.budgetMin;
  const max = l.budgetMax;
  if (min && max && min !== max) return `₹${min}–${max}L`;
  if (min) return `₹${min}L`;
  if (max) return `₹${max}L`;
  return "";
}

export function requirementLines(l: (typeof schema.leads.$inferSelect)): string[] {
  const lines: string[] = [];
  if (l.location) lines.push(`📍 ${LOCATION_LABELS[l.location] || l.location}`);
  if (l.bhk) lines.push(bhkLabel(l.bhk));
  const budget = budgetLine(l);
  if (budget) lines.push(budget);
  if (l.purpose && PURPOSE_LABELS[l.purpose]) lines.push(PURPOSE_LABELS[l.purpose]);
  if (l.timeline && TIMELINE_LABELS[l.timeline]) lines.push(TIMELINE_LABELS[l.timeline]);
  if (l.loanRequired != null) lines.push(l.loanRequired ? "Loan: Yes" : "Loan: No");
  return lines;
}

/** Latest notes for the given leads, newest first. */
export function loadPastNotes(
  db: ReturnType<typeof getDb>,
  leadIds: number[]
): Map<number, CallQueueNote[]> {
  const userNames = new Map<number, string>(
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .all()
      .map((u) => [u.id, u.name])
  );

  const out = new Map<number, CallQueueNote[]>();
  for (const leadId of leadIds) {
    const rows = db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.leadId, leadId))
      .orderBy(desc(schema.activities.createdAt))
      .all()
      .filter((a) => a.notes && a.notes.trim() && PAST_NOTE_TYPES.has(a.type))
      .slice(0, PAST_NOTE_LIMIT)
      .map<CallQueueNote>((a) => ({
        id: a.id,
        type: a.type,
        label: ACTIVITY_LABELS[a.type] || a.type,
        notes: a.notes || "",
        createdAt: a.createdAt,
        userName: userNames.get(a.userId) || "Unknown",
      }));
    if (rows.length > 0) out.set(leadId, rows);
  }
  return out;
}
