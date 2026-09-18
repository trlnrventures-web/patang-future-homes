import { NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, isNull } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";

const ACTIVE_LEAD_STATUSES = new Set([
  "new",
  "calling",
  "connected",
  "qualified",
  "assigned",
  "follow_up",
  "nurture",
  "visit_proposed",
  "visit_booked",
  "visit_confirmed",
  "negotiation",
]);

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);

  const allLeads = db
    .select()
    .from(schema.leads)
    .where(isNull(schema.leads.deletedAt))
    .all();
  const allFollowUps = db.select().from(schema.followUps).all();
  const allVisits = db.select().from(schema.siteVisits).all();

  const build = (
    u: { id: number; name: string; email: string },
    role: "caller" | "sales_manager"
  ) => {
    const myLeads = allLeads.filter(
      (l) => (role === "caller" ? l.assignedCallerId === u.id : l.assignedSmId === u.id)
    );
    const activeLeads = myLeads.filter((l) => ACTIVE_LEAD_STATUSES.has(l.status));
    const followUps = allFollowUps.filter((f) => f.userId === u.id);
    const todaysFollowUps = followUps.filter(
      (f) => f.status === "pending" && f.scheduledFor.slice(0, 10) === today
    );
    const overdueFollowUps = followUps.filter(
      (f) => f.status === "pending" && f.scheduledFor < nowIso
    );
    const upcomingVisits =
      role === "sales_manager"
        ? allVisits.filter(
            (v) =>
              v.smId === u.id &&
              ["proposed", "booked", "confirmed"].includes(v.status) &&
              new Date(`${v.date}T${v.time || "00:00"}`).getTime() > now.getTime()
          ).length
        : 0;

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role,
      activeLeads: activeLeads.length,
      todaysFollowUps: todaysFollowUps.length,
      upcomingVisits,
      overdueFollowUps: overdueFollowUps.length,
      totalLeads: myLeads.length,
    };
  };

  const callers = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, "caller" as never))
    .all()
    .map((u) => build(u, "caller"));

  const sms = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, "sales_manager" as never))
    .all()
    .map((u) => build(u, "sales_manager"));

  return NextResponse.json({ callers, sms });
}