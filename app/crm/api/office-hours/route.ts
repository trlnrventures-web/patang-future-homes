import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { writeAuditLog } from "@/lib/crm/audit";
import {
  DEFAULT_OFFICE_HOURS,
  contactMaskFor,
  describeMasking,
  getOfficeHours,
  serializeOfficeHours,
  type OfficeHours,
} from "@/lib/crm/office-hours";

export const dynamic = "force-dynamic";

/** Read for anyone signed in: the UI needs to know if masking is active. */
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const decision = contactMaskFor(user.role);
  const hours = getOfficeHours();
  return NextResponse.json({
    withinOfficeHours: decision.withinHours,
    maskActive: decision.mask,
    banner: describeMasking(decision),
    canSeeFullNumbers: !decision.mask,
    defaults: DEFAULT_OFFICE_HOURS,
    // The full window is staff-visible so the banner can explain itself, but
    // only admin/owner can change it.
    hours: isAdmin(user) ? hours : { enabled: hours.enabled },
  });
}

/** Admin/owner only: edits the working window. */
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const current = getOfficeHours();

    const next: OfficeHours = {
      days:
        Array.isArray(body.days) && body.days.length
          ? body.days
              .map((d: unknown) => Number(d))
              .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
          : current.days,
      startMin: body.startMin != null ? Number(body.startMin) : current.startMin,
      endMin: body.endMin != null ? Number(body.endMin) : current.endMin,
      enabled: body.enabled != null ? Boolean(body.enabled) : current.enabled,
      timezone: DEFAULT_OFFICE_HOURS.timezone,
    };

    if (!Number.isInteger(next.startMin) || !Number.isInteger(next.endMin)) {
      return NextResponse.json({ error: "Invalid times" }, { status: 400 });
    }
    if (next.startMin < 0 || next.startMin > 24 * 60 || next.endMin < 0 || next.endMin > 24 * 60) {
      return NextResponse.json({ error: "Times must be within a day" }, { status: 400 });
    }
    if (next.startMin === next.endMin) {
      return NextResponse.json(
        { error: "Start and end time cannot be identical" },
        { status: 400 }
      );
    }

    const { updateSetting } = await import("@/lib/crm/settings");
    updateSetting("office_hours", serializeOfficeHours(next));

    writeAuditLog({
      category: "settings",
      action: "office_hours_updated",
      actorUserId: user.id,
      entityType: "settings",
      entityId: "office_hours",
      summary: `Office hours set to ${JSON.stringify(next)}.`,
      details: next as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ ok: true, hours: next });
  } catch (error) {
    console.error("Office hours PATCH error:", error);
    return NextResponse.json({ error: "Failed to update office hours" }, { status: 500 });
  }
}

/**
 * Reveal of a full contact number. Admin/owner only, and always written to the
 * audit log with who asked and when, so after-hours access is traceable to a
 * person. This is what the "unmask" affordance on a masked lead calls.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const leadId = Number(body?.leadId);
    if (!leadId) {
      return NextResponse.json({ error: "leadId required" }, { status: 400 });
    }

    const db = getDb();
    const lead = db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.id, leadId), isNull(schema.leads.deletedAt)))
      .get();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const phone = lead.whatsappNumber || lead.phone || "";

    // Two logs on purpose: the audit trail for the admin, and the lead's own
    // activity feed so the sales team can see a number was pulled after hours.
    writeAuditLog({
      category: "contact_access",
      action: "full_number_revealed",
      actorUserId: user.id,
      targetUserId: lead.assignedCallerId ?? undefined,
      entityType: "lead",
      entityId: String(lead.id),
      summary: `${user.name} revealed the full number for ${lead.name}.`,
      details: { leadId: lead.id, leadName: lead.name, phone, reason: body?.reason || "" },
    });

    db.insert(schema.activities)
      .values({
        leadId: lead.id,
        userId: user.id,
        type: "contact_reveal",
        notes: `Full contact number viewed by ${user.name}${body?.reason ? ` - ${body.reason}` : ""}.`,
        createdAt: new Date().toISOString(),
      })
      .run();

    return NextResponse.json({ ok: true, phone, email: lead.email || "" });
  } catch (error) {
    console.error("Reveal error:", error);
    return NextResponse.json({ error: "Failed to record reveal" }, { status: 500 });
  }
}
