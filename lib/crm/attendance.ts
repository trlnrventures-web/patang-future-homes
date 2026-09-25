import { getDb } from "./db";
import * as schema from "./schema";
import { eq, and } from "drizzle-orm";

export const OFFICE_LOCATION = {
  lat: 19.378918105071865,
  lng: 72.82824927618726,
};

export const GEOFENCE_RADIUS_M = 100;
export const CHECKIN_CUTOFF_MINUTE = 11 * 60; // 11:00 AM IST
export const DEFAULT_WEEK_OFF_DAY = "Tuesday";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function istToday(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istNowIso(): string {
  return new Date().toISOString();
}

function shiftToIst(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MS);
}

export function istHourMinute(iso: string): { hour: number; minute: number } {
  const d = shiftToIst(new Date(iso));
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

export function formatIstClock(iso: string | null): string {
  if (!iso) return "";
  const { hour, minute } = istHourMinute(iso);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${String(h12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${ampm}`;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayNameOf(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00+05:30`);
  return DAY_NAMES[d.getDay()];
}

export function getWeekOffDay(user: { weekOffDay?: string | null }): string {
  return user.weekOffDay || DEFAULT_WEEK_OFF_DAY;
}

export function isWeekOffDate(dateKey: string, weekOffDay: string): boolean {
  return weekdayNameOf(dateKey) === weekOffDay;
}

export function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function validateLatLng(
  lat: unknown,
  lng: unknown
): { lat: number; lng: number } | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: la, lng: ln };
}

export type AttendanceDayType =
  | "full_day"
  | "half_day"
  | "holiday"
  | "left_job"
  | "week_off"
  | "present";

export type AttendanceRow = {
  id: number;
  userId: number;
  date: string;
  dayType: AttendanceDayType;
  mode: "office" | "field_duty";
  fieldDutyReason: string | null;
  checkinTime: string | null;
  checkoutTime: string | null;
  checkinLat: string | null;
  checkinLng: string | null;
  checkinDistanceM: number | null;
  checkoutLat: string | null;
  checkoutLng: string | null;
  checkoutDistanceM: number | null;
  createdAt: string;
};

export function getAttendanceRow(userId: number, dateKey: string): AttendanceRow | null {
  const db = getDb();
  return db
    .select()
    .from(schema.attendance)
    .where(and(eq(schema.attendance.userId, userId), eq(schema.attendance.date, dateKey)))
    .get() as AttendanceRow | null;
}

function nextDateKey(dateKey: string): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

export function getApprovedLeaveDaysForUser(userId: number): Set<string> {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.leaveRequests)
    .where(and(eq(schema.leaveRequests.userId, userId), eq(schema.leaveRequests.status, "approved")))
    .all();
  const days = new Set<string>();
  for (const r of rows) {
    // start_date/end_date are plain YYYY-MM-DD calendar values, so iterate them
    // as calendar days. Converting through an IST midnight instant and reading
    // back a UTC date shifts every leave one day earlier.
    for (let d = r.startDate, guard = 0; d <= r.endDate && guard < 366; d = nextDateKey(d), guard++) {
      days.add(d);
    }
  }
  return days;
}

export function isUserOnLeave(userId: number, dateKey: string): boolean {
  return getApprovedLeaveDaysForUser(userId).has(dateKey);
}

export function getPendingLeaveCount(userId: number): number {
  const db = getDb();
  return db
    .select({ c: schema.leaveRequests.id })
    .from(schema.leaveRequests)
    .where(
      and(
        eq(schema.leaveRequests.userId, userId),
        eq(schema.leaveRequests.status, "pending")
      )
    )
    .all().length;
}

export function workingMinutes(row: AttendanceRow | null): number {
  if (!row?.checkinTime || !row.checkoutTime) return 0;
  const ms = new Date(row.checkoutTime).getTime() - new Date(row.checkinTime).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function checkinStatus(row: AttendanceRow | null): "on_time" | "late" | null {
  if (!row?.checkinTime) return null;
  const { hour, minute } = istHourMinute(row.checkinTime);
  return hour * 60 + minute <= CHECKIN_CUTOFF_MINUTE ? "on_time" : "late";
}

export type DayType =
  | "week_off"
  | "leave"
  | "holiday"
  | "left_job"
  | "half_day"
  | "absent"
  | "not_checked_in"
  | "checked_in"
  | "on_time"
  | "late"
  | "missing_checkout";

export function classifyDay(
  row: AttendanceRow | null,
  opts: { isWeekOff: boolean; onLeave: boolean; date: string; today: string }
): { type: DayType; label: string } {
  if (row?.dayType === "week_off") return { type: "week_off", label: "Week Off" };
  if (row?.dayType === "holiday") return { type: "holiday", label: "Holiday" };
  if (row?.dayType === "left_job") return { type: "left_job", label: "Left Job" };
  if (row?.dayType === "half_day") return { type: "half_day", label: "Half Day" };
  if (row?.dayType === "present") return { type: "on_time", label: "Present" };
  if (opts.isWeekOff) return { type: "week_off", label: "Week Off" };
  if (opts.onLeave) return { type: "leave", label: "Leave" };

  if (!row || !row.checkinTime) {
    return opts.date === opts.today
      ? { type: "not_checked_in", label: "Not Checked In" }
      : { type: "absent", label: "Absent" };
  }
  if (!row.checkoutTime) {
    if (opts.date < opts.today) {
      return { type: "missing_checkout", label: "Missing Checkout" };
    }
    return { type: "checked_in", label: "Checked In" };
  }
  const status = checkinStatus(row);
  return status === "late"
    ? { type: "late", label: "Late" }
    : { type: "on_time", label: "On Time" };
}