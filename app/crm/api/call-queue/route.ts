import { NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, isNull } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { formatLeadAge } from "@/lib/crm/sla";
import { istToday, istDayRange } from "@/lib/crm/reports";
import { isInCallerScope } from "@/lib/crm/leads";
import { loadPastNotes, requirementLines } from "@/lib/crm/call-queue-shared";
import type { CallQueueItem } from "@/lib/crm/call-queue-shared";
import {
  contactMaskFor,
  maskPhone,
  describeMasking,
} from "@/lib/crm/office-hours";

export type { CallQueueItem, CallQueueNote } from "@/lib/crm/call-queue-shared";

const TERMINAL = new Set(["invalid", "lost", "dnc", "booked"]);

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
  const decision = contactMaskFor(user);

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

  const pastNotesByLead = loadPastNotes(
    db,
    active.map((l) => l.id)
  );

  const queueItem = (
    l: (typeof schema.leads.$inferSelect),
    group: CallQueueItem["priorityGroup"],
    dueIso: string | null
  ): CallQueueItem => {
    const pastNotes = pastNotesByLead.get(l.id) || [];
    return {
      id: l.id,
      name: l.name,
      // Masked server-side outside office hours: the queue is the most
      // dial-first surface in the CRM, so it must obey the same rule. Only the
      // contact fields are rewritten; the rest of the queue item is built
      // explicitly so no extra lead columns leak into the response.
      phone: decision.mask ? maskPhone(l.phone) : l.phone,
      whatsappNumber: decision.mask ? maskPhone(l.whatsappNumber) : l.whatsappNumber,
      contactHidden: decision.mask,
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

  return NextResponse.json({
    queue: [...overdue, ...dueToday, ...fresh],
    contactMasking: describeMasking(decision),
  });
}