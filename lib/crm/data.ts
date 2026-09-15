import { getAuthUser } from "./auth";
import { getDb } from "./db";
import * as schema from "./schema";
import { eq, desc } from "drizzle-orm";

export type CrmUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  phone: string | null;
};

export async function getCurrentUser(): Promise<CrmUser | null> {
  const auth = await getAuthUser();
  if (!auth) return null;

  const db = getDb();
  const user = db.select().from(schema.users).where(eq(schema.users.id, auth.id)).get();
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
  };
}

export async function getAllUsers() {
  const db = getDb();
  return db.select().from(schema.users).all();
}

export async function getDashboardData(user: CrmUser) {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  let myLeads: (typeof schema.leads.$inferSelect)[] = [];

  if (user.role === "caller") {
    myLeads = db.select().from(schema.leads).where(eq(schema.leads.assignedCallerId, user.id)).all();
  } else if (user.role === "sales_manager") {
    myLeads = db.select().from(schema.leads).where(eq(schema.leads.assignedSmId, user.id)).all();
  } else {
    myLeads = db.select().from(schema.leads).all();
  }

  const allLeads = db.select().from(schema.leads).all();
  const allSiteVisits = db.select().from(schema.siteVisits).all();
  const allBookings = db.select().from(schema.bookings).all();
  const users = db.select().from(schema.users).all();
  const callerMap = new Map(users.filter((u) => u.role === "caller").map((u) => [u.id, u.name]));
  const smMap = new Map(users.filter((u) => u.role === "sales_manager").map((u) => [u.id, u.name]));
  const smUsers = users.filter((u) => u.role === "sales_manager");

  const smStats = smUsers.map((sm) => {
    const assigned = allLeads.filter((l) => l.assignedSmId === sm.id);
    const leads = assigned.length;
    const connected = assigned.filter((l) =>
      ["qualified", "assigned", "follow_up", "visit_proposed", "visit_booked", "visit_confirmed", "visit_done", "negotiation", "booked"].includes(l.status)
    ).length;
    const followUps = db.select().from(schema.followUps).where(eq(schema.followUps.userId, sm.id)).all();
    const overdue = followUps.filter((f) => f.status === "pending" && f.scheduledFor < nowIso).length;
    const visits = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.smId, sm.id)).all();
    const visitsCompleted = visits.filter((v) => v.status === "visit_done").length;
    const bookings = assigned.filter((l) => l.status === "booked").length;
    return {
      id: sm.id,
      name: sm.name,
      leads,
      connected,
      qualificationRate: leads ? Math.round((connected / leads) * 100) : 0,
      overdue,
      visitsCompleted,
      bookings,
      visitToBooking: visitsCompleted ? Math.round((bookings / visitsCompleted) * 100) : 0,
      leadToBooking: leads ? Math.round((bookings / leads) * 100) : 0,
    };
  });

  const callerStats = users
    .filter((u) => u.role === "caller")
    .map((caller) => {
      const assigned = allLeads.filter((l) => l.assignedCallerId === caller.id);
      const contacted = assigned.filter((l) =>
        ["calling", "connected", "qualified", "assigned", "follow_up", "visit_proposed", "visit_booked", "visit_confirmed", "visit_done", "negotiation", "booked", "no_response"].includes(l.status)
      ).length;
      const qualified = assigned.filter((l) => l.status === "qualified").length;
      const assignedOut = assigned.filter((l) => l.assignedSmId).length;
      const noResponse = assigned.filter((l) => l.status === "no_response").length;
      return {
        id: caller.id,
        name: caller.name,
        leads: assigned.length,
        contacted,
        contactRate: assigned.length ? Math.round((contacted / assigned.length) * 100) : 0,
        qualified,
        assignedOut,
        noResponse,
      };
    });

  const callerDashboard = user.role === "caller" ? (() => {
    const myToday = myLeads.filter((l) => l.createdAt.slice(0, 10) === today);
    const calledToday = myLeads.filter((l) => l.lastAttemptAt?.slice(0, 10) === today);
    const connectedLeads = myLeads.filter((l) => l.status === "connected");
    const qualifiedLeads = myLeads.filter((l) => l.status === "qualified");
    const assignedSm = myLeads.filter((l) => l.status === "assigned" || (l.assignedSmId != null && l.status !== "new"));
    const noResponse = myLeads.filter((l) => l.status === "no_response");
    const slaInMin = 5;
    const overdueCount = myLeads.filter((l) => {
      if (l.status === "new" || l.status === "calling") {
        return (new Date(nowIso).getTime() - new Date(l.createdAt).getTime()) / 60000 >= slaInMin;
      }
      const nxt = l.nextFollowUp || l.nextAttemptAt;
      return !!nxt && new Date(nxt).getTime() < new Date(nowIso).getTime();
    }).length;
    const todayNew = myToday.length;
    const todayWithFirstCall = myToday.filter((l) => l.firstCallAt).length;
    const slaCompliancePct = todayNew > 0 ? Math.round((todayWithFirstCall / todayNew) * 100) : 100;
    const responseTimes = connectedLeads.filter((l) => l.firstResponseTimeSeconds != null && l.firstResponseTimeSeconds > 0);
    const avgFirstResponseSec = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, l) => a + (l.firstResponseTimeSeconds ?? 0), 0) / responseTimes.length)
      : null;
    return {
      newToday: todayNew,
      calledToday: calledToday.length,
      connected: connectedLeads.length,
      qualified: qualifiedLeads.length,
      assigned: assignedSm.length,
      noResponse: noResponse.length,
      overdueCount,
      slaCompliancePct,
      avgFirstResponseSec,
      avgFirstResponseDisplay: avgFirstResponseSec != null
        ? avgFirstResponseSec < 60 ? `${avgFirstResponseSec}s` : `${Math.round(avgFirstResponseSec / 60)}m`
        : "—",
    };
  })() : null;

  const qualified = allLeads.filter((l) =>
    ["qualified", "assigned", "follow_up", "visit_proposed", "visit_booked", "visit_confirmed", "visit_done", "negotiation", "booked"].includes(l.status)
  ).length;
  const visitsBooked = allSiteVisits.filter((v) =>
    ["booked", "confirmed", "arrived", "visit_done", "no_show"].includes(v.status)
  ).length;
  const visitsDone = allSiteVisits.filter((v) => v.status === "visit_done").length;
  const bookings = allBookings.filter((b) => b.status === "confirmed").length;

  return {
    todayLeads: allLeads.filter((l) => l.createdAt.slice(0, 10) === today).length,
    totalLeads: allLeads.length,
    qualified,
    visitsBooked,
    visitsDone,
    bookings,
    myLeads: myLeads.length,
    callers: callerStats,
    salesManagers: smStats,
    callerDashboard,
    callerMap: Object.fromEntries(callerMap),
    smMap: Object.fromEntries(smMap),
  };
}

export async function getMessagesForLead(leadId: number) {
  const db = getDb();
  return db
    .select()
    .from(schema.messageLogs)
    .where(eq(schema.messageLogs.leadId, leadId))
    .orderBy(desc(schema.messageLogs.createdAt))
    .all();
}

export async function getSharedTemplates() {
  const db = getDb();
  return db
    .select()
    .from(schema.messageTemplates)
    .where(eq(schema.messageTemplates.isPersonal, false as never))
    .all();
}

export async function getPersonalTemplates(userId: number) {
  const db = getDb();
  return db
    .select()
    .from(schema.messageTemplates)
    .where(eq(schema.messageTemplates.isPersonal, true as never))
    .all()
    .filter((t) => t.createdBy === userId);
}