import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { getMonthlyIncentives, getUserIncentiveForMonth, currentMonthKey } from "@/lib/crm/incentives";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const month = (request.nextUrl.searchParams.get("month") || currentMonthKey()).slice(0, 7);
  const requestedUserId = Number(request.nextUrl.searchParams.get("userId") || "");

  const isOversight = user.role === "admin" || user.role === "sales_head";

  if (requestedUserId && !isOversight) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isOversight) {
    if (requestedUserId) {
      const entry = getUserIncentiveForMonth(requestedUserId, month);
      return NextResponse.json({ month, entries: entry ? [entry] : [] });
    }
    return NextResponse.json({ month, entries: getMonthlyIncentives(month) });
  }

  const entry = getUserIncentiveForMonth(user.id, month);
  return NextResponse.json({ month, entries: entry ? [entry] : [] });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "sales_head") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const userId = Number(body.userId);
  const month = String(body.month || "").slice(0, 7);
  if (!userId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const db = getDb();
  const target = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const entry = getUserIncentiveForMonth(userId, month);
  const amount = entry ? entry.total : 0;
  const paidAt = new Date().toISOString();

  const existing = db
    .select()
    .from(schema.incentivePayments)
    .where(and(eq(schema.incentivePayments.userId, userId), eq(schema.incentivePayments.month, month)))
    .get();

  if (existing) {
    db.update(schema.incentivePayments)
      .set({ amount, paidAt, paidBy: user.id, role: target.role })
      .where(eq(schema.incentivePayments.id, existing.id))
      .run();
  } else {
    db.insert(schema.incentivePayments)
      .values({ userId, month, role: target.role, amount, paidBy: user.id, paidAt })
      .run();
  }

  return NextResponse.json({ ok: true, amount, paidAt });
}