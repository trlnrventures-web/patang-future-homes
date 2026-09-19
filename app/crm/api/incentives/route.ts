import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import {
  getMonthlyIncentives,
  getUserIncentiveForMonth,
  currentMonthKey,
  markIncentivePaid,
  markIncentiveUnpaid,
} from "@/lib/crm/incentives";

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
  const action = body.action === "unpaid" ? "unpaid" : "paid";
  if (!userId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const db = getDb();
  const target = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (action === "unpaid") {
    const result = markIncentiveUnpaid(userId, month, user.id);
    if (!result.ok) {
      return NextResponse.json({ error: "Nothing to reverse — this month is not marked paid" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, action, previous: result.previous });
  }

  const { amount, paidAt } = markIncentivePaid(userId, month, target.role, user.id);
  return NextResponse.json({ ok: true, action, amount, paidAt });
}