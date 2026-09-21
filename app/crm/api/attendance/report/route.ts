import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import {
  isWeekOffDate,
  getWeekOffDay,
  getApprovedLeaveDaysForUser,
  checkinStatus,
  classifyDay,
  type AttendanceRow,
} from "@/lib/crm/attendance";
import { currentMonthKey, getUserIncentiveForMonth } from "@/lib/crm/incentives";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthDateRange(month: string): { from: string; to: string; year: number; monthNum: number } {
  const [y, m] = month.split("-").map(Number);
  const total = daysInMonth(y, m);
  return {
    from: `${y}-${String(m).padStart(2, "0")}-01`,
    to: `${y}-${String(m).padStart(2, "0")}-${String(total).padStart(2, "0")}`,
    year: y,
    monthNum: m,
  };
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const monthParam = request.nextUrl.searchParams.get("month") || currentMonthKey();
  const month = monthParam.slice(0, 7);
  const userIdParam = request.nextUrl.searchParams.get("userId");
  const userIsAdmin = isAdmin(user);

  const targetUserId = userIdParam && userIsAdmin ? Number(userIdParam) : user.id;

  const { from, to, year, monthNum } = monthDateRange(month);
  const totalDays = daysInMonth(year, monthNum);

  const targetUser = db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).get();
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const weekOffDay = getWeekOffDay({ weekOffDay: targetUser.weekOffDay });
  const approvedLeave = getApprovedLeaveDaysForUser(targetUserId);

  const attendanceRows = db
    .select()
    .from(schema.attendance)
    .where(
      and(
        eq(schema.attendance.userId, targetUserId),
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
        eq(schema.weekOffDecisions.userId, targetUserId),
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
  const holidaysInMonth = holidays.length;

  const dayDetails: {
    date: string;
    dayName: string;
    type: string;
    label: string;
    checkinTime: string | null;
    checkoutTime: string | null;
    status: string | null;
  }[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const dateKey = `${year}-${String(monthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayOfWeek = new Date(`${dateKey}T12:00:00+05:30`).getDay();
    const dayName = DAY_NAMES[dayOfWeek];
    const row = attendanceByDate.get(dateKey) || null;
    const isHoliday = holidayDates.has(dateKey);
    const isWeekOff = isWeekOffDate(dateKey, weekOffDay);
    const onLeave = approvedLeave.has(dateKey);
    const weekOffDecision = weekOffDecisionMap.get(dateKey);

    const classified = classifyDay(row, { isWeekOff, onLeave, date: dateKey, today: from });

    let detailType: string = classified.type;
    let detailLabel = classified.label;

    if (isHoliday && !isWeekOff && !onLeave && !row?.checkinTime) {
      detailType = "holiday";
      detailLabel = `Holiday: ${holidays.find((h) => h.date === dateKey)?.name || ""}`;
    }

    if (isWeekOff && weekOffDecision?.decision === "worked") {
      detailType = "checked_in";
      detailLabel = "Worked (week-off banked)";
    }

    dayDetails.push({
      date: dateKey,
      dayName,
      type: detailType,
      label: detailLabel,
      checkinTime: row?.checkinTime || null,
      checkoutTime: row?.checkoutTime || null,
      status: row?.checkinTime ? checkinStatus(row) : null,
    });

    if (isHoliday && !isWeekOff && !onLeave && !row?.checkinTime) {
      // Holiday - don't count as absent
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
      if (checkinStatus(row) === "late") {
        daysLate++;
      }
    } else {
      daysAbsent++;
    }
  }

  const incentiveEntry = (() => {
    try {
      return getUserIncentiveForMonth(targetUserId, month);
    } catch {
      return null;
    }
  })();

  const incentiveEarned = incentiveEntry?.total || 0;

  return NextResponse.json({
    month,
    user: {
      id: targetUser.id,
      name: targetUser.name,
      role: targetUser.role,
      baseSalary: targetUser.baseSalary,
      weekOffDay,
    },
    summary: {
      totalDays,
      daysPresent,
      daysLate,
      daysAbsent,
      leaveDays,
      leaveDaysBankCovered,
      leaveDaysDeductible,
      weekOffsTaken,
      weekOffsWorkedBanked,
      holidaysInMonth,
      incentiveEarned,
    },
    holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
    dayDetails,
  });
}
