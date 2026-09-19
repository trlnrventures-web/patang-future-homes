import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { desc, isNull } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { computeSlaStatus, getPriority, isLeadActionOverdue } from "@/lib/crm/sla-compute";
import { formatLeadAge, leadAgeMinutes, type PriorityLevel } from "@/lib/crm/sla";
import { buildEarliestFollowUpMap, isInCallerScope } from "@/lib/crm/leads";

export type InboxTab =
  | "new"
  | "calling_now"
  | "today_calls"
  | "overdue"
  | "no_response"
  | "qualified"
  | "ready_to_assign"
  | "recently_assigned"
  | "follow_up"
  | "lost"
  | "all";

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

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tab = (searchParams.get("tab") || "new") as InboxTab;
  const q = (searchParams.get("q") || "").toLowerCase();

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);

  let rows = db
    .select()
    .from(schema.leads)
    .where(isNull(schema.leads.deletedAt))
    .orderBy(desc(schema.leads.createdAt))
    .all();

  if (user.role === "caller") {
    rows = q || tab === "lost" ? rows : rows.filter(isInCallerScope);
  } else if (user.role === "sales_manager") {
    rows = rows.filter((l) => l.assignedSmId === user.id);
  }

  if (q) {
    rows = rows.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.phone || "").includes(q) ||
        (l.originalProject || "").toLowerCase().includes(q) ||
        (l.campaignName || "").toLowerCase().includes(q)
    );
  }

  const terminal = new Set(["invalid", "lost", "dnc", "booked"]);

  let filtered = rows;
  switch (tab) {
    case "new":
      filtered = rows.filter((l) => l.status === "new" && !terminal.has(l.status));
      break;
    case "calling_now":
      filtered = rows.filter((l) => l.status === "calling" || l.status === "connected");
      break;
    case "today_calls":
      filtered = rows.filter((l) => l.lastAttemptAt?.slice(0, 10) === today);
      break;
    case "overdue":
      filtered = rows.filter((l) =>
        isLeadActionOverdue({
          status: l.status,
          createdAt: l.createdAt,
          firstCallAt: l.firstCallAt,
          nextActionAt: l.nextFollowUp || l.nextAttemptAt,
        })
      );
      break;
    case "no_response":
      filtered = rows.filter((l) => l.status === "no_response");
      break;
    case "qualified":
      filtered = rows.filter((l) => l.status === "qualified");
      break;
    case "ready_to_assign":
      filtered = rows.filter((l) => l.status === "qualified" && !l.assignedSmId);
      break;
    case "recently_assigned":
      filtered = rows.filter((l) => {
        if (!l.assignedSmId || !l.assignedAt) return false;
        return now.getTime() - new Date(l.assignedAt).getTime() <= 24 * 60 * 60 * 1000;
      });
      break;
    case "follow_up":
      filtered = rows.filter((l) =>
        ["follow_up", "visit_proposed", "visit_booked", "visit_confirmed", "negotiation", "assigned"].includes(l.status)
      );
      break;
    case "lost":
      filtered = rows.filter((l) => l.status === "lost");
      break;
    default:
      filtered = rows.filter((l) => !["invalid", "lost", "dnc"].includes(l.status));
      break;
  }

  const users = db.select().from(schema.users).all();
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const earliestFollowUp = buildEarliestFollowUpMap(db);

  const enriched = filtered.map((l) => {
    const slaStatus = computeSlaStatus(l.createdAt, l.firstCallAt);
    const priority = getPriority(l);
    const nextFollowUpIso = l.nextFollowUp || l.nextAttemptAt || earliestFollowUp.get(l.id) || null;
    const hasOverdueFollowUp = isLeadActionOverdue({
      status: l.status,
      createdAt: l.createdAt,
      firstCallAt: l.firstCallAt,
      nextActionAt: nextFollowUpIso,
    });

    const checkHours = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(
      (nextFollowUpIso || "").replace(" ", "T")
    );
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
      createdAt: l.createdAt,
      nextFollowUp: nextFollowUpDisplay,
      nextFollowUpIso: nextFollowUpIso,
      nextAction: nextActionFor(l),
      slaStatus,
      priority,
      leadAge: formatLeadAge(l.createdAt),
      leadAgeMinutes: Math.round(leadAgeMinutes(l.createdAt)),
      attemptCount: l.attemptCount ?? 0,
      assignedCallerName: l.assignedCallerId ? userMap.get(l.assignedCallerId) || "" : "",
      assignedSmName: l.assignedSmId ? userMap.get(l.assignedSmId) || "" : "",
      assignedSmId: l.assignedSmId,
      assignedAt: l.assignedAt,
      hasOverdueFollowUp,
    };
  });

  const priorityRankMap: Record<PriorityLevel, number> = {
    p1_new: 1,
    p2_approaching_sla: 2,
    p3_overdue_call: 3,
    p4_callback: 4,
    p5_ready_to_assign: 5,
    p6_follow_up: 6,
    p7_no_response: 7,
    p8_idle: 8,
  };
  enriched.sort((a, b) => priorityRankMap[a.priority] - priorityRankMap[b.priority] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ leads: enriched });
}