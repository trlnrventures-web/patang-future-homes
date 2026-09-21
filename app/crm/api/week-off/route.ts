import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, and } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { istToday, isWeekOffDate, getWeekOffDay } from "@/lib/crm/attendance";
import { writeAuditLog } from "@/lib/crm/audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const decision = body.decision as "taken_off" | "worked";

    if (decision !== "taken_off" && decision !== "worked") {
      return NextResponse.json({ error: "Decision must be 'taken_off' or 'worked'" }, { status: 400 });
    }

    const today = istToday();
    const db = getDb();
    const dbUser = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
    const weekOffDay = getWeekOffDay(dbUser ? { weekOffDay: dbUser.weekOffDay } : {});

    if (!isWeekOffDate(today, weekOffDay)) {
      return NextResponse.json({ error: "Today is not your week-off day" }, { status: 400 });
    }

    const existing = db
      .select()
      .from(schema.weekOffDecisions)
      .where(and(eq(schema.weekOffDecisions.userId, user.id), eq(schema.weekOffDecisions.date, today)))
      .get();

    if (existing) {
      return NextResponse.json({ error: "You have already made your week-off decision for today" }, { status: 400 });
    }

    const leaveBanked = decision === "worked";

    db.insert(schema.weekOffDecisions)
      .values({
        userId: user.id,
        date: today,
        decision,
        leaveBanked,
        createdAt: new Date().toISOString(),
      })
      .run();

    if (leaveBanked) {
      writeAuditLog({
        category: "attendance",
        action: "week_off_banked",
        actorUserId: user.id,
        targetUserId: user.id,
        entityType: "week_off_decision",
        entityId: `${user.id}:${today}`,
        summary: `${dbUser?.name || "User"} chose to work on their week-off (${today}) and banked 1 leave credit.`,
        details: { date: today, decision },
      });
    } else {
      writeAuditLog({
        category: "attendance",
        action: "week_off_taken",
        actorUserId: user.id,
        targetUserId: user.id,
        entityType: "week_off_decision",
        entityId: `${user.id}:${today}`,
        summary: `${dbUser?.name || "User"} took their week-off on ${today}.`,
        details: { date: today, decision },
      });
    }

    return NextResponse.json({
      ok: true,
      decision,
      leaveBanked,
      message: leaveBanked
        ? "Working today. 1 leave credit banked for use within 2 months."
        : "Week-off marked. No banking for today.",
    });
  } catch (error) {
    console.error("Week-off POST error:", error);
    return NextResponse.json({ error: "Failed to save week-off decision" }, { status: 500 });
  }
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = istToday();
  const db = getDb();
  const existing = db
    .select()
    .from(schema.weekOffDecisions)
    .where(and(eq(schema.weekOffDecisions.userId, user.id), eq(schema.weekOffDecisions.date, today)))
    .get();

  return NextResponse.json({
    decision: existing ? existing.decision : null,
    leaveBanked: existing ? existing.leaveBanked : false,
  });
}
