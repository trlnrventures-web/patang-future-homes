import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { FINAL_STAGES } from "@/lib/crm/sales";
import { resolveDefaultCallerId, buildEarliestFollowUpMap, isInCallerScope } from "@/lib/crm/leads";
import { computeSlaStatus } from "@/lib/crm/sla-compute";

const QUICK_FILTERS = ["overdue", "hot", "unassigned", "visit_today"] as const;

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const quick = searchParams.get("quick") || undefined;
  const q = (searchParams.get("q") || "").toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") || "20", 10) || 20));

  const db = getDb();
  let rows = db
    .select()
    .from(schema.leads)
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
    const now = Date.now();
    let visitTodayIds: Set<number> | null = null;
    if (quick === "visit_today") {
      const today = istToday();
      visitTodayIds = new Set(
        db
          .select()
          .from(schema.siteVisits)
          .where(and(eq(schema.siteVisits.date, today), ne(schema.siteVisits.status, "cancelled")))
          .all()
          .map((v) => v.leadId),
      );
    }
    rows = rows.filter((l) => {
      switch (quick) {
        case "overdue":
          return (
            Boolean(l.nextFollowUp) &&
            new Date(l.nextFollowUp as string).getTime() < now &&
            l.status !== "booked" &&
            l.status !== "lost"
          );
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

  const result = rows.map((l) => {
    const nextFollowUpIso = l.nextFollowUp || l.nextAttemptAt || earliestFollowUp.get(l.id) || null;
    const hasOverdueFollowUp =
      nextFollowUpIso != null && !["invalid", "lost", "dnc", "booked"].includes(l.status) && new Date(nextFollowUpIso).getTime() < Date.now();
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
      ...l,
      assignedCallerName: l.assignedCallerId ? userMap.get(l.assignedCallerId) || "" : "",
      assignedSmName: l.assignedSmId ? userMap.get(l.assignedSmId) || "" : "",
      negotiationLastActive: l.status === "negotiation" ? (negotiationDaysMap.get(l.id) ?? null) : null,
      slaStatus: computeSlaStatus(l.createdAt, l.firstCallAt),
      nextFollowUpIso,
      nextFollowUpDisplay,
      hasOverdueFollowUp,
    };
  });

  const total = result.length;
  const leads = result.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({ leads, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const now = new Date().toISOString();

    const db = getDb();

    // New-lead invariants: always status "new", never pre-assigned to an SM,
    // and always routed to a real Caller role user, never the creator (Admin).
    const preferredCallerId =
      user.role === "caller" ? user.id : Number(body.assignedCallerId) || null;
    const callerId = resolveDefaultCallerId(db, { preferredId: preferredCallerId });

    const lead = db
      .insert(schema.leads)
      .values({
        name: (body.name || "").trim(),
        phone: (body.phone || "").trim(),
        whatsappNumber: (body.whatsappNumber || body.phone || "").trim(),
        email: body.email || null,
        source: body.source || "other",
        campaignName: body.campaignName || null,
        adSetName: body.adSetName || null,
        adName: body.adName || null,
        formName: body.formName || null,
        utmSource: body.utmSource || null,
        utmMedium: body.utmMedium || null,
        utmCampaign: body.utmCampaign || null,
        originalProject: body.originalProject || null,
        originalMessage: body.originalMessage || null,
        location: body.location || null,
        sublocation: body.sublocation || null,
        budget: body.budget || null,
        budgetMin: body.budgetMin || null,
        budgetMax: body.budgetMax || null,
        bhk: body.bhk || null,
        purpose: body.purpose || null,
        timeline: body.timeline || null,
        preferredProject: body.preferredProject || null,
        familyRequirements: body.familyRequirements || null,
        loanRequired: body.loanRequired === true || body.loanRequired === "true" ? true : null,
        otherPreferences: body.otherPreferences || null,
        notes: body.notes || null,
        status: "new",
        assignedCallerId: callerId,
        assignedSmId: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    db.insert(schema.activities).values({
      leadId: lead.id,
      userId: user.id,
      type: "note",
      notes: "Lead created",
      createdAt: now,
    }).run();

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error("Create lead error:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}