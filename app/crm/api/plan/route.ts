import { NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { and, eq, lt, inArray } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { istToday } from "@/lib/crm/attendance";
import { getApprovedLeaveDaysForUser, isWeekOffDate } from "@/lib/crm/attendance";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const today = istToday();
  const istNow = new Date(new Date().getTime() + (5 * 60 + 30) * 60 * 1000).toISOString();

  let overdueFollowUps = 0;
  if (user.role === "sales_manager" || user.role === "caller") {
    overdueFollowUps = db
      .select()
      .from(schema.followUps)
      .where(and(eq(schema.followUps.userId, user.id), eq(schema.followUps.status, "pending"), lt(schema.followUps.scheduledFor, istNow)))
      .all().length;
  } else {
    overdueFollowUps = db
      .select()
      .from(schema.followUps)
      .where(and(eq(schema.followUps.status, "pending"), lt(schema.followUps.scheduledFor, istNow)))
      .all().length;
  }

  const todayVisitsRaw = db
    .select()
    .from(schema.siteVisits)
    .all()
    .filter((v) => v.date === today);
  const todayVisits =
    user.role === "sales_manager"
      ? todayVisitsRaw.filter((v) => v.smId === user.id).length
      : todayVisitsRaw.length;

  let hotLeads = 0;
  const hotStatuses: (typeof schema.leads.status)["_"]["data"][] = ["new", "calling", "follow_up", "visit_booked", "assigned"];
  if (user.role === "sales_manager") {
    hotLeads = db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.assignedSmId, user.id), inArray(schema.leads.status, hotStatuses)))
      .all().length;
  } else if (user.role === "caller") {
    hotLeads = db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.assignedCallerId, user.id), inArray(schema.leads.status, hotStatuses)))
      .all().length;
  } else {
    hotLeads = db
      .select()
      .from(schema.leads)
      .where(inArray(schema.leads.status, hotStatuses))
      .all().length;
  }

  let dayNote = "";
  const userRow = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
  if (isWeekOffDate(today, userRow?.weekOffDay || "")) {
    dayNote = "It is your weekly off today. Relax and recharge!";
  } else if (getApprovedLeaveDaysForUser(user.id).has(today)) {
    dayNote = "Today is an approved leave for you.";
  }

  return NextResponse.json({
    day: today,
    overdueFollowUps,
    todayVisits,
    hotLeads,
    dayNote,
  });
}