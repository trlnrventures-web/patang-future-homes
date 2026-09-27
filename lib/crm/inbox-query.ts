import { desc, isNull } from "drizzle-orm";
import * as schema from "./schema";
import { getPriority, isLeadActionOverdue, computeSlaStatus } from "./sla-compute";
import { formatLeadAge, leadAgeMinutes, type PriorityLevel } from "./sla";
import { buildEarliestFollowUpMap, isInCallerScope, type CrmDb } from "./leads";
import type { AuthUser } from "./auth";
import {
  isInboxSort,
  isInboxTab,
  type InboxLead,
} from "./inbox-shared";

export type { InboxLead, InboxSort, InboxTab } from "./inbox-shared";

export type InboxQuery = {
  tab?: string | undefined;
  q?: string | undefined;
  sort?: string | undefined;
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

/**
 * The client-side sort the Caller Inbox applies on top of the server's priority
 * order. Shared so the lead-detail page can walk the same sequence.
 */
export function sortInboxLeads<T extends InboxLead>(list: T[], sort: string): T[] {
  const arr = [...list];
  const actionMs = (x: T) => (x.nextFollowUpIso ? new Date(x.nextFollowUpIso).getTime() : Infinity);
  if (sort === "oldest") {
    return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  if (sort === "overdue") {
    return arr.sort((a, b) => {
      if (!!a.hasOverdueFollowUp !== !!b.hasOverdueFollowUp) {
        return a.hasOverdueFollowUp ? -1 : 1;
      }
      return actionMs(a) - actionMs(b);
    });
  }
  return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The single source of truth for "which leads are in the caller inbox, in what
 * order". Both the inbox API and the lead-detail page run this so that
 * Previous/Next Lead walks exactly the queue the user was looking at.
 */
export function queryInboxLeads(db: CrmDb, user: AuthUser, query: InboxQuery): InboxLead[] {
  const tab = isInboxTab(query.tab) ? query.tab : "new";
  const sort = isInboxSort(query.sort) ? query.sort : "newest";
  const q = (query.q || "").toLowerCase();

  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

  let rows = db
    .select()
    .from(schema.leads)
    .where(isNull(schema.leads.deletedAt))
    .orderBy(desc(schema.leads.createdAt))
    .all();

  if (user.role === "caller") {
    // Callers keep visibility of leads they handled even after they are handed
    // off to a sales manager (read-only), alongside their active qualification
    // pipeline.
    rows =
      q || tab === "lost"
        ? rows
        : rows.filter((l) => isInCallerScope(l) || l.assignedCallerId === user.id);
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
      filtered = rows.filter((l) => l.assignedSmId != null && l.status !== "lost");
      break;
    case "follow_up":
      filtered = rows.filter((l) =>
        ["follow_up", "visit_proposed", "visit_booked", "visit_confirmed", "negotiation", "assigned"].includes(
          l.status
        )
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

  const enriched: InboxLead[] = filtered.map((l) => {
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
      nextFollowUpIso,
      nextAction: nextActionFor(l),
      slaStatus: computeSlaStatus(l.createdAt, l.firstCallAt),
      priority: getPriority(l),
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

  enriched.sort(
    (a, b) =>
      PRIORITY_RANK[a.priority as PriorityLevel] - PRIORITY_RANK[b.priority as PriorityLevel] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return sortInboxLeads(enriched, sort);
}
