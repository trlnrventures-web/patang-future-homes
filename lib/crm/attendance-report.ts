import { getDb } from "./db";
import * as schema from "./schema";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  isWeekOffDate,
  getWeekOffDay,
  getApprovedLeaveDaysForUser,
  checkinStatus,
  classifyDay,
  istToday,
  type AttendanceRow,
} from "./attendance";
import { getUserIncentiveForMonth } from "./incentives";

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type DayDetail = {
  date: string;
  dayName: string;
  type: string;
  label: string;
  checkinTime: string | null;
  checkoutTime: string | null;
  status: string | null;
};

export type AttendanceReportPayload = {
  month: string;
  user: {
    id: number;
    name: string;
    role: string;
    baseSalary: number | null;
    weekOffDay: string;
  };
  summary: {
    totalDays: number;
    daysPresent: number;
    halfDays: number;
    daysLate: number;
    daysAbsent: number;
    personalHolidays: number;
    leftJobDays: number;
    leaveDays: number;
    leaveDaysBankCovered: number;
    leaveDaysDeductible: number;
    weekOffsTaken: number;
    weekOffsWorkedBanked: number;
    holidaysInMonth: number;
    incentiveEarned: number;
  };
  holidays: { date: string; name: string }[];
  dayDetails: DayDetail[];
};

/**
 * The month of one person, day by day. The report page and the Excel export
 * both read this single function, so what a manager sees on screen and what
 * downloads can never drift apart.
 *
 * Returns null when the user id does not exist.
 */
export function buildAttendanceReport(
  targetUserId: number,
  month: string
): AttendanceReportPayload | null {
  const db = getDb();
  const [y, m] = month.split("-").map(Number);
  const monthNum = Number.isFinite(m) ? m : 1;
  const year = Number.isFinite(y) ? y : 1970;
  const totalDays = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const from = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const to = `${year}-${String(monthNum).padStart(2, "0")}-${String(totalDays).padStart(2, "0")}`;

  const targetUser = db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).get();
  if (!targetUser) return null;

  const weekOffDay = getWeekOffDay({ weekOffDay: targetUser.weekOffDay });
  const approvedLeave = getApprovedLeaveDaysForUser(targetUserId);
  const today = istToday();

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
    .where(
      and(
        eq(schema.companyHolidays.active, true),
        gte(schema.companyHolidays.date, from),
        lte(schema.companyHolidays.date, to)
      )
    )
    .all();

  const holidayDates = new Set(holidays.map((h) => h.date));

  let daysPresent = 0;
  let halfDays = 0;
  let daysLate = 0;
  let daysAbsent = 0;
  let personalHolidays = 0;
  let leftJobDays = 0;
  let leaveDays = 0;
  let leaveDaysBankCovered = 0;
  let leaveDaysDeductible = 0;
  let weekOffsTaken = 0;
  let weekOffsWorkedBanked = 0;
  const holidaysInMonth = holidays.length;

  const dayDetails: DayDetail[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const dateKey = `${year}-${String(monthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayOfWeek = new Date(`${dateKey}T12:00:00+05:30`).getDay();
    const dayName = DAY_NAMES[dayOfWeek];
    const row = attendanceByDate.get(dateKey) || null;
    const isHoliday = holidayDates.has(dateKey);
    const isWeekOff = isWeekOffDate(dateKey, weekOffDay);
    const onLeave = approvedLeave.has(dateKey);
    const weekOffDecision = weekOffDecisionMap.get(dateKey);

    const classified = classifyDay(row, { isWeekOff, onLeave, date: dateKey, today });
    const workedExplicitly = Boolean(row?.checkinTime) || row?.dayType === "present";
    const isFuture = dateKey > today;

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

    if (isFuture) {
      detailType = "upcoming";
      detailLabel = "Upcoming";
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

    if (isFuture) {
      // Day has not happened yet - shown above but never tallied.
    } else if (classified.type === "left_job") {
      // Employment ended - neither present nor absent, and never deducted.
      leftJobDays++;
    } else if (classified.type === "holiday") {
      // Per-person holiday - not an absence, no deduction.
      if (row?.dayType === "holiday") personalHolidays++;
    } else if (isHoliday && !isWeekOff && !workedExplicitly && !onLeave) {
      // Company-wide holiday - don't count as absent
    } else if (row?.dayType === "week_off" || (isWeekOff && !workedExplicitly)) {
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
    } else if (classified.type === "half_day" || row?.dayType === "half_day") {
      // A half day is half present and half unpaid - see salary computation.
      halfDays++;
      daysPresent += 0.5;
    } else if (row?.checkinTime || row?.dayType === "present") {
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

  return {
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
      halfDays,
      daysLate,
      daysAbsent,
      personalHolidays,
      leftJobDays,
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
  };
}
