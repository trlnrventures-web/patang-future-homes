import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, and } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { istToday } from "@/lib/crm/attendance";
import { addDaysToDateKey, consumeCreditsForLeave, releaseCreditsForLeave } from "@/lib/crm/leave-credits";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const startDate = String(body.startDate || "");
    const endDate = String(body.endDate || "");
    const reason = String(body.reason || "").trim().slice(0, 300);

    if (!startDate || !endDate || !reason) {
      return NextResponse.json({ error: "Start date, end date, and reason are required" }, { status: 400 });
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: "End date cannot be before start date" }, { status: 400 });
    }
    if (startDate < istToday()) {
      return NextResponse.json({ error: "Leave requests cannot be made for past dates" }, { status: 400 });
    }

    const db = getDb();
    const overlap = db
      .select()
      .from(schema.leaveRequests)
      .where(and(eq(schema.leaveRequests.userId, user.id), eq(schema.leaveRequests.status, "pending")))
      .all()
      .some((r) => r.startDate <= endDate && r.endDate >= startDate);

    if (overlap) {
      return NextResponse.json({ error: "You already have a pending request for this date range" }, { status: 400 });
    }

    db.insert(schema.leaveRequests)
      .values({ userId: user.id, startDate, endDate, reason, createdAt: new Date().toISOString() })
      .run();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Leave POST error:", error);
    return NextResponse.json({ error: "Failed to save leave request" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "sales_head") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = Number(body.id);
    const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
    if (!id || !action) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }

    const db = getDb();
    const req = db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, id)).get();
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    db.update(schema.leaveRequests)
      .set({
        status: action === "approve" ? "approved" : "rejected",
        rejectionReason: action === "reject" ? String(body.rejectionReason || "").slice(0, 200) : null,
        decidedBy: user.id,
        decidedAt: new Date().toISOString(),
      })
      .where(eq(schema.leaveRequests.id, id))
      .run();

    // Approving spends the requester's banked credits, oldest expiry first, so
    // the balance they see can never promise a credit that is already spoken
    // for. Re-rejecting a request that was already approved hands the credits
    // back rather than silently costing the staff member a day off they did not
    // take.
    const days: string[] = [];
    for (let d = req.startDate, guard = 0; d <= req.endDate && guard < 366; d = addDaysToDateKey(d, 1), guard++) {
      days.push(d);
    }

    let covered: string[] = [];
    if (action === "approve") {
      covered = consumeCreditsForLeave(req.userId, days, req.id);
    } else {
      releaseCreditsForLeave(req.id);
    }

    return NextResponse.json({
      ok: true,
      bankedCreditsApplied: covered.length,
      uncoveredDays: days.length - covered.length,
    });
  } catch (error) {
    console.error("Leave PATCH error:", error);
    return NextResponse.json({ error: "Failed to update leave request" }, { status: 500 });
  }
}