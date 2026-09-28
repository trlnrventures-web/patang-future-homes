import { NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { formatLeadAge } from "@/lib/crm/sla";
import { istToday, istDayRange } from "@/lib/crm/reports";
import { ACTIVITY_LABELS, bhkLabel, CALLER_ACTIVITY_KEYS, isInCallerScope } from "@/lib/crm/leads";

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
};

const PAST_NOTE_TYPES = new Set<string>([
  ...CALLER_ACTIVITY_KEYS,
  "concern",
  "objection_added",
  "qualification",
  "requirement_changed",
]);

const PAST_NOTE_LIMIT = 10;

const TERMINAL = new Set(["invalid", "lost", "dnc", "booked"]);

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

function requirementLines(l: (typeof schema.leads.$inferSelect)): string[] {
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

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "caller") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const now = new Date();
  const date = istToday();
  const { from, to } = istDayRange(date);

  const myLeads = db
    .select()
    .from(schema.leads)
    .where(isNull(schema.leads.deletedAt))
    .all()
    .filter(isInCallerScope);

  const active = myLeads.filter((l) => !TERMINAL.has(l.status));

  const dueIsoFor = (l: (typeof schema.leads.$inferSelect)): string | null =>
    l.nextFollowUp || l.nextAttemptAt || null;

  const pendingFollowUps = db
    .select()
    .from(schema.followUps)
    .where(eq(schema.followUps.status, "pending"))
    .all()
    .filter((f) => active.some((l) => l.id === f.leadId));

  const overdueIds = new Set<number>();
  const dueTodayMap = new Map<number, string>();
  for (const l of active) {
    const due = dueIsoFor(l);
    if (due && new Date(due).getTime() < now.getTime()) {
      overdueIds.add(l.id);
    }
  }
  for (const f of pendingFollowUps) {
    if (f.scheduledFor && f.scheduledFor >= from && f.scheduledFor < to && !overdueIds.has(f.leadId)) {
      const existing = dueTodayMap.get(f.leadId);
      if (!existing || f.scheduledFor < existing) dueTodayMap.set(f.leadId, f.scheduledFor);
    }
  }

  const userNames = new Map<number, string>(
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .all()
      .map((u) => [u.id, u.name])
  );

  const pastNotesByLead = new Map<number, CallQueueNote[]>();
  for (const l of active) {
    const rows = db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.leadId, l.id))
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
    if (rows.length > 0) pastNotesByLead.set(l.id, rows);
  }

  const queueItem = (
    l: (typeof schema.leads.$inferSelect),
    group: CallQueueItem["priorityGroup"],
    dueIso: string | null
  ): CallQueueItem => {
    const pastNotes = pastNotesByLead.get(l.id) || [];
    return {
      id: l.id,
      name: l.name,
      phone: l.phone,
      whatsappNumber: l.whatsappNumber,
      status: l.status,
      priorityGroup: group,
      dueIso,
      requirementLines: requirementLines(l),
      lastNote: pastNotes[0]?.notes || "",
      pastNotes,
      leadAge: formatLeadAge(l.createdAt),
      attemptCount: l.attemptCount ?? 0,
    };
  };

  const overdue: CallQueueItem[] = [];
  const dueToday: CallQueueItem[] = [];
  const fresh: CallQueueItem[] = [];

  for (const l of active) {
    if (overdueIds.has(l.id)) {
      overdue.push(queueItem(l, "overdue", dueIsoFor(l)));
    } else if (dueTodayMap.has(l.id)) {
      dueToday.push(queueItem(l, "due_today", dueTodayMap.get(l.id)!));
    } else {
      fresh.push(queueItem(l, "new", null));
    }
  }

  overdue.sort((a, b) => (a.dueIso || "").localeCompare(b.dueIso || ""));
  dueToday.sort((a, b) => (a.dueIso || "").localeCompare(b.dueIso || ""));
  fresh.sort((a, b) => a.id - b.id);

  return NextResponse.json({ queue: [...overdue, ...dueToday, ...fresh] });
}