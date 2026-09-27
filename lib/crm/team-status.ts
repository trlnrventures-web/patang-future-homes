import { getDb } from "./db";
import * as schema from "./schema";
import { eq, and } from "drizzle-orm";
import {
  istToday,
  getWeekOffDay,
  isWeekOffDate,
  isUserOnLeave,
  getAttendanceRow,
  formatIstClock,
  checkinStatus,
} from "./attendance";

export type TeamStatusKind =
  | "checked_in_on_time"
  | "checked_in_late"
  | "not_checked_in"
  | "week_off"
  | "week_off_worked"
  | "on_leave"
  | "holiday";

export type TeamMemberStatus = {
  id: number;
  name: string;
  role: "caller" | "sales_manager";
  kind: TeamStatusKind;
  label: string;
  checkinTime: string;
  weekOffDay: string;
};

function statusFor(member: {
  id: number;
  name: string;
  role: "caller" | "sales_manager";
  weekOffDay: string;
  today: string;
}): Omit<TeamMemberStatus, "checkinTime"> {
  const today = member.today;
  const weekOff = isWeekOffDate(today, member.weekOffDay);
  const onLeave = isUserOnLeave(member.id, today);

  const db = getDb();
  const holiday = db
    .select()
    .from(schema.companyHolidays)
    .where(and(eq(schema.companyHolidays.date, today), eq(schema.companyHolidays.active, true)))
    .get();

  if (onLeave) return { id: member.id, name: member.name, role: member.role, kind: "on_leave", label: "On Leave", weekOffDay: member.weekOffDay };

  if (weekOff) {
    const decision = db
      .select()
      .from(schema.weekOffDecisions)
      .where(and(eq(schema.weekOffDecisions.userId, member.id), eq(schema.weekOffDecisions.date, today)))
      .get();
    if (decision?.decision === "worked") {
      return { id: member.id, name: member.name, role: member.role, kind: "week_off_worked", label: "Worked on Week-off", weekOffDay: member.weekOffDay };
    }
    return { id: member.id, name: member.name, role: member.role, kind: "week_off", label: "Week Off", weekOffDay: member.weekOffDay };
  }

  if (holiday) return { id: member.id, name: member.name, role: member.role, kind: "holiday", label: "Holiday", weekOffDay: member.weekOffDay };

  const row = getAttendanceRow(member.id, today);
  if (row?.checkinTime) {
    const status = checkinStatus(row);
    return {
      id: member.id,
      name: member.name,
      role: member.role,
      kind: status === "late" ? "checked_in_late" : "checked_in_on_time",
      label: status === "late" ? "Checked In (late)" : "Checked In (on time)",
      weekOffDay: member.weekOffDay,
    };
  }
  return { id: member.id, name: member.name, role: member.role, kind: "not_checked_in", label: "Not Checked In", weekOffDay: member.weekOffDay };
}

const SORT_ORDER: Record<TeamStatusKind, number> = {
  checked_in_on_time: 0,
  checked_in_late: 0,
  not_checked_in: 1,
  holiday: 2,
  week_off: 2,
  week_off_worked: 2,
  on_leave: 2,
};

export function getTodayTeamStatus(): TeamMemberStatus[] {
  const db = getDb();
  const today = istToday();

  const members = db
    .select()
    .from(schema.users)
    .all()
    .filter((u) => u.active && (u.role === "caller" || u.role === "sales_manager"))
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role as "caller" | "sales_manager",
      weekOffDay: getWeekOffDay(u),
    }));

  return members
    .map((m) => {
      const base = statusFor({ ...m, today });
      const row = getAttendanceRow(m.id, today);
      return { ...base, checkinTime: formatIstClock(row?.checkinTime || null) };
    })
    .sort((a, b) => {
      const byKind = SORT_ORDER[a.kind] - SORT_ORDER[b.kind];
      if (byKind !== 0) return byKind;
      return a.name.localeCompare(b.name);
    });
}