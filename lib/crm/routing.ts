import { and, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "./schema";
import type { CrmDb } from "./leads";
import {
  getDailyVisitCap,
  getRoutingPointer,
  setRoutingPointer,
} from "./settings";
import { istNowIso, istToday } from "./attendance";

/**
 * Grade-based routing for the Vasai West strategy.
 *
 * A lead reaches an SM only when it is graded A or B *and* a site visit with a
 * date and time has been booked. A goes to a commission SM, B to a salaried SM.
 * Inside the tier the SM with the fewest open leads wins, with a round-robin
 * cursor breaking ties so nobody is starved. SMs who are manually unavailable,
 * inside an unavailable date range, or already at their visit-day cap are
 * skipped. If the whole tier is exhausted the lead waits for the Sales Head —
 * it never jumps to the other tier.
 */

export type RoutingTier = "commission" | "salaried";

const FINAL_LEAD_STATUSES = new Set(["booked", "lost", "invalid", "dnc", "no_response"]);
const CLOSED_VISIT_STATUSES = new Set(["cancelled"]);

export function tierForGrade(grade: string | null | undefined): RoutingTier | null {
  if (grade === "A") return "commission";
  if (grade === "B") return "salaried";
  return null;
}

/** True while a user's manual unavailable window covers `date` (YYYY-MM-DD). */
function outsideUnavailableWindow(
  user: { unavailableFrom: string | null; unavailableTo: string | null },
  date: string,
): boolean {
  const from = user.unavailableFrom?.slice(0, 10) || null;
  const to = user.unavailableTo?.slice(0, 10) || null;
  if (!from && !to) return true;
  if (from && date < from) return true;
  if (to && date > to) return true;
  return false;
}

/** Visits already booked for a given SM and visit date (the daily cap unit). */
function visitLoad(db: CrmDb, smId: number, date: string): number {
  const rows = db
    .select()
    .from(schema.siteVisits)
    .where(and(eq(schema.siteVisits.smId, smId), eq(schema.siteVisits.date, date)))
    .all();
  return rows.filter((v) => !CLOSED_VISIT_STATUSES.has(v.status)).length;
}

function openLeadLoads(db: CrmDb): Map<number, number> {
  const counts = new Map<number, number>();
  const rows = db.select().from(schema.leads).all();
  for (const lead of rows) {
    if (lead.deletedAt) continue;
    if (lead.assignedSmId == null) continue;
    if (FINAL_LEAD_STATUSES.has(lead.status)) continue;
    counts.set(lead.assignedSmId, (counts.get(lead.assignedSmId) ?? 0) + 1);
  }
  return counts;
}

export type RoutingCandidate = {
  id: number;
  name: string;
  openLeads: number;
  visitsOnDate: number;
};

export type RoutingResult = {
  smId: number | null;
  tier: RoutingTier | null;
  reason: string;
  candidates: RoutingCandidate[];
};

/**
 * Rank every eligible SM in a tier. Exported so the admin override screen can
 * show why someone is (not) eligible before a human picks.
 */
export function routingCandidates(
  db: CrmDb,
  tier: RoutingTier,
  visitDate: string,
): RoutingCandidate[] {
  const cap = getDailyVisitCap();
  const loads = openLeadLoads(db);
  const users = db
    .select()
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "sales_manager"),
        eq(schema.users.active, true),
        eq(schema.users.routingTier, tier),
      ),
    )
    .orderBy(schema.users.id)
    .all();

  const candidates: RoutingCandidate[] = [];
  for (const user of users) {
    if (!user.available) continue;
    if (!outsideUnavailableWindow(user, visitDate)) continue;
    const visits = visitLoad(db, user.id, visitDate);
    const userCap = user.dailyVisitCap ?? cap;
    if (visits >= userCap) continue;
    candidates.push({
      id: user.id,
      name: user.name,
      openLeads: loads.get(user.id) ?? 0,
      visitsOnDate: visits,
    });
  }
  return candidates;
}

/** Pick the SM that should receive this grade/visit-date pair. */
export function pickSmForTier(
  db: CrmDb,
  tier: RoutingTier,
  visitDate: string,
): RoutingResult {
  const candidates = routingCandidates(db, tier, visitDate);
  if (candidates.length === 0) {
    return {
      smId: null,
      tier,
      reason: `No available ${tier} sales manager for ${visitDate} (unavailable, at cap, or none configured)`,
      candidates: [],
    };
  }

  // Rotation order: start after the last assigned SM so consecutive leads do not
  // all land on the same person when loads are tied.
  const pointer = getRoutingPointer(tier);
  const ordered = [...candidates].sort((a, b) => a.id - b.id);
  const start = pointer == null ? 0 : Math.max(0, ordered.findIndex((c) => c.id === pointer) + 1);
  const rotated = [...ordered.slice(start), ...ordered.slice(0, start)];

  const best = rotated.reduce((winner, candidate) => {
    if (!winner) return candidate;
    if (candidate.openLeads !== winner.openLeads) {
      return candidate.openLeads < winner.openLeads ? candidate : winner;
    }
    return winner;
  }, null as RoutingCandidate | null)!;

  setRoutingPointer(tier, best.id);
  return {
    smId: best.id,
    tier,
    reason: `Routed to ${best.name} (${tier}, ${best.openLeads} open leads, ${best.visitsOnDate} visits that day)`,
    candidates,
  };
}

/** Raise a persistent alert for every admin / sales head. Never throws. */
export function alertSalesHeads(
  db: CrmDb,
  input: { leadId: number; kind: "routing" | "reminder" | "outcome" | "nurture"; title: string; body: string },
): void {
  try {
    const heads = db
      .select()
      .from(schema.users)
      .where(and(inArray(schema.users.role, ["admin", "sales_head"]), eq(schema.users.active, true)))
      .all();
    const now = istNowIso();
    for (const head of heads) {
      db.insert(schema.leadAlerts)
        .values({
          userId: head.id,
          leadId: input.leadId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          createdAt: now,
        })
        .run();
    }
  } catch {
    // Alerts are best-effort: a failed alert must never roll back the routing.
  }
}

/**
 * Route a lead after grading or a new visit booking. Auto-routing never touches
 * an assignment an admin locked; it also leaves a lead alone when the grade is C
 * or no visit with a date and time exists yet.
 */
export function routeLeadAfterBooking(
  db: CrmDb,
  leadId: number,
  actorUserId: number,
): { assigned: boolean; smId: number | null; reason: string } {
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
  if (!lead || lead.deletedAt) {
    return { assigned: false, smId: null, reason: "Lead not found" };
  }
  if (lead.assignmentLocked) {
    return { assigned: false, smId: lead.assignedSmId ?? null, reason: "Assignment is locked by an admin override" };
  }

  const tier = tierForGrade(lead.grade);
  if (!tier) {
    return { assigned: false, smId: lead.assignedSmId ?? null, reason: "Lead is not graded A or B" };
  }

  const visits = db
    .select()
    .from(schema.siteVisits)
    .where(eq(schema.siteVisits.leadId, leadId))
    .all()
    .filter(
      (v) =>
        v.date &&
        v.time &&
        ["booked", "confirmed", "rescheduled"].includes(v.status),
    );
  const visit = visits.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0];
  if (!visit) {
    return { assigned: false, smId: lead.assignedSmId ?? null, reason: "No visit with a date and time is booked" };
  }

  const result = pickSmForTier(db, tier, visit.date);
  if (result.smId == null) {
    alertSalesHeads(db, {
      leadId,
      kind: "routing",
      title: "Needs routing",
      body: `${lead.name} is graded ${lead.grade} with a visit on ${visit.date}, but ${result.reason}. Assign manually.`,
    });
    db.update(schema.leads)
      .set({ assignedSmId: null, updatedAt: istNowIso() })
      .where(eq(schema.leads.id, leadId))
      .run();
    db.insert(schema.activities).values({
      leadId,
      userId: actorUserId,
      type: "assignment",
      notes: `Needs routing: ${result.reason}`,
      createdAt: istNowIso(),
    }).run();
    return { assigned: false, smId: null, reason: result.reason };
  }

  if (lead.assignedSmId !== result.smId) {
    const sm = db.select().from(schema.users).where(eq(schema.users.id, result.smId)).get();
    db.update(schema.leads)
      .set({
        assignedSmId: result.smId,
        assignedAt: istNowIso(),
        assignedBy: actorUserId,
        status: "assigned",
        nextAction: "sm_follow_up",
        updatedAt: istNowIso(),
      })
      .where(eq(schema.leads.id, leadId))
      .run();
    db.insert(schema.activities).values({
      leadId,
      userId: actorUserId,
      type: "assignment",
      notes: `Auto-routed by grade ${lead.grade}: SM → ${sm?.name ?? result.smId}`,
      createdAt: istNowIso(),
    }).run();
  }

  return { assigned: true, smId: result.smId, reason: result.reason };
}

/** Every active lead with no SM, for the "Needs reassignment" view. */
export function unassignedLeads(db: CrmDb) {
  return db
    .select()
    .from(schema.leads)
    .where(isNull(schema.leads.assignedSmId))
    .all()
    .filter((lead) => !lead.deletedAt && !FINAL_LEAD_STATUSES.has(lead.status));
}

/** Today in IST, exported for callers who need the routing clock. */
export const routingToday = istToday;
