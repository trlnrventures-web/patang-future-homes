import { getDb } from "./db";
import * as schema from "./schema";
import { eq, and, gte, lt, sql, inArray, isNull, isNotNull } from "drizzle-orm";

/**
 * Every activity that represents a call attempt. `call_incoming` and
 * `call_missed` are included so a call the lead placed counts towards the day's
 * call volume; the outbound/inbound split is reported separately rather than
 * being inferred from the total.
 */
const CALL_TYPES = [
  "call",
  "call_connected",
  "call_no_answer",
  "call_busy",
  "call_wrong_number",
  "call_back",
  "call_not_interested",
  "call_other",
  "call_incoming",
  "call_missed",
] as const;

/**
 * Attempts that reached a person. An answered inbound call counts as connected:
 * the lead got through, and reporting it as a miss would understate the day for
 * whoever picked up. `call_incoming` is only ever written for a non-missed
 * inbound call, so no extra filtering is needed.
 */
const CONNECTED_TYPES = ["call_connected", "call_incoming"] as const;

/**
 * Talk time is summed from `call_sessions` rather than from activity rows,
 * because only the session knows how long the call actually ran. Counting
 * activity rows would report every attempt as taking the same time, which is
 * worse than reporting nothing.
 */
function callTimeForEmployee(
  employeeId: number,
  from: string,
  to: string
): { talkSeconds: number; timedCalls: number } {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.callSessions)
    .where(
      and(
        eq(schema.callSessions.userId, employeeId),
        isNotNull(schema.callSessions.durationSeconds),
        gte(schema.callSessions.startedAt, from),
        lt(schema.callSessions.startedAt, to)
      )
    )
    .all();
  return {
    talkSeconds: rows.reduce((sum, r) => sum + (r.durationSeconds ?? 0), 0),
    timedCalls: rows.length,
  };
}

function talkTimeForAll(from: string, to: string): { talkSeconds: number; timedCalls: number } {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.callSessions)
    .where(
      and(
        isNotNull(schema.callSessions.durationSeconds),
        gte(schema.callSessions.startedAt, from),
        lt(schema.callSessions.startedAt, to)
      )
    )
    .all();
  return {
    talkSeconds: rows.reduce((sum, r) => sum + (r.durationSeconds ?? 0), 0),
    timedCalls: rows.length,
  };
}

const VISIT_COMPLETION_TYPES = ["visit_done", "post_visit_feedback"] as const;

export type EmployeeForReport = { id: number; name: string; role: string };

export type DailyMetrics = {
  newLeads: number;
  assigned: number;
  calls: number;
  connected: number;
  qualified: number;
  followUpsCompleted: number;
  noResponse: number;
  visitsBooked: number;
  visitsCompleted: number;
  negotiations: number;
  bookings: number;
  /** Total seconds actually spent talking, summed from timed attempts. */
  talkSeconds: number;
  /** Attempts that carry a measured duration. */
  timedCalls: number;
  /** Average talk time over those attempts, in seconds. 0 when none. */
  avgTalkSeconds: number;
  /**
   * Connected calls as a percentage of attempts, 0-100. Null is not used: a
   * day with no calls reads as 0%, which is what a manager expects to see.
   */
  connectRatePct: number;
  /** Calls that came in from the lead rather than being placed by the team. */
  inboundCalls: number;
  missedCalls: number;
};

export const EMPTY_METRICS: DailyMetrics = {
  newLeads: 0,
  assigned: 0,
  calls: 0,
  connected: 0,
  qualified: 0,
  followUpsCompleted: 0,
  noResponse: 0,
  visitsBooked: 0,
  visitsCompleted: 0,
  negotiations: 0,
  bookings: 0,
  talkSeconds: 0,
  timedCalls: 0,
  avgTalkSeconds: 0,
  connectRatePct: 0,
  inboundCalls: 0,
  missedCalls: 0,
};

/**
 * Fills the call-time and connect-rate fields from a day's raw counts. Shared by
 * the per-employee and whole-team paths so both define "connect rate" the same
 * way — a discrepancy between the two views would be read as a bug.
 */
export function withCallDerivedMetrics(
  metrics: DailyMetrics,
  talk: { talkSeconds: number; timedCalls: number }
): DailyMetrics {
  metrics.talkSeconds = talk.talkSeconds;
  metrics.timedCalls = talk.timedCalls;
  metrics.avgTalkSeconds =
    talk.timedCalls > 0 ? Math.round(talk.talkSeconds / talk.timedCalls) : 0;
  // "Connected" is already counted above, so the rate is against total attempts.
  metrics.connectRatePct = metrics.calls > 0 ? Math.round((metrics.connected / metrics.calls) * 100) : 0;
  return metrics;
}

// Reporting timezone is fixed to India (Asia/Kolkata, UTC+05:30) for the whole organization.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function istToday(): string {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

export function istNow(): string {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 16);
}

export function istDayRange(date: string): { from: string; to: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid date");
  }
  const startMs = new Date(`${date}T00:00:00+05:30`).getTime();
  if (Number.isNaN(startMs)) {
    throw new Error("Invalid date");
  }
  return {
    from: new Date(startMs).toISOString(),
    to: new Date(startMs + 86400000).toISOString(),
  };
}

function countActivitiesForTypes(type: string, userId: number, from: string, to: string): number {
  const db = getDb();
  return db
    .select()
    .from(schema.activities)
    .where(
      and(
        sql`${schema.activities.type} = ${type}`,
        eq(schema.activities.userId, userId),
        gte(schema.activities.createdAt, from),
        lt(schema.activities.createdAt, to)
      )
    )
    .all().length;
}

function liveLeadIds(): Set<number> {
  const db = getDb();
  return new Set(
    db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(isNull(schema.leads.deletedAt))
      .all()
      .map((r) => r.id)
  );
}

export function getDailyMetricsForEmployee(
  employee: EmployeeForReport,
  date: string
): DailyMetrics {
  const db = getDb();
  const { from, to } = istDayRange(date);
  const metrics: DailyMetrics = { ...EMPTY_METRICS };
  const activeIds = liveLeadIds();

  // ---- Shared (call + qualification + follow-up) ----
  metrics.calls = CALL_TYPES.reduce((sum, t) => sum + countActivitiesForTypes(t, employee.id, from, to), 0);
  metrics.connected = CONNECTED_TYPES.reduce(
    (sum, t) => sum + countActivitiesForTypes(t, employee.id, from, to),
    0
  );
  metrics.qualified = countActivitiesForTypes("qualification", employee.id, from, to);
  withCallDerivedMetrics(metrics, callTimeForEmployee(employee.id, from, to));
  const inbound = inboundCountsForEmployee(employee.id, from, to);
  metrics.inboundCalls = inbound.inbound;
  metrics.missedCalls = inbound.missed;

  metrics.followUpsCompleted = db
    .select()
    .from(schema.followUps)
    .where(
      and(
        eq(schema.followUps.userId, employee.id),
        eq(schema.followUps.status, "completed"),
        gte(schema.followUps.completedAt, from),
        lt(schema.followUps.completedAt, to)
      )
    )
    .all()
    .filter((f) => activeIds.has(f.leadId)).length;

  if (employee.role === "caller") {
    metrics.newLeads = db
      .select()
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.assignedCallerId, employee.id),
          isNull(schema.leads.deletedAt),
          gte(schema.leads.createdAt, from),
          lt(schema.leads.createdAt, to)
        )
      )
      .all().length;

    metrics.assigned = countActivitiesForTypes("assignment", employee.id, from, to);

    metrics.noResponse = db
      .select()
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.assignedCallerId, employee.id),
          eq(schema.leads.status, "no_response"),
          isNull(schema.leads.deletedAt),
          gte(schema.leads.updatedAt, from),
          lt(schema.leads.updatedAt, to)
        )
      )
      .all().length;
  } else {
    metrics.assigned = db
      .select()
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.assignedSmId, employee.id),
          isNull(schema.leads.deletedAt),
          gte(schema.leads.assignedAt, from),
          lt(schema.leads.assignedAt, to)
        )
      )
      .all().filter((l) => l.assignedAt).length;

    metrics.visitsBooked = db
      .select()
      .from(schema.siteVisits)
      .where(
        and(
          eq(schema.siteVisits.smId, employee.id),
          gte(schema.siteVisits.createdAt, from),
          lt(schema.siteVisits.createdAt, to)
        )
      )
      .all()
      .filter((v) => activeIds.has(v.leadId)).length;

    const completionRows = db
      .select({ leadId: schema.activities.leadId })
      .from(schema.activities)
      .where(
        and(
          eq(schema.activities.userId, employee.id),
          inArray(schema.activities.type, VISIT_COMPLETION_TYPES),
          gte(schema.activities.createdAt, from),
          lt(schema.activities.createdAt, to)
        )
      )
      .all()
      .filter((r) => activeIds.has(r.leadId));
    metrics.visitsCompleted = new Set(completionRows.map((r) => r.leadId)).size;

    metrics.negotiations = db
      .select()
      .from(schema.negotiations)
      .where(
        and(
          eq(schema.negotiations.assignedSmId, employee.id),
          gte(schema.negotiations.createdAt, from),
          lt(schema.negotiations.createdAt, to)
        )
      )
      .all()
      .filter((n) => activeIds.has(n.leadId)).length;

    metrics.bookings = db
      .select()
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.smId, employee.id),
          eq(schema.bookings.status, "confirmed"),
          gte(schema.bookings.updatedAt, from),
          lt(schema.bookings.updatedAt, to)
        )
      )
      .all()
      .filter((b) => activeIds.has(b.leadId)).length;
  }

  return metrics;
}

/** Inbound and missed counts for one employee, from the session log. */
function inboundCountsForEmployee(
  employeeId: number,
  from: string,
  to: string
): { inbound: number; missed: number } {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.callSessions)
    .where(
      and(
        eq(schema.callSessions.userId, employeeId),
        eq(schema.callSessions.direction, "inbound"),
        gte(schema.callSessions.startedAt, from),
        lt(schema.callSessions.startedAt, to)
      )
    )
    .all();
  return {
    inbound: rows.length,
    missed: rows.filter((r) => r.status === "missed").length,
  };
}

export type TeamReport = {
  date: string;
  totals: DailyMetrics;
  callers: { id: number; name: string; metrics: DailyMetrics }[];
  salesManagers: { id: number; name: string; metrics: DailyMetrics }[];
};

export function getTeamReport(date: string): TeamReport {
  const db = getDb();
  const { from, to } = istDayRange(date);

  const users = db.select().from(schema.users).all().filter((u) => u.active);

  const activeIds = liveLeadIds();

  const activityCount = (type: string) =>
    db
      .select()
      .from(schema.activities)
      .where(
        and(
          sql`${schema.activities.type} = ${type}`,
          gte(schema.activities.createdAt, from),
          lt(schema.activities.createdAt, to)
        )
      )
      .all().length;

  const totals: DailyMetrics = { ...EMPTY_METRICS };
  totals.newLeads = db
    .select()
    .from(schema.leads)
    .where(and(isNull(schema.leads.deletedAt), gte(schema.leads.createdAt, from), lt(schema.leads.createdAt, to)))
    .all().length;
  totals.calls = CALL_TYPES.reduce((sum, t) => sum + activityCount(t), 0);
  totals.connected = CONNECTED_TYPES.reduce((sum, t) => sum + activityCount(t), 0);
  totals.qualified = activityCount("qualification");
  withCallDerivedMetrics(totals, talkTimeForAll(from, to));

  const inboundRows = db
    .select()
    .from(schema.callSessions)
    .where(
      and(
        eq(schema.callSessions.direction, "inbound"),
        gte(schema.callSessions.startedAt, from),
        lt(schema.callSessions.startedAt, to)
      )
    )
    .all();
  totals.inboundCalls = inboundRows.length;
  totals.missedCalls = inboundRows.filter((r) => r.status === "missed").length;

  totals.followUpsCompleted = db
    .select()
    .from(schema.followUps)
    .where(
      and(
        eq(schema.followUps.status, "completed"),
        gte(schema.followUps.completedAt, from),
        lt(schema.followUps.completedAt, to)
      )
    )
    .all()
    .filter((f) => activeIds.has(f.leadId)).length;

  totals.visitsBooked = db
    .select()
    .from(schema.siteVisits)
    .where(and(gte(schema.siteVisits.createdAt, from), lt(schema.siteVisits.createdAt, to)))
    .all()
    .filter((v) => activeIds.has(v.leadId)).length;

  const completionRows = db
    .select({ leadId: schema.activities.leadId })
    .from(schema.activities)
    .where(
      and(
        inArray(schema.activities.type, VISIT_COMPLETION_TYPES),
        gte(schema.activities.createdAt, from),
        lt(schema.activities.createdAt, to)
      )
    )
    .all()
    .filter((r) => activeIds.has(r.leadId));
  totals.visitsCompleted = new Set(completionRows.map((r) => r.leadId)).size;

  totals.negotiations = db
    .select()
    .from(schema.negotiations)
    .where(and(gte(schema.negotiations.createdAt, from), lt(schema.negotiations.createdAt, to)))
    .all()
    .filter((n) => activeIds.has(n.leadId)).length;

  totals.bookings = db
    .select()
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.status, "confirmed"),
        gte(schema.bookings.updatedAt, from),
        lt(schema.bookings.updatedAt, to)
      )
    )
    .all()
    .filter((b) => activeIds.has(b.leadId)).length;

  const callers = users
    .filter((u) => u.role === "caller")
    .map((u) => ({ id: u.id, name: u.name, metrics: getDailyMetricsForEmployee({ id: u.id, name: u.name, role: u.role }, date) }));

  const salesManagers = users
    .filter((u) => u.role === "sales_manager")
    .map((u) => ({ id: u.id, name: u.name, metrics: getDailyMetricsForEmployee({ id: u.id, name: u.name, role: u.role }, date) }));

  return { date, totals, callers, salesManagers };
}

/* ------------------------------------------------------------------ */
/* Vasai West conversion funnel                                       */
/* ------------------------------------------------------------------ */

export type LostReasonCount = { reason: string; count: number };

/**
 * One row of the conversion funnel. Percentages are computed on the graded
 * cohort, because an ungraded lead has not entered the funnel yet.
 */
export type FunnelSlice = {
  key: string;
  label: string;
  totalLeads: number;
  graded: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  aSharePct: number;
  visitsBooked: number;
  visitsDone: number;
  booked: number;
  lost: number;
  dormant: number;
  visitBookedPct: number;
  visitDonePct: number;
  bookingPct: number;
  lostPct: number;
  lostReasons: LostReasonCount[];
};

export type ConversionFunnel = {
  from: string;
  to: string;
  overall: FunnelSlice;
  perCaller: FunnelSlice[];
  perSm: FunnelSlice[];
  perProject: FunnelSlice[];
};

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function emptySlice(key: string, label: string): FunnelSlice {
  return {
    key,
    label,
    totalLeads: 0,
    graded: 0,
    gradeA: 0,
    gradeB: 0,
    gradeC: 0,
    aSharePct: 0,
    visitsBooked: 0,
    visitsDone: 0,
    booked: 0,
    lost: 0,
    dormant: 0,
    visitBookedPct: 0,
    visitDonePct: 0,
    bookingPct: 0,
    lostPct: 0,
    lostReasons: [],
  };
}

function projectTitle(slug: string | null | undefined, lookup: Map<string, string>): string {
  if (!slug) return "No project";
  return lookup.get(slug) || slug;
}

/**
 * The Vasai West funnel for a date window: grade mix and A-share, visit booked
 * and visit done rates, booking rate, and lost reasons — overall and split by
 * caller, SM and pitched project.
 *
 * The cohort is leads created inside the window. Visits, outcomes and lost
 * reasons are then attached to those leads regardless of when they happened, so
 * a lead created on day 1 still counts its day 20 follow-up.
 */
export function getConversionFunnel(
  fromDate: string,
  toDate: string,
  projectLookup: Map<string, string> = new Map(),
): ConversionFunnel {
  const db = getDb();
  const { from } = istDayRange(fromDate);
  const { to } = istDayRange(toDate);

  const leads = db
    .select()
    .from(schema.leads)
    .where(and(isNull(schema.leads.deletedAt), gte(schema.leads.createdAt, from), lt(schema.leads.createdAt, to)))
    .all();

  const leadIds = new Set(leads.map((l) => l.id));
  const visits = db
    .select()
    .from(schema.siteVisits)
    .all()
    .filter((v) => leadIds.has(v.leadId));

  const visitsByLead = new Map<number, typeof visits>();
  for (const visit of visits) {
    const list = visitsByLead.get(visit.leadId) || [];
    list.push(visit);
    visitsByLead.set(visit.leadId, list);
  }

  const users = db.select().from(schema.users).all();
  const userMap = new Map(users.map((u) => [u.id, u]));

  const build = (key: string, label: string, cohort: typeof leads): FunnelSlice => {
    const slice = emptySlice(key, label);
    const lostCounter = new Map<string, number>();

    for (const lead of cohort) {
      slice.totalLeads += 1;
      if (lead.grade === "A") slice.gradeA += 1;
      else if (lead.grade === "B") slice.gradeB += 1;
      else if (lead.grade === "C") slice.gradeC += 1;
      if (lead.grade) slice.graded += 1;
      if (lead.status === "lost") slice.lost += 1;
      if (lead.dormantAt) slice.dormant += 1;

      const leadVisits = visitsByLead.get(lead.id) || [];
      const hasBooking = leadVisits.some((v) => !!v.date && !!v.time && v.status !== "cancelled");
      const isDone = leadVisits.some((v) => v.status === "visit_done" || !!v.outcome);
      const isBooked = lead.status === "booked" || leadVisits.some((v) => v.outcome === "token_paid");
      if (hasBooking) slice.visitsBooked += 1;
      if (isDone) slice.visitsDone += 1;
      if (isBooked) slice.booked += 1;

      for (const visit of leadVisits) {
        if (visit.outcome !== "lost") continue;
        const reason = (visit.outcomeReason || "No reason given").trim() || "No reason given";
        lostCounter.set(reason, (lostCounter.get(reason) || 0) + 1);
      }
    }

    slice.aSharePct = pct(slice.gradeA, slice.graded);
    slice.visitBookedPct = pct(slice.visitsBooked, slice.graded);
    slice.visitDonePct = pct(slice.visitsDone, slice.visitsBooked);
    slice.bookingPct = pct(slice.booked, slice.visitsDone);
    slice.lostPct = pct(slice.lost, slice.graded);
    slice.lostReasons = [...lostCounter.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return slice;
  };

  const groupBy = (
    keyOf: (lead: (typeof leads)[number]) => string,
    labelOf: (key: string) => string,
  ): FunnelSlice[] => {
    const groups = new Map<string, typeof leads>();
    for (const lead of leads) {
      const key = keyOf(lead);
      const list = groups.get(key) || [];
      list.push(lead);
      groups.set(key, list);
    }
    return [...groups.entries()]
      .map(([key, cohort]) => build(key, labelOf(key), cohort))
      .sort((a, b) => b.graded - a.graded || b.totalLeads - a.totalLeads);
  };

  return {
    from: fromDate,
    to: toDate,
    overall: build("all", "Overall", leads),
    perCaller: groupBy(
      (lead) => (lead.assignedCallerId != null ? String(lead.assignedCallerId) : "none"),
      (key) => (key === "none" ? "Unassigned" : userMap.get(Number(key))?.name || "Former team member"),
    ),
    perSm: groupBy(
      (lead) => (lead.assignedSmId != null ? String(lead.assignedSmId) : "none"),
      (key) => (key === "none" ? "Unassigned" : userMap.get(Number(key))?.name || "Former team member"),
    ),
    perProject: groupBy(
      (lead) => lead.pitchedProjectSlug || "none",
      (key) => (key === "none" ? "No pitched project" : projectTitle(key, projectLookup)),
    ),
  };
}