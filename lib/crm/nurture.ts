import { and, eq, isNull } from "drizzle-orm";
import * as schema from "./schema";
import type { CrmDb } from "./leads";
import { istNowIso, istToday } from "./attendance";
import { getNurtureDailyTaskLimit } from "./settings";
import { NURTURE_REASON_LABELS, type NurtureReason } from "./grading";
import fs from "node:fs";
import path from "node:path";
import { projects as staticProjects } from "@/lib/projects";
import { matchProperties } from "./matching";
import { getMatchingWeights } from "./settings";

/**
 * The C-lead nurture list.
 *
 * C leads are not dead: they are owned by a caller, re-contacted on a cadence
 * and promoted back into the main flow the moment they fit again. Nothing here
 * touches SM time.
 */

export const NURTURE_CADENCE_DAYS: Record<NurtureReason, number[]> = {
  exploring: [14, 30],
  budget_low: [30],
  location: [30],
  configuration: [30],
  not_interested: [30],
  not_reachable: [2, 5, 10],
  other: [30],
};

/** Four unanswered attempts makes a lead dormant until something changes. */
export const DORMANT_AFTER_ATTEMPTS = 4;

export function nurtureCadenceDays(reason: NurtureReason | null | undefined): number[] {
  return NURTURE_CADENCE_DAYS[(reason as NurtureReason) || "other"] || [30];
}

function dateAfterDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Where the next re-contact should land, given how many attempts are done. */
export function nextNurtureAt(reason: NurtureReason | null | undefined, attempts: number): string {
  const days = nurtureCadenceDays(reason);
  const index = Math.min(Math.max(0, attempts), days.length - 1);
  return dateAfterDays(days[index]);
}

/** Move a lead into nurture and schedule the first re-contact task. */
export function enterNurture(
  db: CrmDb,
  input: { leadId: number; reason: NurtureReason; actorUserId: number; note?: string },
): void {
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, input.leadId)).get();
  if (!lead) throw new Error("Lead not found");
  const now = istNowIso();
  const nextAt = nextNurtureAt(input.reason, 0);

  db.update(schema.leads)
    .set({
      status: "nurture",
      grade: "C",
      nurtureReason: input.reason,
      nurtureAttempts: 0,
      nurtureNextAt: nextAt,
      dormantAt: null,
      assignedSmId: null,
      nextAction: "nurture",
      nextFollowUp: nextAt,
      updatedAt: now,
    })
    .where(eq(schema.leads.id, lead.id))
    .run();

  const owner = lead.assignedCallerId;
  if (owner != null) {
    scheduleNurtureTask(db, lead.id, owner, nextAt, input.reason, now);
  }

  db.insert(schema.activities).values({
    leadId: lead.id,
    userId: input.actorUserId,
    type: "status_change",
    notes: `Moved to nurture: ${NURTURE_REASON_LABELS[input.reason]}${input.note ? ` — ${input.note}` : ""}`,
    createdAt: now,
  }).run();
}

function scheduleNurtureTask(
  db: CrmDb,
  leadId: number,
  userId: number,
  scheduledFor: string,
  reason: NurtureReason,
  now: string,
): void {
  db.insert(schema.followUps)
    .values({
      leadId,
      userId,
      scheduledFor,
      purpose: `Nurture re-contact: ${NURTURE_REASON_LABELS[reason] || reason}`,
      status: "pending",
      kind: "nurture_recontact",
      createdAt: now,
    })
    .run();
}

export type NurtureTask = {
  followUpId: number;
  leadId: number;
  leadName: string;
  phone: string;
  reason: string;
  attempts: number;
  dueAt: string;
  dormant: boolean;
  message: string;
};

function nurtureMessage(lead: typeof schema.leads.$inferSelect, reason: NurtureReason | null): string {
  const first = (lead.name || "").split(" ")[0] || "there";
  switch (reason) {
    case "budget_low":
      return `Hi ${first}, we have new options in Vasai West that may fit your budget better. Would you like me to share the details?`;
    case "location":
      return `Hi ${first}, a new Vasai West project has opened up. Is that location workable for you now?`;
    case "configuration":
      return `Hi ${first}, a new configuration is now available that matches what you asked for. Shall I send the details?`;
    case "not_reachable":
      return `Hi ${first}, I tried calling a few times. When is a good time to talk about your Vasai West shortlist?`;
    case "not_interested":
      return `Hi ${first}, just checking in — has anything changed in what you are looking for?`;
    default:
      return `Hi ${first}, an update on Vasai West projects that match what you were looking for. Interested in a quick look?`;
  }
}

/**
 * The caller's nurture queue for today. Capped so a caller cannot be buried by
 * a backlog of old C leads; the cap is a setting (default 20).
 */
export function nurtureTasksFor(db: CrmDb, userId: number): { tasks: NurtureTask[]; capped: boolean; total: number } {
  const today = istToday();
  const limit = getNurtureDailyTaskLimit();
  const rows = db
    .select()
    .from(schema.followUps)
    .where(
      and(
        eq(schema.followUps.userId, userId),
        eq(schema.followUps.kind, "nurture_recontact"),
        eq(schema.followUps.status, "pending"),
      ),
    )
    .all();
  const leads = db.select().from(schema.leads).all();
  const leadMap = new Map(leads.map((l) => [l.id, l]));

  const tasks: NurtureTask[] = [];
  for (const row of rows) {
    const lead = leadMap.get(row.leadId);
    if (!lead || lead.deletedAt) continue;
    if (lead.status !== "nurture" && !lead.dormantAt) continue;
    if (row.scheduledFor.slice(0, 10) > today) continue;
    tasks.push({
      followUpId: row.id,
      leadId: lead.id,
      leadName: lead.name,
      phone: lead.whatsappNumber || lead.phone || "",
      reason: NURTURE_REASON_LABELS[(lead.nurtureReason as NurtureReason) || "other"] || "Nurture",
      attempts: lead.nurtureAttempts,
      dueAt: row.scheduledFor,
      dormant: !!lead.dormantAt,
      message: nurtureMessage(lead, lead.nurtureReason as NurtureReason | null),
    });
  }

  tasks.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return { tasks: tasks.slice(0, limit), capped: tasks.length > limit, total: tasks.length };
}

/**
 * Log a nurture touch. A positive reply hands the lead back to the caller for a
 * re-grade; four silent attempts make it dormant.
 */
export function logNurtureContact(
  db: CrmDb,
  input: { leadId: number; actorUserId: number; responded: boolean; note?: string },
): { dormant: boolean; promoted: boolean; nextAt: string | null } {
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, input.leadId)).get();
  if (!lead) throw new Error("Lead not found");
  const now = istNowIso();
  const reason = (lead.nurtureReason as NurtureReason) || "other";
  const attempts = lead.nurtureAttempts + 1;

  // Close the task that was worked.
  db.update(schema.followUps)
    .set({ status: "completed", completedAt: now })
    .where(
      and(
        eq(schema.followUps.leadId, lead.id),
        eq(schema.followUps.kind, "nurture_recontact"),
        eq(schema.followUps.status, "pending"),
      ),
    )
    .run();

  if (input.responded) {
    db.update(schema.leads)
      .set({
        status: "qualified",
        nurtureNextAt: null,
        dormantAt: null,
        nextAction: "qualification",
        nextFollowUp: now,
        updatedAt: now,
      })
      .where(eq(schema.leads.id, lead.id))
      .run();
    db.insert(schema.activities).values({
      leadId: lead.id,
      userId: input.actorUserId,
      type: "note",
      notes: `Nurture reply received — re-grade the lead${input.note ? `: ${input.note}` : ""}`,
      createdAt: now,
    }).run();
    return { dormant: false, promoted: true, nextAt: null };
  }

  if (attempts >= DORMANT_AFTER_ATTEMPTS) {
    db.update(schema.leads)
      .set({
        nurtureAttempts: attempts,
        dormantAt: now,
        nurtureNextAt: null,
        nextFollowUp: null,
        updatedAt: now,
      })
      .where(eq(schema.leads.id, lead.id))
      .run();
    return { dormant: true, promoted: false, nextAt: null };
  }

  const nextAt = nextNurtureAt(reason, attempts);
  db.update(schema.leads)
    .set({
      nurtureAttempts: attempts,
      nurtureNextAt: nextAt,
      nextFollowUp: nextAt,
      updatedAt: now,
    })
    .where(eq(schema.leads.id, lead.id))
    .run();
  const owner = lead.assignedCallerId ?? input.actorUserId;
  scheduleNurtureTask(db, lead.id, owner, nextAt, reason, now);
  return { dormant: false, promoted: false, nextAt };
}

/**
 * A newly published project can make a dormant or nurture lead relevant again.
 * Called by the existing reactivation scan; returns the leads it flagged.
 */
export function flagNurtureForNewProjects(db: CrmDb): number {
  const setting = db
    .select()
    .from(schema.crmSettings)
    .where(eq(schema.crmSettings.key, "nurture_scanned_slugs"))
    .get();
  const scanned: string[] = setting ? JSON.parse(setting.value || "[]") : [];
  let allProjects = staticProjects;
  try {
    const file = path.join(process.cwd(), "data", "projects.json");
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(raw)) allProjects = raw;
    }
  } catch {
    // Fall back to the bundled list.
  }
  const fresh = allProjects.filter((p: { slug: string }) => !scanned.includes(p.slug));
  if (fresh.length === 0) return 0;

  const weights = getMatchingWeights();
  const leads = db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.status, "nurture"), isNull(schema.leads.deletedAt)))
    .all();

  let flagged = 0;
  const now = istNowIso();
  for (const lead of leads) {
    if (lead.dormantAt) continue;
    for (const project of fresh) {
      const matches = matchProperties(
        {
          location: lead.location,
          budgetMin: lead.budgetMin,
          budgetMax: lead.budgetMax,
          bhk: lead.bhk,
        },
        3,
        weights,
      );
      if (!matches.some((m) => m.projectSlug === project.slug)) continue;
      const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.leads)
        .set({ nextFollowUp: due, nurtureNextAt: due, updatedAt: now })
        .where(eq(schema.leads.id, lead.id))
        .run();
      if (lead.assignedCallerId != null) {
        scheduleNurtureTask(db, lead.id, lead.assignedCallerId, due, (lead.nurtureReason as NurtureReason) || "other", now);
      }
      flagged += 1;
      break;
    }
  }

  const next = [...new Set([...scanned, ...fresh.map((p) => p.slug)])];
  const existing = db
    .select()
    .from(schema.crmSettings)
    .where(eq(schema.crmSettings.key, "nurture_scanned_slugs"))
    .get();
  if (existing) {
    db.update(schema.crmSettings).set({ value: JSON.stringify(next), updatedAt: now }).where(eq(schema.crmSettings.key, "nurture_scanned_slugs")).run();
  } else {
    db.insert(schema.crmSettings).values({ key: "nurture_scanned_slugs", value: JSON.stringify(next), updatedAt: now }).run();
  }
  return flagged;
}

/** Leads parked in nurture, for the dedicated view. */
export function nurtureLeads(db: CrmDb) {
  return db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.status, "nurture"))
    .all()
    .filter((l) => !l.deletedAt);
}
