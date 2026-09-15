import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";

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
  const existing = db
    .select()
    .from(schema.messageTemplates)
    .where(eq(schema.messageTemplates.id, Number(id)))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Shared templates only editable by admin; personal only by owner (or admin)
  if (!existing.isPersonal && !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.isPersonal && existing.createdBy !== user.id && !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const now = new Date().toISOString();

    const update: Record<string, unknown> = { updatedBy: user.id, updatedAt: now };
    if (body.name !== undefined) update.name = body.name;
    if (body.category !== undefined) update.category = body.category;
    if (body.body !== undefined) update.body = body.body;
    if (body.active !== undefined) update.active = body.active;

    db.update(schema.messageTemplates)
      .set(update)
      .where(eq(schema.messageTemplates.id, Number(id)))
      .run();

    const updated = db
      .select()
      .from(schema.messageTemplates)
      .where(eq(schema.messageTemplates.id, Number(id)))
      .get();

    return NextResponse.json({ template: updated });
  } catch (error) {
    console.error("Update template error:", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const existing = db
    .select()
    .from(schema.messageTemplates)
    .where(eq(schema.messageTemplates.id, Number(id)))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  if (!existing.isPersonal && !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.isPersonal && existing.createdBy !== user.id && !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft delete - deactivate instead of hard delete
  db.update(schema.messageTemplates)
    .set({ active: false })
    .where(eq(schema.messageTemplates.id, Number(id)))
    .run();

  return NextResponse.json({ ok: true });
}