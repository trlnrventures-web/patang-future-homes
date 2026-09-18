import { NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { computeSlaStatus, getPriority } from "@/lib/crm/sla-compute";
import { formatLeadAge, leadAgeMinutes, type PriorityLevel } from "@/lib/crm/sla";
import { getDailyMetricsForEmployee, istToday, istDayRange, type DailyMetrics } from "@/lib/crm/reports";
import { buildEarliestFollowUpMap, isInCallerScope } from "@/lib/crm/leads";

export type DashboardLeadCard = {
  id: number;
  name: string;
  phone: string;
  whatsappNumber: string | null;
  source: string;
  campaignName: string | null;
  originalProject: string | null;
  location: string | null;
  bhk: string | null;
  budget: string | null;
  status: string;
  concern: string | null;
  nextAction: string;
  nextFollowUp: string;
  nextFollowUpIso: string | null;
  hasOverdueFollowUp: boolean;
  priority: string;
  leadAge: string;
  leadAgeMinutes: number;
  attemptCount: number;
  slaStatus: string;
  assignedSmName: string;
};

function nextActionFor(lead: {
  status: string;
  assignedSmId: number | null;
  nextFollowUp: string | null;
  nextAction: string | null;
}): string {
  if (lead.nextAction && lead.nextAction !== "none") {
    const map: Record<string, string> = {
      qualification: "Qualify",
      callback: "Call back",
      review_assignment: "Review & assign",
      property_matching: "Match properties",
      sm_follow_up: "SM follow-up",
      site_visit: "Site visit",
      follow_up: "Follow up",
      nurture: "Nurture",
    };
    return map[lead.nextAction] || lead.nextAction;
  }
  switch (lead.status) {
    case "new":
    case "calling":
      return "First Call";
    case "connected":
      return "Qualify";
    case "no_response":
      return "Call back";
    case "qualified":
      return lead.assignedSmId ? "Review handoff" : "Assign to SM";
    case "assigned":
      return "SM follow-up";
    case "follow_up":
      return "Follow up";
    case "visit_proposed":
    case "visit_booked":
    case "visit_confirmed":
      return "Site visit";
    case "negotiation":
      return "Negotiate";
    case "nurture":
      return "Nurture";
    case "booked":
      return "Booking follow-up";
    default:
      return "Next step";
  }
}

function enrichLead(l: (typeof schema.leads.$inferSelect), now: Date, userMap: Map<number, string>, terminal: Set<string>, earliestFollowUp: Map<number, string>): DashboardLeadCard {
  const slaStatus = computeSlaStatus(l.createdAt, l.firstCallAt);
  const priority = getPriority(l);
  const nextFollowUpIso = l.nextFollowUp || l.nextAttemptAt || earliestFollowUp.get(l.id) || null;
  const hasOverdueFollowUp = nextFollowUpIso != null && new Date(nextFollowUpIso).getTime() < now.getTime() && !terminal.has(l.status);

  const checkHours = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec((nextFollowUpIso || "").replace(" ", "T"));
  const nextFollowUpDisplay = checkHours
    ? `${checkHours[1].slice(5).split("-").reverse().join("/")} ${checkHours[2]}`
    : nextFollowUpIso
      ? new Date(nextFollowUpIso).toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  return {
    id: l.id,
    name: l.name,
    phone: l.phone,
    whatsappNumber: l.whatsappNumber,
    source: l.source,
    campaignName: l.campaignName,
    originalProject: l.originalProject,
    location: l.location,
    bhk: l.bhk,
    budget: l.budget,
    status: l.status,
    concern: l.concern,
    nextAction: nextActionFor(l),
    nextFollowUp: nextFollowUpDisplay,
    nextFollowUpIso,
    hasOverdueFollowUp,
    priority,
    leadAge: formatLeadAge(l.createdAt),
    leadAgeMinutes: Math.round(leadAgeMinutes(l.createdAt)),
    attemptCount: l.attemptCount ?? 0,
    slaStatus,
    assignedSmName: l.assignedSmId ? userMap.get(l.assignedSmId) || "" : "",
  };
}

const PRIORITY_RANK: Record<PriorityLevel, number> = {
  p1_new: 1,
  p2_approaching_sla: 2,
  p3_overdue_call: 3,
  p4_callback: 4,
  p5_ready_to_assign: 5,
  p6_follow_up: 6,
  p7_no_response: 7,
  p8_idle: 8,
};

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

  const terminal = new Set(["invalid", "lost", "dnc", "booked"]);

const myLeads = db
    .select()
    .from(schema.leads)
    .where(isNull(schema.leads.deletedAt))
    .orderBy(desc(schema.leads.createdAt))
    .all()
    .filter(isInCallerScope);

  const pendingFollowUps = db
    .select()
    .from(schema.followUps)
    .where(eq(schema.followUps.status, "pending"))
    .all()
    .filter((f) => myLeads.some((l) => l.id === f.leadId));

  const todayPending = new Map<number, string>();
  for (const f of pendingFollowUps) {
    if (f.scheduledFor && f.scheduledFor >= from && f.scheduledFor < to) {
      todayPending.set(f.leadId, f.scheduledFor);
    }
  }

  const users = db.select().from(schema.users).all();
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const earliestFollowUp = buildEarliestFollowUpMap(db);

  const active = myLeads.filter((l) => !terminal.has(l.status));

  const overdueLeads = active.filter((l) => {
    const nxt = l.nextFollowUp || l.nextAttemptAt;
    return !!nxt && new Date(nxt).getTime() < now.getTime();
  });

  const callNow = [...active]
    .sort((a, b) => {
      const aOver = overdueLeads.some((l) => l.id === a.id) ? 0 : 1;
      const bOver = overdueLeads.some((l) => l.id === b.id) ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const pa = PRIORITY_RANK[getPriority(a) as PriorityLevel] ?? 9;
      const pb = PRIORITY_RANK[getPriority(b) as PriorityLevel] ?? 9;
      if (pa !== pb) return pa - pb;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
    .slice(0, 8)
    .map((l) => enrichLead(l, now, userMap, terminal, earliestFollowUp));

  const cardFor = (leadId: number) => {
    const l = myLeads.find((x) => x.id === leadId);
    return l ? enrichLead(l, now, userMap, terminal, earliestFollowUp) : null;
  };

  const followUpsToday = [...todayPending.keys()]
    .filter((leadId) => !overdueLeads.some((l) => l.id === leadId))
    .map(cardFor)
    .filter((c): c is DashboardLeadCard => c != null)
    .sort((a, b) => (a.nextFollowUpIso || "").localeCompare(b.nextFollowUpIso || ""))
    .slice(0, 6);

  const overdue = overdueLeads.map((l) => enrichLead(l, now, userMap, terminal, earliestFollowUp)).slice(0, 6);

  const newToday = active
    .filter((l) => l.status === "new" && l.createdAt >= from && l.createdAt < to)
    .map((l) => enrichLead(l, now, userMap, terminal, earliestFollowUp))
    .slice(0, 6);

  const noResponse = active
    .filter((l) => l.status === "no_response")
    .map((l) => enrichLead(l, now, userMap, terminal, earliestFollowUp))
    .slice(0, 6);

  const metrics = getDailyMetricsForEmployee({ id: user.id, name: user.name, role: user.role }, date);

  return NextResponse.json({
    date,
    metrics: metrics as DailyMetrics,
    counts: {
      callNow: callNow.length,
      followUpsToday: todayPending.size,
      overdue: overdueLeads.length,
      newToday: active.filter((l) => l.status === "new" && l.createdAt >= from && l.createdAt < to).length,
      noResponse: active.filter((l) => l.status === "no_response").length,
    },
    queues: {
      callNow,
      followUpsToday,
      overdue,
      newToday,
      noResponse,
    },
  });
}
