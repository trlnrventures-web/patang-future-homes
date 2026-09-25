import { and, gte, lte, eq } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./schema";
import {
  DEFAULT_WEEK_OFF_DAY,
  checkinStatus,
  formatDuration,
  formatIstClock,
  workingMinutes,
  type AttendanceRow,
} from "./attendance";
import { queryAuditLog } from "./audit";

export type AttendanceAuditEventType =
  | "checkin"
  | "checkout"
  | "week_off_credit"
  | "week_off_used"
  | "week_off_adjusted"
  | "week_off_expired"
  | "holiday_added"
  | "holiday_removed";

export type AttendanceAuditTone = "green" | "red" | "amber" | "gray" | "blue";

export type AttendanceAuditEvent = {
  key: string;
  at: string;
  date: string;
  type: AttendanceAuditEventType;
  userId: number | null;
  userName: string;
  title: string;
  detail: string;
  timeLabel: string;
  tone: AttendanceAuditTone;
};

export type AuditUserOption = {
  id: number;
  name: string;
  role: string;
  weekOffDay: string;
};

const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000).toISOString().slice(0, 10);
}

function mondayOf(dateKey: string): string {
  const idx = new Date(`${dateKey}T12:00:00+05:30`).getUTCDay();
  const diff = (idx + 6) % 7;
  return addDays(dateKey, -diff);
}

function istIso(dateKey: string, time = "12:00:00"): string {
  return new Date(`${dateKey}T${time}+05:30`).toISOString();
}

export function auditUsers(): AuditUserOption[] {
  const db = getDb();
  return db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, weekOffDay: schema.users.weekOffDay })
    .from(schema.users)
    .all()
    .map((u) => ({ id: u.id, name: u.name, role: u.role, weekOffDay: u.weekOffDay || DEFAULT_WEEK_OFF_DAY }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function activeHolidays(): { id: number; date: string; name: string; createdAt: string }[] {
  const db = getDb();
  return db
    .select()
    .from(schema.companyHolidays)
    .where(eq(schema.companyHolidays.active, true))
    .all()
    .map((h) => ({ id: h.id, date: h.date, name: h.name, createdAt: h.createdAt }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildAttendanceAudit(filters: {
  userId?: number;
  from: string;
  to: string;
  types?: Set<AttendanceAuditEventType>;
}): AttendanceAuditEvent[] {
  const db = getDb();
  const { from, to } = filters;
  const wants = (t: AttendanceAuditEventType) => !filters.types || filters.types.has(t);
  const events: AttendanceAuditEvent[] = [];

  const users = auditUsers().filter((u) => !filters.userId || u.id === filters.userId);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  if (wants("checkin") || wants("checkout")) {
    const rows = db
      .select()
      .from(schema.attendance)
      .where(and(gte(schema.attendance.date, from), lte(schema.attendance.date, to)))
      .all() as unknown as AttendanceRow[];

    for (const r of rows) {
      if (filters.userId && r.userId !== filters.userId) continue;
      const userName = nameOf.get(r.userId) || `User #${r.userId}`;
      const modeLabel = r.mode === "field_duty" ? "Field duty" : "Office";

      if (wants("checkin") && r.checkinTime) {
        const late = checkinStatus(r) === "late";
        const dist = r.checkinDistanceM != null ? ` · ${r.checkinDistanceM}m from office` : "";
        events.push({
          key: `in-${r.id}`,
          at: new Date(r.checkinTime).toISOString(),
          date: r.date,
          type: "checkin",
          userId: r.userId,
          userName,
          title: `Checked in${late ? " (late)" : ""}`,
          detail: `${modeLabel}${r.fieldDutyReason ? ` — ${r.fieldDutyReason}` : ""}${dist}`,
          timeLabel: formatIstClock(r.checkinTime),
          tone: late ? "amber" : "green",
        });
      }

      if (wants("checkout") && r.checkoutTime) {
        const worked = formatDuration(workingMinutes(r));
        events.push({
          key: `out-${r.id}`,
          at: new Date(r.checkoutTime).toISOString(),
          date: r.date,
          type: "checkout",
          userId: r.userId,
          userName,
          title: "Checked out",
          detail: `Worked ${worked}${r.checkoutDistanceM != null ? ` · ${r.checkoutDistanceM}m from office` : ""}`,
          timeLabel: formatIstClock(r.checkoutTime),
          tone: "blue",
        });
      }
    }
  }

  const wantsWeekOff =
    wants("week_off_credit") ||
    wants("week_off_used") ||
    wants("week_off_adjusted") ||
    wants("week_off_expired");

  if (wantsWeekOff && users.length > 0) {
    const leaveByUser = new Map<number, Set<string>>();
    for (const u of users) {
      const set = new Set<string>();
      const rows = db
        .select()
        .from(schema.leaveRequests)
        .where(and(eq(schema.leaveRequests.userId, u.id), eq(schema.leaveRequests.status, "approved")))
        .all();
      for (const r of rows) {
        const start = new Date(`${r.startDate}T00:00:00+05:30`).getTime();
        const end = new Date(`${r.endDate}T00:00:00+05:30`).getTime();
        for (let ms = start; ms <= end; ms += 86400000) {
          const key = new Date(ms + (5 * 60 + 30) * 60 * 1000).toISOString().slice(0, 10);
          set.add(key);
        }
      }
      leaveByUser.set(u.id, set);
    }

    const attendanceInRange = db
      .select({
        userId: schema.attendance.userId,
        date: schema.attendance.date,
        checkinTime: schema.attendance.checkinTime,
        dayType: schema.attendance.dayType,
      })
      .from(schema.attendance)
      .where(and(gte(schema.attendance.date, from), lte(schema.attendance.date, to)))
      .all();
    const checkinKeys = new Set(
      attendanceInRange
        .filter((r) => r.checkinTime || r.dayType === "present")
        .map((r) => `${r.userId}:${r.date}`)
    );

    const today = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000).toISOString().slice(0, 10);
    const firstMonday = mondayOf(from);
    const lastMonday = mondayOf(to);

    for (const u of users) {
      const leaveDays = leaveByUser.get(u.id) || new Set<string>();
      for (let monday = firstMonday; monday <= lastMonday; monday = addDays(monday, 7)) {
        const offset = ((DAY_INDEX[u.weekOffDay] ?? 2) + 6) % 7;
        const scheduled = addDays(monday, offset);
        if (scheduled > today) continue;

        const inRange = (d: string) => d >= from && d <= to;

        if (wants("week_off_credit") && inRange(monday)) {
          events.push({
            key: `woc-${u.id}-${monday}`,
            at: istIso(monday, "00:00:00"),
            date: monday,
            type: "week_off_credit",
            userId: u.id,
            userName: u.name,
            title: "Week-off credited (+1)",
            detail: `Weekly week-off for week of ${monday} · scheduled ${u.weekOffDay} (${scheduled})`,
            timeLabel: "",
            tone: "gray",
          });
        }

        const adjustedDay = Array.from(leaveDays).find((d) => {
          if (d === scheduled) return false;
          return d >= monday && d <= addDays(monday, 6);
        });

        if (adjustedDay) {
          if (wants("week_off_adjusted") && inRange(adjustedDay)) {
            events.push({
              key: `woa-${u.id}-${adjustedDay}`,
              at: istIso(adjustedDay),
              date: adjustedDay,
              type: "week_off_adjusted",
              userId: u.id,
              userName: u.name,
              title: "Week-off adjusted",
              detail: `Taken ${adjustedDay} instead of scheduled ${u.weekOffDay} (${scheduled})`,
              timeLabel: "",
              tone: "blue",
            });
          }
        } else if (checkinKeys.has(`${u.id}:${scheduled}`)) {
          if (wants("week_off_expired") && inRange(scheduled)) {
            events.push({
              key: `woe-${u.id}-${scheduled}`,
              at: istIso(scheduled),
              date: scheduled,
              type: "week_off_expired",
              userId: u.id,
              userName: u.name,
              title: "Week-off lapsed",
              detail: `Worked on scheduled week-off ${u.weekOffDay} (${scheduled}) — entitlement expired for the week`,
              timeLabel: "",
              tone: "red",
            });
          }
        } else {
          if (wants("week_off_used") && inRange(scheduled)) {
            events.push({
              key: `wou-${u.id}-${scheduled}`,
              at: istIso(scheduled),
              date: scheduled,
              type: "week_off_used",
              userId: u.id,
              userName: u.name,
              title: "Week-off availed",
              detail: `Scheduled ${u.weekOffDay} week-off taken`,
              timeLabel: "",
              tone: "green",
            });
          }
        }
      }
    }
  }

  if (wants("holiday_added") || wants("holiday_removed")) {
    const holidayFromIso = istIso(from, "00:00:00");
    const holidayToIso = istIso(to, "23:59:59");
    const audit = queryAuditLog({ categories: ["holiday"], from: holidayFromIso, to: holidayToIso, limit: 500 });
    for (const a of audit) {
      const type = a.action === "holiday_removed" ? "holiday_removed" : "holiday_added";
      if (!wants(type)) continue;
      events.push({
        key: `hol-${a.id}`,
        at: new Date(a.createdAt).toISOString(),
        date: new Date(a.createdAt).toISOString().slice(0, 10),
        type,
        userId: a.actorUserId,
        userName: a.actorName || "System",
        title: type === "holiday_removed" ? "Holiday removed" : "Holiday added",
        detail: a.summary,
        timeLabel: "",
        tone: type === "holiday_removed" ? "red" : "green",
      });
    }
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.key.localeCompare(b.key)));
}

export const AUDIT_TYPE_LABELS: Record<AttendanceAuditEventType, string> = {
  checkin: "Check-in",
  checkout: "Check-out",
  week_off_credit: "Week-off credited",
  week_off_used: "Week-off availed",
  week_off_adjusted: "Week-off adjusted",
  week_off_expired: "Week-off lapsed",
  holiday_added: "Holiday added",
  holiday_removed: "Holiday removed",
};
