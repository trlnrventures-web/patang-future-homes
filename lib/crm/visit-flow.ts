import { and, eq, inArray, ne } from "drizzle-orm";
import * as schema from "./schema";
import type { CrmDb } from "./leads";
import { istHourMinute, istNowIso, istToday } from "./attendance";
import { getPostVisitCadenceDays, getVisitReminderHourIst, getVisitReminderOverdueHourIst } from "./settings";
import { alertSalesHeads, routeLeadAfterBooking } from "./routing";
import { writeAuditLog } from "./audit";

/**
 * Visit lifecycle for the Vasai West strategy.
 *
 * The customer-facing project name is the core of the pitch and is withheld
 * until the customer commits to a slot. `reveal_allowed` is the single flag the
 * message templates consult; it turns on only when the caller ticks "Customer
 * confirmed" on a visit that already has a date and time, survives a reschedule
 * and Done, and turns off on cancel.
 *
 * Reminders are not cron jobs: they are derived whenever a dashboard or list is
 * loaded, exactly like SLA state elsewhere in the CRM.
 */

export type Outcome = "token_paid" | "second_visit" | "thinking" | "lost";

export const OUTCOME_OPTIONS: { value: Outcome; label: string; needsReason: boolean }[] = [
  { value: "token_paid", label: "Token paid", needsReason: false },
  { value: "second_visit", label: "Second visit booked", needsReason: false },
  { value: "thinking", label: "Thinking", needsReason: false },
  { value: "lost", label: "Lost", needsReason: true },
];

export const OUTCOME_LABELS: Record<Outcome, string> = {
  token_paid: "Token paid",
  second_visit: "Second visit booked",
  thinking: "Thinking",
  lost: "Lost",
};

export const VISIT_STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  booked: "Booked",
  confirmed: "Confirmed",
  arrived: "Arrived",
  visit_done: "Visit done",
  no_show: "No show",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

/** Open visit states that can still carry a reminder or a reveal. */
const LIVE_VISIT_STATUSES = ["proposed", "booked", "confirmed", "arrived", "rescheduled"];

/** Combine a visit's YYYY-MM-DD date and HH:MM time into an IST instant. */
export function visitStart(date: string, time: string): Date {
  const clean = (time || "00:00").trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})/);
  const hour = match ? Number(match[1]) : 0;
  const minute = match ? Number(match[2]) : 0;
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`);
}

/** A visit is reveal-eligible only once it has a slot and the customer confirmed. */
export function visitCanReveal(visit: {
  status: string;
  date: string;
  time: string;
  customerConfirmed: boolean;
}): boolean {
  if (!visit.date || !visit.time) return false;
  if (!visit.customerConfirmed) return false;
  return ["booked", "confirmed", "arrived", "visit_done", "rescheduled"].includes(visit.status);
}

/**
 * Recompute `reveal_allowed` for a lead from its newest live visit.
 * Reschedule keeps the flag; cancel clears it; Done keeps it.
 */
export function syncLeadReveal(db: CrmDb, leadId: number, actorUserId: number | null, source: "auto" | "admin"): boolean {
  const visits = db
    .select()
    .from(schema.siteVisits)
    .where(eq(schema.siteVisits.leadId, leadId))
    .all();

  const live = visits
    .filter((v) => LIVE_VISIT_STATUSES.includes(v.status) || v.status === "visit_done")
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));

  const reveal = live.some((v) =>
    v.status === "visit_done" ? v.customerConfirmed && !!v.date && !!v.time : visitCanReveal(v),
  );

  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
  if (!lead) return reveal;
  if (lead.revealAllowed === reveal) return reveal;

  db.update(schema.leads)
    .set({
      revealAllowed: reveal,
      revealChangedAt: istNowIso(),
      revealChangedBy: actorUserId,
      revealSource: source,
      updatedAt: istNowIso(),
    })
    .where(eq(schema.leads.id, leadId))
    .run();

  const actor = actorUserId ?? lead.assignedCallerId ?? lead.assignedSmId;
  if (actor != null) {
    db.insert(schema.activities).values({
      leadId,
      userId: actor,
      type: "note",
      notes: reveal ? "Project reveal enabled (customer confirmed a visit)" : "Project reveal disabled",
      createdAt: istNowIso(),
    }).run();
  }

  return reveal;
}

/** Caller ticks (or clears) "Customer confirmed" on a visit. */
export function setVisitConfirmation(
  db: CrmDb,
  input: { visitId: number; confirmed: boolean; actorUserId: number; source?: "auto" | "admin" },
): { visit: typeof schema.siteVisits.$inferSelect; reveal: boolean; error?: string } {
  const visit = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.id, input.visitId)).get();
  if (!visit) throw new Error("Visit not found");
  if (input.confirmed && (!visit.date || !visit.time)) {
    return { visit, reveal: false, error: "Set the visit date and time before confirming" };
  }
  if (input.confirmed && visit.status === "cancelled") {
    return { visit, reveal: false, error: "A cancelled visit cannot be confirmed" };
  }

  const now = istNowIso();
  db.update(schema.siteVisits)
    .set({
      customerConfirmed: input.confirmed,
      confirmedAt: input.confirmed ? now : null,
      confirmedBy: input.confirmed ? input.actorUserId : null,
      status: input.confirmed && visit.status === "proposed" ? "confirmed" : visit.status,
    })
    .where(eq(schema.siteVisits.id, input.visitId))
    .run();

  const reveal = syncLeadReveal(db, visit.leadId, input.actorUserId, input.source ?? "auto");

  if (input.confirmed) {
    // Booking with a slot is the routing trigger.
    routeLeadAfterBooking(db, visit.leadId, input.actorUserId);
  }

  return {
    visit: db.select().from(schema.siteVisits).where(eq(schema.siteVisits.id, input.visitId)).get()!,
    reveal,
  };
}

/** Admin / Sales Head override of the reveal flag, always audited. */
export function overrideReveal(
  db: CrmDb,
  input: { leadId: number; allowed: boolean; actorUserId: number; reason: string },
): void {
  const now = istNowIso();
  db.update(schema.leads)
    .set({
      revealAllowed: input.allowed,
      revealChangedAt: now,
      revealChangedBy: input.actorUserId,
      revealSource: "admin",
      updatedAt: now,
    })
    .where(eq(schema.leads.id, input.leadId))
    .run();
  writeAuditLog({
    category: "data",
    action: "reveal_override",
    actorUserId: input.actorUserId,
    entityType: "lead",
    entityId: input.leadId,
    summary: `Project reveal ${input.allowed ? "enabled" : "disabled"} by override: ${input.reason}`,
    createdAt: now,
  });
}

/**
 * Cancel/complete side effects on the reveal flag. Called by the visit status
 * endpoints so a cancel hides the project again while a reschedule keeps it.
 */
export function onVisitStatusChanged(db: CrmDb, visitId: number, actorUserId: number): void {
  const visit = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.id, visitId)).get();
  if (!visit) return;
  syncLeadReveal(db, visit.leadId, actorUserId, "auto");
}

/* ------------------------------------------------------------------ */
/* Reminders                                                          */
/* ------------------------------------------------------------------ */

export type ReminderTask = {
  visitId: number;
  leadId: number;
  leadName: string;
  phone: string;
  date: string;
  time: string;
  meetingPoint: string | null;
  kind: "day_before" | "two_hour";
  dueAt: string;
  overdue: boolean;
  overdueAt: string;
  message: string;
  projectLabel: string;
};

function reminderMessage(lead: typeof schema.leads.$inferSelect, visit: typeof schema.siteVisits.$inferSelect, audience: "caller" | "sm", reveal: boolean): string {
  const first = (lead.name || "").split(" ")[0] || "there";
  const when = `${visit.date} at ${visit.time}`;
  if (audience === "caller") {
    return `Hi ${first}, this is Patang Future Homes. A reminder for your site visit on ${when}${
      visit.meetingPoint ? ` at ${visit.meetingPoint}` : ""
    }. Please reply here if you need to reschedule.`;
  }
  return `Site visit: ${lead.name} on ${when}. Budget ${lead.budget || "not captured"}; attendees ${
    lead.visitAttendees || "not captured"
  }.${reveal && lead.pitchedProjectSlug ? ` Pitched project: ${lead.pitchedProjectSlug}.` : ""}`;
}

/** Build the reminder tasks a caller or SM should see right now. */
export function reminderTasksFor(db: CrmDb, userId: number, role: string): ReminderTask[] {
  const today = istToday();
  const nowHour = istHourMinute(istNowIso()).hour;
  const reminderHour = getVisitReminderHourIst();
  const overdueHour = getVisitReminderOverdueHourIst();

  const visits = db
    .select()
    .from(schema.siteVisits)
    .where(and(inArray(schema.siteVisits.status, ["booked", "confirmed", "rescheduled"]), ne(schema.siteVisits.date, "")))
    .all();

  const leads = db.select().from(schema.leads).all();
  const leadMap = new Map(leads.map((l) => [l.id, l]));

  const tasks: ReminderTask[] = [];
  for (const visit of visits) {
    const lead = leadMap.get(visit.leadId);
    if (!lead || lead.deletedAt) continue;
    const isCaller = role === "caller" && lead.assignedCallerId === userId;
    const isSm = role === "sales_manager" && visit.smId === userId;
    if (!isCaller && !isSm) continue;

    const start = visitStart(visit.date, visit.time);
    const dayBeforeDate = new Date(start.getTime() - 24 * 60 * 60 * 1000);

    if (isCaller && !visit.dayBeforeDoneAt) {
      const due = new Date(`${dayBeforeDate.toISOString().slice(0, 10)}T${String(reminderHour).padStart(2, "0")}:00:00+05:30`);
      const visible = visit.date === today || (visit.date > today && due.getTime() <= Date.now() + 24 * 60 * 60 * 1000);
      if (visible) {
        const overdueAtDate = new Date(`${dayBeforeDate.toISOString().slice(0, 10)}T${String(overdueHour).padStart(2, "0")}:00:00+05:30`);
        tasks.push({
          visitId: visit.id,
          leadId: lead.id,
          leadName: lead.name,
          phone: lead.whatsappNumber || lead.phone || "",
          date: visit.date,
          time: visit.time,
          meetingPoint: visit.meetingPoint,
          kind: "day_before",
          dueAt: due.toISOString(),
          overdue: Date.now() > overdueAtDate.getTime() && visit.date <= today,
          overdueAt: overdueAtDate.toISOString(),
          message: reminderMessage(lead, visit, "caller", lead.revealAllowed),
          projectLabel: lead.revealAllowed ? lead.pitchedProjectSlug || "" : "Vasai West",
        });
      }
    }

    if (isSm && !visit.twoHourDoneAt) {
      const showFrom = new Date(start.getTime() - 2 * 60 * 60 * 1000);
      if (start.getTime() >= Date.now() && showFrom.getTime() <= Date.now() + 24 * 60 * 60 * 1000) {
        tasks.push({
          visitId: visit.id,
          leadId: lead.id,
          leadName: lead.name,
          phone: lead.whatsappNumber || lead.phone || "",
          date: visit.date,
          time: visit.time,
          meetingPoint: visit.meetingPoint,
          kind: "two_hour",
          dueAt: showFrom.toISOString(),
          overdue: Date.now() > start.getTime(),
          overdueAt: start.toISOString(),
          message: reminderMessage(lead, visit, "sm", lead.revealAllowed),
          projectLabel: lead.revealAllowed ? lead.pitchedProjectSlug || "" : "Vasai West",
        });
      }
    }
  }

  // Anything already overdue is surfaced for the Sales Head separately.
  void nowHour;
  return tasks.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** Mark a reminder done, log the prepared message, and stamp the visit. */
export function completeReminder(
  db: CrmDb,
  input: { visitId: number; kind: "day_before" | "two_hour"; actorUserId: number; message?: string | null },
): void {
  const visit = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.id, input.visitId)).get();
  if (!visit) throw new Error("Visit not found");
  const now = istNowIso();
  db.update(schema.siteVisits)
    .set(input.kind === "day_before" ? { dayBeforeDoneAt: now } : { twoHourDoneAt: now })
    .where(eq(schema.siteVisits.id, input.visitId))
    .run();

  if (input.message) {
    db.insert(schema.messageLogs)
      .values({
        leadId: visit.leadId,
        userId: input.actorUserId,
        renderedMessage: input.message,
        category: "visit_reminder",
        action: "whatsapp_opened",
        createdAt: now,
      })
      .run();
  }
}

/** Overdue reminders the Sales Head should chase, across the whole team. */
export function overdueReminderTasks(db: CrmDb): ReminderTask[] {
  const today = istToday();
  const reminders: ReminderTask[] = [];
  const visits = db
    .select()
    .from(schema.siteVisits)
    .where(inArray(schema.siteVisits.status, ["booked", "confirmed", "rescheduled"]))
    .all();
  const leads = db.select().from(schema.leads).all();
  const leadMap = new Map(leads.map((l) => [l.id, l]));

  for (const visit of visits) {
    const lead = leadMap.get(visit.leadId);
    if (!lead || lead.deletedAt) continue;
    const start = visitStart(visit.date, visit.time);
    if (!visit.dayBeforeDoneAt && visit.date < today) {
      reminders.push({
        visitId: visit.id,
        leadId: lead.id,
        leadName: lead.name,
        phone: lead.whatsappNumber || lead.phone || "",
        date: visit.date,
        time: visit.time,
        meetingPoint: visit.meetingPoint,
        kind: "day_before",
        dueAt: visit.date,
        overdue: true,
        overdueAt: visit.date,
        message: "Day-before reminder not completed",
        projectLabel: lead.revealAllowed ? lead.pitchedProjectSlug || "" : "Vasai West",
      });
    }
    if (!visit.twoHourDoneAt && start.getTime() < Date.now() && ["booked", "confirmed", "rescheduled"].includes(visit.status)) {
      reminders.push({
        visitId: visit.id,
        leadId: lead.id,
        leadName: lead.name,
        phone: lead.whatsappNumber || lead.phone || "",
        date: visit.date,
        time: visit.time,
        meetingPoint: visit.meetingPoint,
        kind: "two_hour",
        dueAt: start.toISOString(),
        overdue: true,
        overdueAt: start.toISOString(),
        message: "Two-hour reminder not completed",
        projectLabel: lead.revealAllowed ? lead.pitchedProjectSlug || "" : "Vasai West",
      });
    }
  }
  return reminders;
}

/* ------------------------------------------------------------------ */
/* Outcomes and cadence                                               */
/* ------------------------------------------------------------------ */

/** Log the post-visit outcome. Day 2/5/10/20 cadence follows automatically. */
export function logVisitOutcome(
  db: CrmDb,
  input: { visitId: number; outcome: Outcome; reason?: string | null; actorUserId: number },
): { followUpsCreated: number } {
  const visit = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.id, input.visitId)).get();
  if (!visit) throw new Error("Visit not found");
  if (input.outcome === "lost" && !input.reason?.trim()) {
    throw new Error("A lost reason is required");
  }

  const now = istNowIso();
  db.update(schema.siteVisits)
    .set({
      status: "visit_done",
      doneAt: visit.doneAt || now,
      outcome: input.outcome,
      outcomeReason: input.reason?.trim() || null,
      outcomeLoggedBy: input.actorUserId,
      outcomeLoggedAt: now,
    })
    .where(eq(schema.siteVisits.id, input.visitId))
    .run();

  // Any previously scheduled cadence for this lead is replaced.
  db.update(schema.followUps)
    .set({ status: "missed" })
    .where(and(eq(schema.followUps.leadId, visit.leadId), eq(schema.followUps.kind, "post_visit_cadence"), eq(schema.followUps.status, "pending")))
    .run();

  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, visit.leadId)).get();
  if (!lead) return { followUpsCreated: 0 };

  if (input.outcome === "token_paid") {
    db.update(schema.leads)
      .set({ status: "booked", nextAction: "none", updatedAt: now })
      .where(eq(schema.leads.id, lead.id))
      .run();
    return { followUpsCreated: 0 };
  }

  if (input.outcome === "lost") {
    db.update(schema.leads)
      .set({ status: "lost", nextAction: "none", updatedAt: now })
      .where(eq(schema.leads.id, lead.id))
      .run();
    return { followUpsCreated: 0 };
  }

  db.update(schema.leads)
    .set({
      status: "visit_done",
      nextAction: "sm_follow_up",
      nextFollowUp: now,
      updatedAt: now,
    })
    .where(eq(schema.leads.id, lead.id))
    .run();

  if (input.outcome === "second_visit") {
    // The caller, not the SM, books the revisit.
    const callerId = lead.assignedCallerId;
    if (callerId != null) {
      const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      db.insert(schema.followUps)
        .values({
          leadId: lead.id,
          userId: callerId,
          scheduledFor: due,
          purpose: "Book the second visit",
          status: "pending",
          kind: "manual",
          notes: "SM logged a second-visit outcome",
          createdAt: now,
        })
        .run();
    }
    return { followUpsCreated: 0 };
  }

  // Thinking: day 2/5/10/20 follow-ups owned by the SM who did the visit.
  let created = 0;
  for (const days of getPostVisitCadenceDays()) {
    const due = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    db.insert(schema.followUps)
      .values({
        leadId: lead.id,
        userId: visit.smId,
        scheduledFor: due,
        purpose: `Post-visit follow-up (day ${days})`,
        status: "pending",
        kind: "post_visit_cadence",
        createdAt: now,
      })
      .run();
    created += 1;
  }
  return { followUpsCreated: created };
}

/** A no-show puts the lead back in the caller's hands with a rebook follow-up. */
export function logNoShow(db: CrmDb, input: { visitId: number; actorUserId: number; note?: string }): void {
  const visit = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.id, input.visitId)).get();
  if (!visit) throw new Error("Visit not found");
  const now = istNowIso();
  db.update(schema.siteVisits)
    .set({ status: "no_show", customerConfirmed: false, confirmedAt: null, confirmedBy: null })
    .where(eq(schema.siteVisits.id, input.visitId))
    .run();
  syncLeadReveal(db, visit.leadId, input.actorUserId, "auto");

  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, visit.leadId)).get();
  if (!lead) return;
  const callerId = lead.assignedCallerId ?? lead.assignedSmId;
  if (callerId != null) {
    db.insert(schema.followUps)
      .values({
        leadId: lead.id,
        userId: callerId,
        scheduledFor: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        purpose: "Rebook after no-show",
        status: "pending",
        kind: "no_show_rebook",
        notes: input.note || `No-show for visit on ${visit.date} ${visit.time}`,
        createdAt: now,
      })
      .run();
  }
  db.update(schema.leads)
    .set({ status: "visit_proposed", nextAction: "call_back", updatedAt: now })
    .where(eq(schema.leads.id, lead.id))
    .run();
}

/** Outcomes still unlogged for yesterday-or-earlier done/no-show visits. */
export function overdueOutcomeVisits(db: CrmDb): (typeof schema.siteVisits.$inferSelect)[] {
  const today = istToday();
  return db
    .select()
    .from(schema.siteVisits)
    .where(inArray(schema.siteVisits.status, ["visit_done", "no_show"]))
    .all()
    .filter((v) => v.date < today && !v.outcome && v.status === "visit_done");
}

/** Chase the Sales Head about every outcome overdue by a day. */
export function raiseOutcomeOverdueAlerts(db: CrmDb): void {
  for (const visit of overdueOutcomeVisits(db)) {
    alertSalesHeads(db, {
      leadId: visit.leadId,
      kind: "outcome",
      title: "Visit outcome not logged",
      body: `The visit on ${visit.date} ${visit.time} has no outcome. Ask the SM to log token / second visit / thinking / lost.`,
    });
  }
}
