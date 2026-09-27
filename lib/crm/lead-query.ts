import { and, desc, eq, isNull, ne } from "drizzle-orm";
import * as schema from "./schema";
import { FINAL_STAGES } from "./sales";
import {
  buildEarliestFollowUpMap,
  isInCallerScope,
  nextActionLabel,
  type CrmDb,
} from "./leads";
import { computeSlaStatus, isLeadActionOverdue } from "./sla-compute";
import type { AuthUser } from "./auth";

export const QUICK_FILTERS = ["overdue", "hot", "unassigned", "visit_today"] as const;

export type LeadListQuery = {
  status?: string | undefined;
  quick?: string | undefined;
  q?: string | undefined;
  sort?: string | undefined;
};

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** Whole days since `iso`, floored at 0. */
function daysSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * The single source of truth for "which leads are in the list, in what order".
 *
 * Both the Leads list/board API and the lead-detail page run this so that
 * Previous/Next Lead navigation walks exactly the same sequence the user was
 * looking at, filters and sort included.
 */
export function queryLeadList(db: CrmDb, user: AuthUser, query: LeadListQuery) {
  const status = query.status || undefined;
  const quick = query.quick || undefined;
  const q = (query.q || "").toLowerCase();
  const sort = query.sort || "newest";

  let rows = db
    .select()
    .from(schema.leads)
    .where(isNull(schema.leads.deletedAt))
    .orderBy(desc(schema.leads.createdAt))
    .all();

  // Role-based filtering
  // Caller: primary focus is every unassigned/qualification-stage lead. A search
  // query or an explicit status filter bypasses the scope so they can still find
  // handed-off leads (including lost ones).
  if (user.role === "caller") {
    rows = q || status ? rows : rows.filter(isInCallerScope);
  } else if (user.role === "sales_manager") {
    rows = rows.filter((l) => l.assignedSmId === user.id);
  }

  if (QUICK_FILTERS.includes(quick as (typeof QUICK_FILTERS)[number]) && quick) {
    let visitTodayIds: Set<number> | null = null;
    if (quick === "visit_today") {
      const today = istToday();
      visitTodayIds = new Set(
        db
          .select()
          .from(schema.siteVisits)
          .where(and(eq(schema.siteVisits.date, today), ne(schema.siteVisits.status, "cancelled")))
          .all()
          .map((v) => v.leadId)
      );
    }
    rows = rows.filter((l) => {
      switch (quick) {
        case "overdue":
          return isLeadActionOverdue({
            status: l.status,
            createdAt: l.createdAt,
            firstCallAt: l.firstCallAt,
            nextActionAt: l.nextFollowUp || l.nextAttemptAt,
          });
        case "hot":
          return l.leadScore != null && l.leadScore >= 75 && l.status !== "lost";
        case "unassigned":
          return !l.assignedSmId && l.status !== "lost";
        case "visit_today":
          return visitTodayIds?.has(l.id) ?? false;
        default:
          return true;
      }
    });
  }

  if (status) {
    rows = rows.filter((l) => l.status === status);
  }

  if (q) {
    rows = rows.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.phone || "").includes(q) ||
        (l.originalProject || "").toLowerCase().includes(q)
    );
  }

  const actionAtMs = (l: (typeof rows)[number]) => {
    const t = l.nextFollowUp || l.nextAttemptAt;
    return t ? new Date(t).getTime() : Infinity;
  };
  if (sort === "oldest") {
    rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } else if (sort === "overdue") {
    rows.sort((a, b) => {
      const ao = isLeadActionOverdue({
        status: a.status,
        createdAt: a.createdAt,
        firstCallAt: a.firstCallAt,
        nextActionAt: a.nextFollowUp || a.nextAttemptAt,
      });
      const bo = isLeadActionOverdue({
        status: b.status,
        createdAt: b.createdAt,
        firstCallAt: b.firstCallAt,
        nextActionAt: b.nextFollowUp || b.nextAttemptAt,
      });
      if (ao !== bo) return ao ? -1 : 1;
      return actionAtMs(a) - actionAtMs(b);
    });
  } else if (sort === "longest_in_stage") {
    // Oldest stage entry first. The board draws a column in exactly this order,
    // so the leads most stuck in their column surface at the top, and Previous /
    // Next Lead on the detail page walks the same sequence.
    const stageMs = (l: (typeof rows)[number]) =>
      new Date(l.stageChangedAt || l.createdAt).getTime();
    rows.sort((a, b) => stageMs(a) - stageMs(b));
  }

  const users = db.select().from(schema.users).all();
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const earliestFollowUp = buildEarliestFollowUpMap(db);

  const negotiationDaysMap = new Map<number, string | null>();
  const negotiationLeads = rows.filter((l) => l.status === "negotiation");
  if (negotiationLeads.length > 0) {
    const allNegotiations = db.select().from(schema.negotiations).all();
    for (const l of negotiationLeads) {
      const active = allNegotiations.filter(
        (n) => n.leadId === l.id && !FINAL_STAGES.includes(n.status as (typeof FINAL_STAGES)[number])
      );
      const lastMs = active.length
        ? Math.max(...active.map((n) => new Date(n.updatedAt).getTime()))
        : 0;
      negotiationDaysMap.set(l.id, lastMs > 0 ? new Date(lastMs).toISOString() : null);
    }
  }

  const now = Date.now();
  const leads = rows.map((l) => {
    const nextFollowUpIso = l.nextFollowUp || l.nextAttemptAt || earliestFollowUp.get(l.id) || null;
    const hasOverdueFollowUp = isLeadActionOverdue({
      status: l.status,
      createdAt: l.createdAt,
      firstCallAt: l.firstCallAt,
      nextActionAt: nextFollowUpIso,
    });
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
    // A lead that has never changed status has been in its stage since creation.
    const stageEnteredAt = l.stageChangedAt || l.createdAt || null;
    return {
      ...l,
      nextAction: nextActionLabel(l.nextAction),
      assignedCallerName: l.assignedCallerId ? userMap.get(l.assignedCallerId) || "" : "",
      assignedSmName: l.assignedSmId ? userMap.get(l.assignedSmId) || "" : "",
      negotiationLastActive: l.status === "negotiation" ? (negotiationDaysMap.get(l.id) ?? null) : null,
      slaStatus: computeSlaStatus(l.createdAt, l.firstCallAt),
      nextFollowUpIso,
      nextFollowUpDisplay,
      hasOverdueFollowUp,
      stageEnteredAt,
      daysInStage: daysSince(stageEnteredAt, now),
    };
  });

  return leads;
}
