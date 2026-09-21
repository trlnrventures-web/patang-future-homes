import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { writeAuditLog } from "@/lib/crm/audit";
import {
  isWeekOffDate,
  getWeekOffDay,
  getApprovedLeaveDaysForUser,
  checkinStatus,
  type AttendanceRow,
} from "@/lib/crm/attendance";
import { currentMonthKey, getUserIncentiveForMonth } from "@/lib/crm/incentives";

export const dynamic = "force-dynamic";

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthDateRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const total = daysInMonth(y, m);
  return {
    from: `${y}-${String(m).padStart(2, "0")}-01`,
    to: `${y}-${String(m).padStart(2, "0")}-${String(total).padStart(2, "0")}`,
    year: y,
    monthNum: m,
  };
}

async function computeSalaryReport(userId: number, month: string) {
  const db = getDb();
  const { from, to, year, monthNum } = monthDateRange(month);
  const totalDays = daysInMonth(year, monthNum);

  const targetUser = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!targetUser) return null;

  const baseSalary = targetUser.baseSalary || 0;
  const weekOffDay = getWeekOffDay({ weekOffDay: targetUser.weekOffDay });
  const approvedLeave = getApprovedLeaveDaysForUser(userId);

  const attendanceRows = db
    .select()
    .from(schema.attendance)
    .where(
      and(
        eq(schema.attendance.userId, userId),
        gte(schema.attendance.date, from),
        lte(schema.attendance.date, to)
      )
    )
    .all() as unknown as AttendanceRow[];

  const attendanceByDate = new Map(attendanceRows.map((r) => [r.date, r]));

  const weekOffDecisions = db
    .select()
    .from(schema.weekOffDecisions)
    .where(
      and(
        eq(schema.weekOffDecisions.userId, userId),
        gte(schema.weekOffDecisions.date, from),
        lte(schema.weekOffDecisions.date, to)
      )
    )
    .all();
  const weekOffDecisionMap = new Map(weekOffDecisions.map((d) => [d.date, d]));

  const holidays = db
    .select()
    .from(schema.companyHolidays)
    .where(and(eq(schema.companyHolidays.active, true), gte(schema.companyHolidays.date, from), lte(schema.companyHolidays.date, to)))
    .all();
  const holidayDates = new Set(holidays.map((h) => h.date));

  let daysPresent = 0;
  let daysLate = 0;
  let daysAbsent = 0;
  let leaveDays = 0;
  let leaveDaysBankCovered = 0;
  let leaveDaysDeductible = 0;
  let weekOffsTaken = 0;
  let weekOffsWorkedBanked = 0;

  for (let d = 1; d <= totalDays; d++) {
    const dateKey = `${year}-${String(monthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const row = attendanceByDate.get(dateKey) || null;
    const isHoliday = holidayDates.has(dateKey);
    const isWeekOff = isWeekOffDate(dateKey, weekOffDay);
    const onLeave = approvedLeave.has(dateKey);
    const weekOffDecision = weekOffDecisionMap.get(dateKey);

    if (isHoliday && !isWeekOff && !onLeave && !row?.checkinTime) {
      // Holiday - no deduction
    } else if (isWeekOff) {
      if (weekOffDecision?.decision === "worked") {
        weekOffsWorkedBanked++;
      } else {
        weekOffsTaken++;
      }
    } else if (onLeave) {
      leaveDays++;
      if (weekOffDecision?.leaveBanked) {
        leaveDaysBankCovered++;
      } else {
        leaveDaysDeductible++;
      }
    } else if (row?.checkinTime) {
      daysPresent++;
      if (checkinStatus(row) === "late") daysLate++;
    } else {
      daysAbsent++;
    }
  }

  const incentiveEntry = getUserIncentiveForMonth(userId, month);
  const incentiveEarned = incentiveEntry?.total || 0;

  const perDaySalary = totalDays > 0 ? Math.round(baseSalary / totalDays) : 0;
  const unpaidDays = leaveDaysDeductible + daysAbsent;
  const deductions = unpaidDays * perDaySalary;
  const netPaid = baseSalary - deductions + incentiveEarned;

  return {
    userId,
    month,
    baseSalary,
    daysPresent,
    daysLate,
    daysAbsent,
    leaveDays,
    leaveDaysBankCovered,
    leaveDaysDeductible,
    weekOffsTaken,
    weekOffsWorkedBanked,
    holidaysInMonth: holidays.length,
    incentiveEarned,
    deductions,
    netPaid: Math.max(0, netPaid),
  };
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const userIsAdmin = isAdmin(user);
  const monthParam = request.nextUrl.searchParams.get("month");
  const yearParam = request.nextUrl.searchParams.get("year");
  const userIdParam = request.nextUrl.searchParams.get("userId");

  if (monthParam) {
    const month = monthParam.slice(0, 7);
    const targetUserId = userIdParam && userIsAdmin ? Number(userIdParam) : user.id;

    const existing = db
      .select()
      .from(schema.salaryReports)
      .where(and(eq(schema.salaryReports.userId, targetUserId), eq(schema.salaryReports.month, month)))
      .get();

    if (existing) {
      return NextResponse.json({ report: existing, computed: null });
    }

    const computed = await computeSalaryReport(targetUserId, month);
    return NextResponse.json({ report: null, computed });
  }

  const conditions = userIsAdmin ? [] : [eq(schema.salaryReports.userId, user.id)];

  if (yearParam) {
    const y = Number(yearParam);
    if (Number.isFinite(y)) {
      conditions.push(gte(schema.salaryReports.month, `${y}-01`));
      conditions.push(lte(schema.salaryReports.month, `${y}-12`));
    }
  }

  const reports = db
    .select()
    .from(schema.salaryReports)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.salaryReports.month))
    .all();

  return NextResponse.json({ reports });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const month = (body.month || currentMonthKey()).slice(0, 7);
    const targetUserId = Number(body.userId) || user.id;

    const db = getDb();

    const existing = db
      .select()
      .from(schema.salaryReports)
      .where(and(eq(schema.salaryReports.userId, targetUserId), eq(schema.salaryReports.month, month)))
      .get();

    if (existing) {
      return NextResponse.json({ error: "Salary report already exists for this month. Use PATCH to update payment status." }, { status: 409 });
    }

    const computed = await computeSalaryReport(targetUserId, month);
    if (!computed) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const inserted = db
      .insert(schema.salaryReports)
      .values({
        ...computed,
        generatedBy: user.id,
        createdAt: new Date().toISOString(),
      })
      .returning({ id: schema.salaryReports.id })
      .get();

    const targetName = db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).get()?.name || "Unknown";

    writeAuditLog({
      category: "incentive",
      action: "salary_report_generated",
      actorUserId: user.id,
      targetUserId,
      entityType: "salary_report",
      entityId: inserted?.id,
      summary: `Generated ${month} salary report for ${targetName}: ₹${computed.netPaid.toLocaleString("en-IN")} net paid.`,
      details: computed,
    });

    return NextResponse.json({ ok: true, id: inserted?.id, report: computed });
  } catch (error) {
    console.error("Salary POST error:", error);
    return NextResponse.json({ error: "Failed to generate salary report" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!id) {
      return NextResponse.json({ error: "Report id is required" }, { status: 400 });
    }

    const db = getDb();
    const report = db.select().from(schema.salaryReports).where(eq(schema.salaryReports.id, id)).get();
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (body.paymentStatus === "paid" || body.paymentStatus === "pending") {
      updates.paymentStatus = body.paymentStatus;
    }
    if (body.paymentDate !== undefined) {
      updates.paymentDate = body.paymentDate || null;
    }
    if (body.paymentStatus === "paid" && !report.paymentDate) {
      updates.paymentDate = new Date().toISOString().slice(0, 10);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
    }

    db.update(schema.salaryReports)
      .set(updates)
      .where(eq(schema.salaryReports.id, id))
      .run();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Salary PATCH error:", error);
    return NextResponse.json({ error: "Failed to update salary report" }, { status: 500 });
  }
}
