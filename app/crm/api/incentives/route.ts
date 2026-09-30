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
  getBookingIncentiveRows,
  getIncentiveLiabilitySummary,
  markBookingIncentivePaid,
  markBookingIncentiveUnpaid,
  type BookingIncentiveFilters,
} from "@/lib/crm/incentives";

export const dynamic = "force-dynamic";

function parseFilters(params: URLSearchParams): BookingIncentiveFilters {
  const paidRaw = params.get("paid");
  return {
    month: (params.get("month") || currentMonthKey()).slice(0, 7) || undefined,
    userId: params.get("userId") ? Number(params.get("userId")) : undefined,
    role: params.get("role") === "caller" || params.get("role") === "sales_manager" ? (params.get("role") as "caller" | "sales_manager") : undefined,
    paid: paidRaw === "true" ? true : paidRaw === "false" ? false : undefined,
  };
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOversight = user.role === "admin" || user.role === "sales_head";
  const params = request.nextUrl.searchParams;

  if (params.get("scope") === "bookings") {
    const filters = parseFilters(params);
    // Staff only ever see their own rows. This is applied here rather than in
    // the query so there is no code path where a staff id reaches the filter
    // unforced.
    const scoped: BookingIncentiveFilters = isOversight ? filters : { ...filters, userId: user.id };
    return NextResponse.json({
      month: scoped.month ?? currentMonthKey(),
      rows: getBookingIncentiveRows(scoped),
      liability: getIncentiveLiabilitySummary({ month: scoped.month }),
    });
  }

  const month = (params.get("month") || currentMonthKey()).slice(0, 7);
  const requestedUserId = Number(params.get("userId") || "");

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

  // Per-booking settlement. bookingId + userId identify the row, so a lead with
  // both a Caller and an SM pays one side without touching the other.
  if (body.bookingId != null) {
    const bookingId = Number(body.bookingId);
    const userId = Number(body.userId);
    const action = body.action === "unpaid" ? "unpaid" : "paid";
    if (!Number.isInteger(bookingId) || !Number.isInteger(userId)) {
      return NextResponse.json({ error: "bookingId and userId required" }, { status: 400 });
    }

    const row = getBookingIncentiveRows({}).find(
      (r) => r.bookingId === bookingId && r.userId === userId
    );
    if (!row) {
      return NextResponse.json({ error: "No incentive row for that booking" }, { status: 404 });
    }

    if (action === "unpaid") {
      const result = markBookingIncentiveUnpaid(bookingId, userId, row.role, user.id);
      if (!result.ok) {
        return NextResponse.json({ error: "Nothing to reverse - this row is not marked paid" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, action, previous: result.previous });
    }

    const { amount, paidAt } = markBookingIncentivePaid(bookingId, userId, row.role, row.amount, user.id);
    return NextResponse.json({ ok: true, action, amount, paidAt });
  }

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