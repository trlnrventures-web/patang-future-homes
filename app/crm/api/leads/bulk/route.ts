import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, inArray } from "drizzle-orm";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { resolveDefaultSmId } from "@/lib/crm/leads";

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const now = new Date().toISOString();

  let body: { ids?: number[]; action?: string; [k: string]: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((i) => Number.isFinite(Number(i))).map((i) => Number(i)))]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No leads selected" }, { status: 400 });
  }

  const leadIds = ids;
  const targetLeads = db
    .select()
    .from(schema.leads)
    .where(inArray(schema.leads.id, leadIds))
    .all()
    .filter((l) => !l.deletedAt);

  const role = body.action as string;

  // Callers/SMs may not assign or delete; restrict selection to their scope.
  if (user.role === "caller") {
    const allowed = new Set(
      db
        .select()
        .from(schema.leads)
        .where(inArray(schema.leads.id, leadIds))
        .all()
        .filter((l) => !l.deletedAt && l.assignedCallerId === user.id)
        .map((l) => l.id)
    );
    const scoped = targetLeads.filter((l) => allowed.has(l.id));
    if (scoped.length === 0) {
      return NextResponse.json({ error: "No leads in your scope" }, { status: 403 });
    }
    targetLeads.splice(0, targetLeads.length, ...scoped);
  } else if (user.role === "sales_manager") {
    const scoped = targetLeads.filter((l) => l.assignedSmId === user.id);
    if (scoped.length === 0) {
      return NextResponse.json({ error: "No leads assigned to you" }, { status: 403 });
    }
    targetLeads.splice(0, targetLeads.length, ...scoped);
  }

  switch (role) {
    case "status": {
      const status = String(body.status || "") as (typeof schema.leads.$inferInsert)["status"];
      if (!status) return NextResponse.json({ error: "Status required" }, { status: 400 });
      const changed = targetLeads.filter((l) => l.status !== status);
      const changeNote = "Bulk status update";
      for (const l of changed) {
        db.update(schema.leads).set({ status, updatedAt: now }).where(eq(schema.leads.id, l.id)).run();
        db.insert(schema.activities).values({
          leadId: l.id,
          userId: user.id,
          type: "status_change",
          notes: `${l.status} → ${status}: ${changeNote}`,
          createdAt: now,
        }).run();
      }
      return NextResponse.json({ ok: true, updated: changed.length });
    }

    case "assign_sm": {
      if (!isAdmin(user)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const smId = body.smId ? Number(body.smId) : null;
      const sm = smId
        ? db.select().from(schema.users).where(eq(schema.users.id, smId)).get()
        : null;
      if (smId != null && (!sm || sm.role !== "sales_manager")) {
        return NextResponse.json({ error: "Invalid sales manager" }, { status: 400 });
      }
      const resolvedSm = smId != null ? smId : resolveDefaultSmId(db);
      if (resolvedSm == null) {
        return NextResponse.json({ error: "No sales manager available" }, { status: 400 });
      }
      const names = new Map(db.select().from(schema.users).all().map((u) => [u.id, u.name]));
      for (const l of targetLeads) {
        if (l.assignedSmId === resolvedSm) continue;
        db.update(schema.leads)
          .set({ assignedSmId: resolvedSm, assignedAt: now, assignedBy: user.id, status: "assigned", nextAction: "sm_follow_up", updatedAt: now })
          .where(eq(schema.leads.id, l.id))
          .run();
        db.insert(schema.activities).values({
          leadId: l.id,
          userId: user.id,
          type: "assignment",
          notes: `Assigned: SM → ${names.get(resolvedSm) || ""}`,
          createdAt: now,
        }).run();
      }
      return NextResponse.json({ ok: true, updated: targetLeads.length });
    }

    case "delete": {
      if (!isAdmin(user)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      for (const l of targetLeads) {
        db.update(schema.leads)
          .set({ status: "invalid", deletedAt: now, updatedAt: now })
          .where(eq(schema.leads.id, l.id))
          .run();
      }
      return NextResponse.json({ ok: true, updated: targetLeads.length });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids") || "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  const db = getDb();
  const leads = db
    .select()
    .from(schema.leads)
    .where(inArray(schema.leads.id, ids))
    .all()
    .filter((l) => !l.deletedAt);

  if (user.role === "caller") {
    const scoped = leads.filter((l) => l.assignedCallerId === user.id || !l.assignedSmId);
    leads.splice(0, leads.length, ...scoped);
  } else if (user.role === "sales_manager") {
    const scoped = leads.filter((l) => l.assignedSmId === user.id);
    leads.splice(0, leads.length, ...scoped);
  }

  const users = db.select().from(schema.users).all();
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const rows = leads.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    whatsappNumber: l.whatsappNumber || "",
    email: l.email || "",
    source: l.source,
    status: l.status,
    location: l.location || "",
    sublocation: l.sublocation || "",
    budget: l.budget || "",
    bhk: l.bhk || "",
    originalProject: l.originalProject || "",
    preferredProject: l.preferredProject || "",
    assignedCaller: l.assignedCallerId ? nameOf.get(l.assignedCallerId) || "" : "",
    assignedSm: l.assignedSmId ? nameOf.get(l.assignedSmId) || "" : "",
    createdAt: l.createdAt,
    lastAttemptAt: l.lastAttemptAt || "",
  }));

  return NextResponse.json({ leads: rows });
}