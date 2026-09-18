import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, isNull } from "drizzle-orm";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import {
  isInCallerScope,
  resolveDefaultCallerId,
  resolveDefaultSmId,
} from "@/lib/crm/leads";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, Number(id))).get();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (lead.deletedAt) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Role access check: callers may open any lead (they can search handed-off
  // leads too). Sales managers see only leads assigned to them.
  if (user.role === "sales_manager" && lead.assignedSmId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activities = db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.leadId, lead.id))
    .orderBy(schema.activities.createdAt)
    .all()
    .reverse();

  const followUps = db
    .select()
    .from(schema.followUps)
    .where(eq(schema.followUps.leadId, lead.id))
    .orderBy(schema.followUps.scheduledFor)
    .all();

  const visits = db
    .select()
    .from(schema.siteVisits)
    .where(eq(schema.siteVisits.leadId, lead.id))
    .orderBy(schema.siteVisits.date)
    .all();

  const latestFeedback = db
    .select()
    .from(schema.postVisitFeedback)
    .where(eq(schema.postVisitFeedback.leadId, lead.id))
    .orderBy(schema.postVisitFeedback.createdAt)
    .all()
    .pop() ?? null;

  const users = db.select().from(schema.users).all();
  const userMap = new Map(users.map((u) => [u.id, u]));

  const enrichActivities = activities.map((a) => ({
    ...a,
    userName: userMap.get(a.userId)?.name || "",
  }));

  const enrichVisits = visits.map((v) => ({
    ...v,
    smName: userMap.get(v.smId)?.name || "",
  }));

  return NextResponse.json({
    lead: {
      ...lead,
      assignedCallerName: lead.assignedCallerId
        ? userMap.get(lead.assignedCallerId)?.name || ""
        : "",
      assignedSmName: lead.assignedSmId
        ? userMap.get(lead.assignedSmId)?.name || ""
        : "",
    },
    activities: enrichActivities,
    followUps,
    visits: enrichVisits,
    users: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    latestFeedback,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const existing = db.select().from(schema.leads).where(eq(schema.leads.id, Number(id))).get();
  if (!existing) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (existing.deletedAt) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (user.role === "caller" && !isInCallerScope(existing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const now = new Date().toISOString();

    const statusChange =
      body.status && body.status !== existing.status;
    const statusActivity =
      body.statusChangeNote || body.notes || "Status updated";

    const allowedFields: (keyof typeof schema.leads.$inferInsert)[] = [
      "name", "phone", "whatsappNumber", "email", "source", "campaignName",
      "adSetName", "adName", "formName", "utmSource", "utmMedium", "utmCampaign",
      "originalMessage", "location", "sublocation", "budget", "budgetMin",
      "budgetMax", "bhk", "purpose", "timeline", "preferredProject",
      "familyRequirements", "loanRequired", "otherPreferences", "notes",
      "status", "leadScore", "nextFollowUp", "assignedCallerId", "assignedSmId",
    ];

    const update: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        update[key] = body[key];
      }
    }

    // ---- Assignment: caller / SM / auto-rebalance ----
    let newCaller = existing.assignedCallerId;
    let newSm = existing.assignedSmId;
    let assignmentNote = "";

    if (
      "assignedCallerId" in body ||
      "assignedSmId" in body ||
      body.assignCaller === "auto" ||
      body.assignSm === "auto"
    ) {
      if (body.assignCaller === "auto") {
        newCaller = resolveDefaultCallerId(db);
      } else if ("assignedCallerId" in body) {
        newCaller = body.assignedCallerId ? Number(body.assignedCallerId) : null;
      }
      if (body.assignSm === "auto") {
        newSm = resolveDefaultSmId(db);
      } else if ("assignedSmId" in body) {
        newSm = body.assignedSmId ? Number(body.assignedSmId) : null;
      }

      if (
        newCaller !== existing.assignedCallerId ||
        newSm !== existing.assignedSmId
      ) {
        if (newCaller != null) {
          const caller = db
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, newCaller))
            .get();
          if (!caller || caller.role !== "caller") {
            return NextResponse.json({ error: "Invalid caller" }, { status: 400 });
          }
        }
        if (newSm != null) {
          const sm = db
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, newSm))
            .get();
          if (!sm || sm.role !== "sales_manager") {
            return NextResponse.json({ error: "Invalid sales manager" }, { status: 400 });
          }
        }
        update.assignedCallerId = newCaller;
        update.assignedSmId = newSm;
        update.assignedAt = now;
        update.assignedBy = user.id;
        if (newSm != null && newSm !== existing.assignedSmId) {
          update.status = "assigned";
          update.nextAction = "sm_follow_up";
        }
        const names = new Map(
          db.select().from(schema.users).all().map((u) => [u.id, u.name])
        );
        const parts: string[] = [];
        if (newCaller !== existing.assignedCallerId) {
          parts.push(
            newCaller != null ? `Caller → ${names.get(newCaller) || ""}` : "Caller cleared"
          );
        }
        if (newSm !== existing.assignedSmId) {
          parts.push(
            newSm != null ? `SM → ${names.get(newSm) || ""}` : "SM cleared"
          );
        }
        assignmentNote = `Assigned: ${parts.join(" · ")}`;
      }
    }

    update.updatedAt = now;

    db.update(schema.leads).set(update).where(eq(schema.leads.id, Number(id))).run();

    // Log significant changes
    if (statusChange) {
      db.insert(schema.activities).values({
        leadId: existing.id,
        userId: user.id,
        type: "status_change",
        notes: `${existing.status} → ${body.status}: ${statusActivity}`,
        createdAt: now,
      }).run();
    }

    // Log assignment changes
    if (assignmentNote) {
      db.insert(schema.activities).values({
        leadId: existing.id,
        userId: user.id,
        type: "assignment",
        notes: assignmentNote,
        createdAt: now,
      }).run();
    }

    if (body.activity) {
      db.insert(schema.activities).values({
        leadId: existing.id,
        userId: user.id,
        type: body.activity.type || "note",
        notes: body.activity.notes || "",
        metadata: body.activity.metadata,
        createdAt: now,
      }).run();
    }

    const updated = db.select().from(schema.leads).where(eq(schema.leads.id, Number(id))).get();
    return NextResponse.json({ lead: updated });
  } catch (error) {
    console.error("Update lead error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const db = getDb();
  const existing = db.select().from(schema.leads).where(eq(schema.leads.id, Number(id))).get();
  if (!existing) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Soft-delete: keep the row for audit trail but hide it everywhere via
  // deletedAt. Also mark as invalid so any status-based aggregations skip it.
  db.update(schema.leads)
    .set({
      status: "invalid",
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.leads.id, Number(id)))
    .run();

  return NextResponse.json({ ok: true });
}