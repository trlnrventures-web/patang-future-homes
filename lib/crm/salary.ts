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
  workingMinutes,
  type AttendanceRow,
} from "./attendance";
import { getUserIncentiveForMonth, marketingCommissionForMonth } from "./incentives";
import { getOfficeHours } from "./office-hours";

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthDateRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const total = daysInMonth(y, m);
  return {
    from: `${y}-${String(m).padStart(2, "0")}-01`,
    to: `${y}-${String(m).padStart(2, "0")}-${String(total).padStart(2, "0")}`,
    year: y,
    monthNum: m,
  };
}

/**
 * A day that falls short of the configured Office Hours window loses the
 * matching fraction of that day's pay - but only when both timestamps exist,
 * because a missing checkout says nothing about how long someone worked.
 * Thirty minutes of slack absorbs the walk-in-to-desk gap so a 10:33 start
 * is not a pay event.
 */
export const SHORTAGE_GRACE_MINUTES = 30;

/** Official minutes per working day, straight from Settings → Office Hours. */
export function requiredOfficeMinutes(): number {
  const hours = getOfficeHours();
  if (!hours.enabled) return 0;
  return hours.endMin > hours.startMin
    ? hours.endMin - hours.startMin
    : 1440 - hours.startMin + hours.endMin;
}

/**
 * What a user is owed for `month`.
 *
 * - Salaried roles: base salary minus unpaid days, minus any hours shortfall
 *   against the Office Hours window, plus their ladder incentive.
 * - Marketing: no base salary at all - the whole packet is their share of the
 *   month's confirmed sales (see marketingCommissionForMonth).
 * - Admin/owner: never called for salary purposes; the sweep skips them.
 *
 * `hoursDeduction` is a derived display figure with no column of its own, so
 * callers that persist the row must strip it (see the POST handler).
 */
export async function computeSalaryReport(userId: number, month: string) {
  const db = getDb();
  const { from, to, year, monthNum } = monthDateRange(month);
  const totalDays = daysInMonth(year, monthNum);

  const targetUser = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!targetUser) return null;

  const isMarketing = targetUser.role === "marketing";
  const baseSalary = isMarketing ? 0 : targetUser.baseSalary || 0;
  const weekOffDay = getWeekOffDay({ weekOffDay: targetUser.weekOffDay });
  const today = istToday();
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
  /** Sum of per-day shortfall fractions (0..1 each) on fully attended days. */
  let shortageFractions = 0;
  let shortageDays = 0;

  const requiredMin = requiredOfficeMinutes();

  for (let d = 1; d <= totalDays; d++) {
    const dateKey = `${year}-${String(monthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (dateKey > today) continue;
    const row = attendanceByDate.get(dateKey) || null;
    const isHoliday = holidayDates.has(dateKey);
    const isWeekOff = isWeekOffDate(dateKey, weekOffDay);
    const onLeave = approvedLeave.has(dateKey);
    const weekOffDecision = weekOffDecisionMap.get(dateKey);

    const classified = classifyDay(row, { isWeekOff, onLeave, date: dateKey, today });
    const workedExplicitly = Boolean(row?.checkinTime) || row?.dayType === "present";

    if (classified.type === "left_job") {
      leftJobDays++;
    } else if (classified.type === "holiday" && row?.dayType === "holiday") {
      personalHolidays++;
    } else if (isHoliday && !isWeekOff && !workedExplicitly && !onLeave) {
      // Company-wide holiday - no deduction
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
      // Already paid at half rate - an hours cut on top would double-charge.
      halfDays++;
    } else if (row?.checkinTime || row?.dayType === "present") {
      daysPresent++;
      if (checkinStatus(row) === "late") daysLate++;

      if (requiredMin > 0 && row?.checkinTime && row?.checkoutTime) {
        const worked = workingMinutes(row);
        if (worked + SHORTAGE_GRACE_MINUTES < requiredMin) {
          shortageFractions += Math.min(1, (requiredMin - worked) / requiredMin);
          shortageDays++;
        }
      }
    } else {
      daysAbsent++;
    }
  }

  const incentiveEntry = getUserIncentiveForMonth(userId, month);
  const commission = isMarketing ? marketingCommissionForMonth(month) : null;
  const incentiveEarned = commission
    ? commission.commission
    : incentiveEntry?.total || 0;

  const perDaySalary = totalDays > 0 ? Math.round(baseSalary / totalDays) : 0;
  // A half day is paid at half rate, so it contributes half a day of unpaid time.
  const unpaidDays = leaveDaysDeductible + daysAbsent + halfDays * 0.5;
  const dayDeductions = Math.round(unpaidDays * perDaySalary);
  const hoursDeduction = Math.round(shortageFractions * perDaySalary);
  const deductions = dayDeductions + hoursDeduction;
  const netPaid = baseSalary - deductions + incentiveEarned;
  // Payable presence including half days. days_present stays integral so the
  // persisted salary_reports column keeps whole-day semantics.
  const effectiveDaysPresent = daysPresent + halfDays * 0.5;

  return {
    userId,
    month,
    baseSalary,
    daysPresent,
    effectiveDaysPresent,
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
    holidaysInMonth: holidays.length,
    incentiveEarned,
    deductions,
    hoursDeduction,
    shortageDays,
    netPaid: Math.max(0, netPaid),
  };
}
