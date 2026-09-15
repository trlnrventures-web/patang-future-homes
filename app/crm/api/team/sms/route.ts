import { NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const activeStatuses = [
    "qualified", "assigned", "follow_up", "visit_proposed",
    "visit_booked", "visit_confirmed", "negotiation",
  ];

  const smUsers = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, "sales_manager" as never))
    .all();

  const response = smUsers.map((sm) => {
    const myLeads = db.select().from(schema.leads).where(eq(schema.leads.assignedSmId, sm.id)).all();
    const activeLeads = myLeads.filter((l) => activeStatuses.includes(l.status));
    const followUps = db.select().from(schema.followUps).where(eq(schema.followUps.userId, sm.id)).all();
    const todaysFollowUps = followUps.filter(
      (f) => f.status === "pending" && f.scheduledFor.slice(0, 10) === today
    );
    const overdueFollowUps = followUps.filter(
      (f) => f.status === "pending" && f.scheduledFor < nowIso
    );
    const visits = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.smId, sm.id)).all();
    const upcomingVisits = visits.filter(
      (v) =>
        ["proposed", "booked", "confirmed"].includes(v.status) &&
        (new Date(`${v.date}T${v.time || "00:00"}`).getTime() > now.getTime())
    );

    return {
      id: sm.id,
      name: sm.name,
      email: sm.email,
      activeLeads: activeLeads.length,
      todaysFollowUps: todaysFollowUps.length,
      upcomingVisits: upcomingVisits.length,
      overdueFollowUps: overdueFollowUps.length,
      totalLeads: myLeads.length,
    };
  });

  return NextResponse.json({ sms: response });
}