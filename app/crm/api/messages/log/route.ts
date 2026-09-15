import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { desc } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const now = new Date().toISOString();

    if (!body.leadId || !body.renderedMessage) {
      return NextResponse.json({ error: "leadId and renderedMessage required" }, { status: 400 });
    }

    const db = getDb();

    db.insert(schema.messageLogs).values({
      leadId: Number(body.leadId),
      userId: user.id,
      templateId: body.templateId ? Number(body.templateId) : null,
      category: body.category || null,
      renderedMessage: body.renderedMessage,
      action: body.action || "generated",
      createdAt: now,
    }).run();

    // Also record in lead activities where useful
    const actionTypeMap: Record<string, string> = {
      copied: "message_copied",
      whatsapp_opened: "message_whatsapp_opened",
      generated: "message_generated",
    };

    const activityType = actionTypeMap[body.action || "generated"];
    if (activityType) {
      db.insert(schema.activities).values({
        leadId: Number(body.leadId),
        userId: user.id,
        type: activityType as never,
        notes:
          body.action === "copied"
            ? "Message copied to clipboard"
            : body.action === "whatsapp_opened"
              ? "WhatsApp opened"
              : "Message generated",
        metadata: JSON.stringify({
          category: body.category || null,
          templateId: body.templateId || null,
        }),
        createdAt: now,
      }).run();
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Log message error:", error);
    return NextResponse.json({ error: "Failed to log message" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId");

  const db = getDb();
  let rows = db
    .select()
    .from(schema.messageLogs)
    .orderBy(desc(schema.messageLogs.createdAt))
    .all();

  if (leadId) {
    rows = rows.filter((log) => log.leadId === Number(leadId));
  }

  const users = db.select().from(schema.users).all();
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const result = rows.map((r) => ({
    ...r,
    userName: userMap.get(r.userId) || "",
  }));

  return NextResponse.json({ logs: result });
}