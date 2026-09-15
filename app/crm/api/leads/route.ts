import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";

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

  const db = getDb();
  let rows = db
    .select()
    .from(schema.leads)
    .orderBy(desc(schema.leads.createdAt))
    .all();

  // Role-based filtering
  if (user.role === "caller") {
    rows = rows.filter((l) => l.assignedCallerId === user.id);
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

  const result = rows.map((l) => ({
    ...l,
    assignedCallerName: l.assignedCallerId ? userMap.get(l.assignedCallerId) || "" : "",
    assignedSmName: l.assignedSmId ? userMap.get(l.assignedSmId) || "" : "",
  }));

  return NextResponse.json({ leads: result });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const now = new Date().toISOString();

    const callerId = user.role === "caller" ? user.id : body.assignedCallerId || user.id;

    const db = getDb();
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
        status: body.status || "new",
        assignedCallerId: callerId,
        assignedSmId: body.assignedSmId || null,
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