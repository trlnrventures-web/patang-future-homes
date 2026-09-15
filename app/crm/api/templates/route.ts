import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { desc, eq, and } from "drizzle-orm";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  const scope = searchParams.get("scope") || "shared";

  const db = getDb();

  let rows;
  if (scope === "mine") {
    rows = db
      .select()
      .from(schema.messageTemplates)
      .where(
        and(
          eq(schema.messageTemplates.createdBy, user.id),
          eq(schema.messageTemplates.isPersonal, true as never)
        )
      )
      .orderBy(desc(schema.messageTemplates.createdAt))
      .all();
  } else {
    rows = db
      .select()
      .from(schema.messageTemplates)
      .where(eq(schema.messageTemplates.isPersonal, false as never))
      .orderBy(desc(schema.messageTemplates.createdAt))
      .all();
  }

  if (category) {
    rows = rows.filter((t) => t.category === category);
  }

  const users = db.select().from(schema.users).all();
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const result = rows.map((t) => ({
    ...t,
    createdByName: userMap.get(t.createdBy) || "",
  }));

  return NextResponse.json({ templates: result });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const now = new Date().toISOString();

    const isPersonal = body.isPersonal !== undefined ? body.isPersonal === true : false;

    // Only admin can create shared templates
    if (!isPersonal && !isAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!body.name || !body.body) {
      return NextResponse.json({ error: "Name and body required" }, { status: 400 });
    }

    const db = getDb();
    const template = db
      .insert(schema.messageTemplates)
      .values({
        name: body.name,
        category: body.category || "custom",
        body: body.body,
        active: true,
        isPersonal,
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Create template error:", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}