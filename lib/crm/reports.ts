import { getDb } from "./db";
import * as schema from "./schema";
import { eq, and, gte, lt, sql, inArray } from "drizzle-orm";

const CALL_TYPES = [
  "call",
  "call_connected",
  "call_no_answer",
  "call_busy",
  "call_wrong_number",
  "call_back",
  "call_not_interested",
  "call_other",
] as const;

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
};

// Reporting timezone is fixed to India (Asia/Kolkata, UTC+05:30) for the whole organization.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function istToday(): string {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
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

export function getDailyMetricsForEmployee(
  employee: EmployeeForReport,
  date: string
): DailyMetrics {
  const db = getDb();
  const { from, to } = istDayRange(date);
  const metrics: DailyMetrics = { ...EMPTY_METRICS };

  // ---- Shared (call + qualification + follow-up) ----
  metrics.calls = CALL_TYPES.reduce((sum, t) => sum + countActivitiesForTypes(t, employee.id, from, to), 0);
  metrics.connected = countActivitiesForTypes("call_connected", employee.id, from, to);
  metrics.qualified = countActivitiesForTypes("qualification", employee.id, from, to);

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
    .all().length;

  if (employee.role === "caller") {
    metrics.newLeads = db
      .select()
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.assignedCallerId, employee.id),
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
      .all().length;

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
      .all();
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
      .all().length;

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
      .all().length;
  }

  return metrics;
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
    .where(and(gte(schema.leads.createdAt, from), lt(schema.leads.createdAt, to)))
    .all().length;
  totals.calls = CALL_TYPES.reduce((sum, t) => sum + activityCount(t), 0);
  totals.connected = activityCount("call_connected");
  totals.qualified = activityCount("qualification");

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
    .all().length;

  totals.visitsBooked = db
    .select()
    .from(schema.siteVisits)
    .where(and(gte(schema.siteVisits.createdAt, from), lt(schema.siteVisits.createdAt, to)))
    .all().length;

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
    .all();
  totals.visitsCompleted = new Set(completionRows.map((r) => r.leadId)).size;

  totals.negotiations = db
    .select()
    .from(schema.negotiations)
    .where(and(gte(schema.negotiations.createdAt, from), lt(schema.negotiations.createdAt, to)))
    .all().length;

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
    .all().length;

  const callers = users
    .filter((u) => u.role === "caller")
    .map((u) => ({ id: u.id, name: u.name, metrics: getDailyMetricsForEmployee({ id: u.id, name: u.name, role: u.role }, date) }));

  const salesManagers = users
    .filter((u) => u.role === "sales_manager")
    .map((u) => ({ id: u.id, name: u.name, metrics: getDailyMetricsForEmployee({ id: u.id, name: u.name, role: u.role }, date) }));

  return { date, totals, callers, salesManagers };
}