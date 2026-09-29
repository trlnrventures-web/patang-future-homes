import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { resolveDefaultCallerId } from "@/lib/crm/leads";
import { queryLeadList } from "@/lib/crm/lead-query";
import { handleReInquiry } from "@/lib/crm/reinquiry";
import { contactMaskFor, describeMasking, maskLeadList } from "@/lib/crm/office-hours";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "list";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") || "20", 10) || 20));

  const db = getDb();
  const all = queryLeadList(db, user, {
    status: searchParams.get("status") || undefined,
    quick: searchParams.get("quick") || undefined,
    q: searchParams.get("q") || undefined,
    sort: searchParams.get("sort") || undefined,
  });

  // Masking happens here, on the way out, so the real number is never sent to a
  // staff browser at all - not hidden by CSS, and not recoverable from the
  // network tab or the page source.
  const decision = contactMaskFor(user.role);
  const total = all.length;

  // The board renders every lead of the current filter in one pass so a card can
  // be dragged between columns; the list view stays paginated.
  if (view === "board") {
    return NextResponse.json({
      leads: maskLeadList(all, decision),
      total,
      view: "board",
      contactMasking: maskPayload(decision),
    });
  }

  const leads = all.slice((page - 1) * pageSize, page * pageSize);
  return NextResponse.json({
    leads: maskLeadList(leads, decision),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    contactMasking: maskPayload(decision),
  });
}

/** The banner state, so the UI never has to guess why a number looks odd. */
function maskPayload(decision: ReturnType<typeof contactMaskFor>) {
  return {
    active: decision.mask,
    withinOfficeHours: decision.withinHours,
    banner: describeMasking(decision),
  };
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
    // Exception: when a Sales Manager creates the lead themselves they take
    // ownership of it (so the detail page access check passes for them and the
    // lead is not chaseable by a caller), bypassing caller routing.
    const isSmCreator = user.role === "sales_manager";
    const preferredCallerId =
      user.role === "caller" ? user.id : Number(body.assignedCallerId) || null;
    const callerId = isSmCreator
      ? null
      : resolveDefaultCallerId(db, { preferredId: preferredCallerId });

    const phoneForMatch = String(body.phone || "").trim();

    const result = handleReInquiry({
      db,
      phone: phoneForMatch,
      project: body.originalProject || null,
      message: body.originalMessage || null,
      source: String(body.source || "other"),
      userId: user.id,
      insertLead: () =>
        db
          .insert(schema.leads)
          .values({
            name: (body.name || "").trim(),
            phone: phoneForMatch,
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
            stageChangedAt: now,
            assignedCallerId: callerId,
            assignedSmId: isSmCreator ? user.id : null,
            assignedAt: isSmCreator ? now : null,
            assignedBy: isSmCreator ? user.id : null,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get(),
    });

    const lead = result.lead;

    if (result.kind === "new") {
      db.insert(schema.activities).values({
        leadId: lead.id,
        userId: user.id,
        type: "note",
        notes: "Lead created",
        createdAt: now,
      }).run();

      if (isSmCreator) {
        const sm = db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, user.id))
          .get();
        db.insert(schema.activities).values({
          leadId: lead.id,
          userId: user.id,
          type: "assignment",
          notes: `Assigned: SM → ${sm?.name || "Self"} (lead created by SM)`,
          createdAt: now,
        }).run();
      }

      return NextResponse.json({ lead, duplicate: false, reactivated: false }, { status: 201 });
    }

    return NextResponse.json({
      lead,
      duplicate: result.kind === "duplicate",
      reactivated: result.kind === "reactivated",
    });
  } catch (error) {
    console.error("Create lead error:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}
