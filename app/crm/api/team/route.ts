import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { writeAuditLog } from "@/lib/crm/audit";
import { DEFAULT_WEEK_OFF_DAY } from "@/lib/crm/attendance";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const users = db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      phone: schema.users.phone,
      active: schema.users.active,
      weekOffDay: schema.users.weekOffDay,
      baseSalary: schema.users.baseSalary,
    })
    .from(schema.users)
    .all()
    .map((u) => ({
      ...u,
      weekOffDay: u.weekOffDay || DEFAULT_WEEK_OFF_DAY,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ users });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const targetUserId = Number(body.userId);
    if (!targetUserId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const db = getDb();
    const target = db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).get();
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body.baseSalary !== undefined) {
      const salary = body.baseSalary === null ? null : Number(body.baseSalary);
      if (salary !== null && (!Number.isFinite(salary) || salary < 0)) {
        return NextResponse.json({ error: "Invalid salary" }, { status: 400 });
      }
      updates.baseSalary = salary;
    }

    if (body.weekOffDay !== undefined) {
      const validDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      if (!validDays.includes(body.weekOffDay)) {
        return NextResponse.json({ error: "Invalid week-off day" }, { status: 400 });
      }
      updates.weekOffDay = body.weekOffDay;
    }

    if (body.active !== undefined) {
      updates.active = Boolean(body.active);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
    }

    db.update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, targetUserId))
      .run();

    const changes = Object.keys(updates)
      .map((k) => `${k}: ${updates[k]}`)
      .join(", ");

    writeAuditLog({
      category: "attendance",
      action: "team_member_updated",
      actorUserId: user.id,
      targetUserId,
      entityType: "user",
      entityId: targetUserId,
      summary: `Updated ${target.name}'s profile: ${changes}.`,
      details: updates,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Team PATCH error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
