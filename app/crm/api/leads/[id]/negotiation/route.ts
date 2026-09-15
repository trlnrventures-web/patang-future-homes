import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import {
  canAccessSales,
  FINAL_STAGES,
  NEGOTIATION_STATUSES,
  NEGOTIATION_STATUS_LABELS,
  NEGOTIATION_LOST_REASONS,
} from "@/lib/crm/sales";
import { getProject } from "@/lib/projects";

const STATUS_VALUES = new Set<string>(NEGOTIATION_STATUSES.map((s) => s.value));
const LOST_REASONS = new Set<string>(NEGOTIATION_LOST_REASONS.map((r) => r.value));

function positiveInt(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${field} must be a non-negative whole number`);
  }
  return n;
}

function loadAuthLead(id: string) {
  const db = getDb();
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, Number(id))).get();
  return { db, lead };
}

function getOpenNegotiation(
  db: ReturnType<typeof getDb>,
  leadId: number
) {
  const rows = db
    .select()
    .from(schema.negotiations)
    .where(eq(schema.negotiations.leadId, leadId))
    .orderBy(desc(schema.negotiations.createdAt))
    .all();
  return rows.find((n) => !FINAL_STAGES.includes(n.status as never));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { db, lead } = loadAuthLead(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (!canAccessSales(user, lead)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const negotiation = getOpenNegotiation(db, lead.id);

  return NextResponse.json({
    lead: {
      ...lead,
      assignedCallerName: lead.assignedCallerId
        ? db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, lead.assignedCallerId)).get()?.name || ""
        : "",
      assignedSmName: lead.assignedSmId
        ? db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, lead.assignedSmId)).get()?.name || ""
        : "",
    },
    negotiation,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { db, lead } = loadAuthLead(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (!canAccessSales(user, lead)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body
  }

  const now = new Date().toISOString();
  const action = body.action || "start";

  // ---- action: start (move to negotiation) ----
  if (action === "start") {
    let negotiation = getOpenNegotiation(db, lead.id);
    let created = false;

    if (!negotiation) {
      const smId =
        user.role === "sales_manager" ? user.id : lead.assignedSmId || user.id;
      const inserted = db
        .insert(schema.negotiations)
        .values({
          leadId: lead.id,
          projectId: (body.projectId as string) || lead.preferredProject || undefined,
          unit: (body.unit as string) || undefined,
          bhk: (body.bhk as string) || lead.bhk || undefined,
          assignedSmId: smId,
          status: "negotiation_started",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      negotiation = inserted;
      created = true;

      db.insert(schema.activities)
        .values({
          leadId: lead.id,
          userId: user.id,
          type: "negotiation_started",
          notes: body.notes ? String(body.notes) : "Moved to negotiation",
          createdAt: now,
        })
        .run();
    }

    const leadUpdate: Record<string, unknown> = {
      status: "negotiation",
      nextAction: negotiation.nextAction || "Call customer",
      updatedAt: now,
    };
    if (negotiation.nextActionAt) leadUpdate.nextFollowUp = negotiation.nextActionAt;
    db.update(schema.leads).set(leadUpdate).where(eq(schema.leads.id, lead.id)).run();

    return NextResponse.json({ negotiation, created });
  }

  // ---- action: objection / competing / lost / alternative ----
  const negotiation = getOpenNegotiation(db, lead.id);
  if (!negotiation) {
    return NextResponse.json({ error: "Negotiation not started" }, { status: 400 });
  }

  if (action === "objection") {
    const value = String(body.value || "").trim();
    if (!value) {
      return NextResponse.json({ error: "Objection required" }, { status: 400 });
    }
    const current = negotiation.objections || [];
    const next = current.includes(value) ? current : [...current, value];
    db.update(schema.negotiations)
      .set({ objections: next, updatedAt: now })
      .where(eq(schema.negotiations.id, negotiation.id))
      .run();
    if (!current.includes(value)) {
      db.insert(schema.activities)
        .values({
          leadId: lead.id,
          userId: user.id,
          type: "objection_added",
          notes: `Objection recorded: ${value}`,
          createdAt: now,
        })
        .run();
    }
    return NextResponse.json({ objections: next });
  }

  if (action === "competing") {
    const value = String(body.value || "").trim();
    if (!value || !getProject(value)) {
      return NextResponse.json({ error: "Valid project required" }, { status: 400 });
    }
    const current = negotiation.competingProjects || [];
    const next = current.includes(value) ? current : [...current, value];
    db.update(schema.negotiations)
      .set({ competingProjects: next, updatedAt: now })
      .where(eq(schema.negotiations.id, negotiation.id))
      .run();
    if (!current.includes(value)) {
      db.insert(schema.activities)
        .values({
          leadId: lead.id,
          userId: user.id,
          type: "competing_project",
          notes: `Customer comparing: ${getProject(value)?.title}`,
          createdAt: now,
        })
        .run();
    }
    return NextResponse.json({ competingProjects: next });
  }

  if (action === "alternative") {
    const value = String(body.value || "").trim();
    if (!value || !getProject(value)) {
      return NextResponse.json({ error: "Valid project required" }, { status: 400 });
    }
    db.update(schema.negotiations)
      .set({ projectId: value, updatedAt: now })
      .where(eq(schema.negotiations.id, negotiation.id))
      .run();
    db.insert(schema.activities)
      .values({
        leadId: lead.id,
        userId: user.id,
        type: "alternative_selected",
        notes: `Alternative property selected: ${getProject(value)?.title}`,
        createdAt: now,
      })
      .run();
    return NextResponse.json({ ok: true });
  }

  if (action === "lost") {
    const reason = String(body.reason || "").trim();
    if (!reason || !LOST_REASONS.has(reason)) {
      return NextResponse.json({ error: "Lost reason required" }, { status: 400 });
    }
    const nextAction = body.nextAction ? String(body.nextAction) : "Follow up";
    const nextActionAt = body.nextActionAt ? String(body.nextActionAt) : null;

    db.update(schema.negotiations)
      .set({
        status: "negotiation_lost",
        lostReason: reason,
        nextAction,
        nextActionAt: nextActionAt || undefined,
        updatedAt: now,
      })
      .where(eq(schema.negotiations.id, negotiation.id))
      .run();

    const leadUpdate: Record<string, unknown> = {
      status: "follow_up",
      nextAction,
      updatedAt: now,
    };
    if (nextActionAt) leadUpdate.nextFollowUp = nextActionAt;
    db.update(schema.leads).set(leadUpdate).where(eq(schema.leads.id, lead.id)).run();

    db.insert(schema.activities)
      .values({
        leadId: lead.id,
        userId: user.id,
        type: "negotiation_lost",
        notes: `Negotiation lost — ${NEGOTIATION_LOST_REASONS.find((r) => r.value === reason)?.label || reason}`,
        createdAt: now,
      })
      .run();

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
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
  const { db, lead } = loadAuthLead(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (!canAccessSales(user, lead)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const negotiation = getOpenNegotiation(db, lead.id);
  if (!negotiation) {
    return NextResponse.json({ error: "Negotiation not started" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updatedAt: now };

  if (body.status !== undefined) {
    if (!STATUS_VALUES.has(String(body.status))) {
      return NextResponse.json({ error: "Invalid negotiation status" }, { status: 400 });
    }
    update.status = String(body.status);
  }

  const statusValue = String(update.status || negotiation.status);
  const isFinal = FINAL_STAGES.includes(statusValue as never);

  if (body.lostReason !== undefined) {
    update.lostReason = body.lostReason ? String(body.lostReason) : null;
  }
  if (body.notes !== undefined) update.notes = String(body.notes || "");
  if (body.unit !== undefined) update.unit = String(body.unit || "");
  if (body.bhk !== undefined) update.bhk = String(body.bhk || "");
  if (body.unitPreference !== undefined) update.unitPreference = String(body.unitPreference || "");
  if (body.floorPreference !== undefined) update.floorPreference = String(body.floorPreference || "");
  if (body.facingPreference !== undefined) update.facingPreference = String(body.facingPreference || "");
  if (body.paymentPreference !== undefined) update.paymentPreference = String(body.paymentPreference || "");
  if (body.loanRequirement !== undefined) update.loanRequirement = String(body.loanRequirement || "");
  if (body.nextAction !== undefined) update.nextAction = String(body.nextAction || "");
  if (body.nextActionAt !== undefined) update.nextActionAt = body.nextActionAt ? String(body.nextActionAt) : null;

  for (const [field, col] of [
    ["expectedPrice", "expectedPrice"],
    ["quotedPrice", "quotedPrice"],
    ["finalDiscussedPrice", "finalDiscussedPrice"],
    ["bookingAmountDiscussed", "bookingAmountDiscussed"],
  ] as const) {
    if (body[field] !== undefined) {
      try {
        const n = positiveInt(body[field], field);
        update[col] = n;
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
      }
    }
  }

  // Next action is mandatory for active negotiations
  if (!isFinal) {
    const nextAction = String(update.nextAction !== undefined ? update.nextAction : negotiation.nextAction || "");
    const nextActionAt = String(update.nextActionAt !== undefined ? update.nextActionAt : (negotiation.nextActionAt || ""));
    if (!nextAction.trim() || !nextActionAt.trim()) {
      return NextResponse.json(
        { error: "Next action and date are required for active negotiation" },
        { status: 400 }
      );
    }
  }

  if (statusValue === "negotiation_lost" && body.lostReason === undefined && !negotiation.lostReason) {
    return NextResponse.json({ error: "Lost reason required" }, { status: 400 });
  }

  db.update(schema.negotiations).set(update).where(eq(schema.negotiations.id, negotiation.id)).run();

  if (lead.status !== "negotiation" && statusValue !== "negotiation_lost") {
    const nextFollowUpTarget =
      update.nextActionAt !== undefined
        ? ((update.nextActionAt || null) as string | null)
        : negotiation.nextActionAt;
    db.update(schema.leads)
      .set({
        status: "negotiation",
        nextAction: String(update.nextAction !== undefined ? update.nextAction : negotiation.nextAction || ""),
        nextFollowUp: nextFollowUpTarget,
        updatedAt: now,
      })
      .where(eq(schema.leads.id, lead.id))
      .run();
  }

  const changed: string[] = [];
  if (update.status && update.status !== negotiation.status) {
    changed.push(`Status → ${NEGOTIATION_STATUS_LABELS[String(update.status)]}`);
  }
  if (update.nextAction && update.nextAction !== negotiation.nextAction) changed.push("Next action updated");
  if (Object.keys(update).filter((k) => k !== "updatedAt" && !changed.some((c) => c.includes(k))).length > 0) {
    changed.push("Negotiation details updated");
  }
  db.insert(schema.activities)
    .values({
      leadId: lead.id,
      userId: user.id,
      type: "negotiation_updated",
      notes: changed.length ? changed.join(" · ") : "Negotiation updated",
      createdAt: now,
    })
    .run();

  const updated = db
    .select()
    .from(schema.negotiations)
    .where(eq(schema.negotiations.id, negotiation.id))
    .get();

  return NextResponse.json({ negotiation: updated });
}