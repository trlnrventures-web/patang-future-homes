import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { writeAuditLog } from "@/lib/crm/audit";

/** Soft-deleted leads, newest first. Admin/sales_head only. */
export async function GET() {
  const user = await getAuthUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const leads = db
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      phone: schema.leads.phone,
      source: schema.leads.source,
      status: schema.leads.status,
      deletedAt: schema.leads.deletedAt,
    })
    .from(schema.leads)
    .where(isNotNull(schema.leads.deletedAt))
    .orderBy(desc(schema.leads.deletedAt))
    .all();

  return NextResponse.json({ leads });
}

/**
 * Restores soft-deleted leads. They return to the board as `new` - the status
 * they held before deletion is not recorded, and dropping them straight back a
 * stage would surprise whoever picks them up.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { ids?: unknown };
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

  const db = getDb();
  const now = new Date().toISOString();
  let restored = 0;
  for (const id of ids) {
    const res = db
      .update(schema.leads)
      .set({ deletedAt: null, status: "new", stageChangedAt: now, updatedAt: now })
      .where(and(eq(schema.leads.id, id), isNotNull(schema.leads.deletedAt)))
      .run();
    restored += res.changes;
  }

  if (restored > 0) {
    writeAuditLog({
      category: "data",
      action: "restore_leads",
      actorUserId: user!.id,
      entityType: "lead",
      summary: `Restored ${restored} archived lead${restored === 1 ? "" : "s"}`,
      details: { ids },
    });
  }

  return NextResponse.json({ restored });
}
