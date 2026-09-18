import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, and, desc } from "drizzle-orm";
import AttendancePanel from "@/components/crm/AttendancePanel";
import {
  istToday,
  OFFICE_LOCATION,
  getWeekOffDay,
  isWeekOffDate,
  getApprovedLeaveDaysForUser,
  checkinStatus,
  classifyDay,
  formatIstClock,
  formatDuration,
  workingMinutes,
  type AttendanceRow,
} from "@/lib/crm/attendance";

export const metadata: Metadata = {
  title: { absolute: "Attendance | Patang CRM" },
  robots: { index: false, follow: false },
};

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const now = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function classifyEntry(
  date: string,
  r: AttendanceRow | null,
  opts: { isWeekOff: boolean; onLeave: boolean; today: string }
) {
  const day = new Date(`${date}T12:00:00+05:30`).getDay();
  const result = classifyDay(r, { ...opts, date });
  return {
    date,
    day: DAY_ABBR[day],
    in: formatIstClock(r?.checkinTime ?? null),
    out: formatIstClock(r?.checkoutTime ?? null),
    type: result.type,
    label: result.label,
  };
}

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const db = getDb();
  const today = istToday();
  const dbUser = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
  const weekOffDay = getWeekOffDay(dbUser ? { weekOffDay: dbUser.weekOffDay } : {});

  const row = db
    .select()
    .from(schema.attendance)
    .where(and(eq(schema.attendance.userId, user.id), eq(schema.attendance.date, today)))
    .get() as unknown as AttendanceRow | null;

  const approvedLeave = getApprovedLeaveDaysForUser(user.id);
  const isAdmin = user.role === "admin" || user.role === "sales_head";

  const teamView = isAdmin
    ? db
        .select()
        .from(schema.attendance)
        .where(eq(schema.attendance.date, today))
        .all()
        .map((r) => {
          const u = db.select().from(schema.users).where(eq(schema.users.id, r.userId)).get();
          return {
            userId: r.userId,
            name: u?.name || "Unknown",
            role: u?.role,
            mode: r.mode,
            fieldDutyReason: r.fieldDutyReason,
            checkinTime: formatIstClock(r.checkinTime),
            checkoutTime: formatIstClock(r.checkoutTime),
            status: checkinStatus(r as unknown as AttendanceRow),
            working: formatDuration(workingMinutes(r as unknown as AttendanceRow)),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const dayRow = (date: string) =>
    db
      .select()
      .from(schema.attendance)
      .where(and(eq(schema.attendance.userId, user.id), eq(schema.attendance.date, date)))
      .get() as unknown as AttendanceRow | null;

  const history = lastNDates(14).map((date) =>
    classifyEntry(date, dayRow(date), { isWeekOff: isWeekOffDate(date, weekOffDay), onLeave: approvedLeave.has(date), today })
  );

  const week = lastNDates(7).map((date) =>
    classifyEntry(date, dayRow(date), { isWeekOff: isWeekOffDate(date, weekOffDay), onLeave: approvedLeave.has(date), today })
  );

  const leaveDaysThisMonth = (() => {
    const [y, m] = today.split("-").map(Number);
    const totalDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let count = 0;
    for (let d = 1; d <= totalDays; d++) {
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (approvedLeave.has(key)) count += 1;
    }
    return count;
  })();

  const myLeaves = db
    .select()
    .from(schema.leaveRequests)
    .where(eq(schema.leaveRequests.userId, user.id))
    .orderBy(desc(schema.leaveRequests.createdAt))
    .limit(10)
    .all()
    .map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.reason,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
    }));

  const pendingLeaves = isAdmin
    ? db
        .select()
        .from(schema.leaveRequests)
        .where(eq(schema.leaveRequests.status, "pending"))
        .orderBy(desc(schema.leaveRequests.createdAt))
        .all()
        .map((lr) => {
          const u = db.select().from(schema.users).where(eq(schema.users.id, lr.userId)).get();
          return { ...lr, userName: u?.name || "Unknown", userRole: u?.role };
        })
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Attendance</h1>
        <p className="mt-0.5 text-sm text-muted">
          Daily check-in/check-out (office geofence), office location: {OFFICE_LOCATION.lat.toFixed(4)},{" "}
          {OFFICE_LOCATION.lng.toFixed(4)} within 100m.
        </p>
      </div>

      <AttendancePanel
        data={{
          today,
          weekOffDay,
          row: row
            ? {
                ...row,
                checkinTimeLabel: formatIstClock(row.checkinTime),
                checkoutTimeLabel: formatIstClock(row.checkoutTime),
                statusLabel: checkinStatus(row) === "late" ? "Late" : "On Time",
                workingLabel: formatDuration(workingMinutes(row)),
                distanceM: row.checkinDistanceM,
              }
            : null,
          onLeave: approvedLeave.has(today),
          isWeekOff: isWeekOffDate(today, weekOffDay),
          history,
          week,
          leaveDaysThisMonth,
          myLeaves,
          pendingLeaves,
          teamView,
        }}
      />
    </div>
  );
}