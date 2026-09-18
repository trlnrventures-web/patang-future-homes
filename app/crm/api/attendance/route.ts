import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import {
  istToday,
  istNowIso,
  OFFICE_LOCATION,
  GEOFENCE_RADIUS_M,
  haversineDistanceM,
  validateLatLng,
  getWeekOffDay,
  isWeekOffDate,
  getApprovedLeaveDaysForUser,
  getPendingLeaveCount,
  checkinStatus,
  classifyDay,
  formatIstClock,
  workingMinutes,
  formatDuration,
  type AttendanceRow,
} from "@/lib/crm/attendance";

export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const today = istToday();

  const dbUser = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
  const weekOffDay = getWeekOffDay(dbUser ? { weekOffDay: dbUser.weekOffDay } : {});

  const mode = request.nextUrl.searchParams.get("mode") || "self";
  const isAdminView = mode === "team" && (user.role === "admin" || user.role === "sales_head");

  const teamView = isAdminView
    ? db
        .select()
        .from(schema.attendance)
        .where(eq(schema.attendance.date, today))
        .all()
        .map((r) => {
          const u = db.select().from(schema.users).where(eq(schema.users.id, r.userId)).get();
          const status = checkinStatus(r as unknown as AttendanceRow);
          return {
            userId: r.userId,
            name: u?.name || "Unknown",
            role: u?.role || "",
            mode: r.mode,
            fieldDutyReason: r.fieldDutyReason,
            checkinTime: formatIstClock(r.checkinTime),
            checkoutTime: formatIstClock(r.checkoutTime),
            status,
            working: formatDuration(workingMinutes(r as unknown as AttendanceRow)),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const row = db
    .select()
    .from(schema.attendance)
    .where(and(eq(schema.attendance.userId, user.id), eq(schema.attendance.date, today)))
    .get() as unknown as AttendanceRow | null;

  const approvedLeave = getApprovedLeaveDaysForUser(user.id);
  const pendingLeaveCount = getPendingLeaveCount(user.id);

  const history = lastNDates(14).map((date) => {
    const r = db
      .select()
      .from(schema.attendance)
      .where(and(eq(schema.attendance.userId, user.id), eq(schema.attendance.date, date)))
      .get() as unknown as AttendanceRow | null;
    const day = new Date(`${date}T12:00:00+05:30`).getDay();
    const isLeave = approvedLeave.has(date);
    const result = classifyDay(r, {
      isWeekOff: isWeekOffDate(date, weekOffDay),
      onLeave: isLeave,
      date,
      today,
    });
    return {
      date,
      day: DAY_ABBR[day],
      in: formatIstClock(r?.checkinTime ?? null),
      out: formatIstClock(r?.checkoutTime ?? null),
      type: result.type,
      label: result.label,
    };
  });

  let myLeaves = db
    .select()
    .from(schema.leaveRequests)
    .where(eq(schema.leaveRequests.userId, user.id))
    .orderBy(desc(schema.leaveRequests.createdAt))
    .limit(10)
    .all();

  let pendingLeaves: any[] = [];
  if (user.role === "admin" || user.role === "sales_head") {
    pendingLeaves = db
      .select()
      .from(schema.leaveRequests)
      .where(eq(schema.leaveRequests.status, "pending"))
      .orderBy(desc(schema.leaveRequests.createdAt))
      .all()
      .map((lr) => {
        const u = db.select().from(schema.users).where(eq(schema.users.id, lr.userId)).get();
        return { ...lr, userName: u?.name || "Unknown", userRole: u?.role || "" };
      });
  }

  myLeaves = myLeaves.map((r) => ({ ...r, pendingCount: pendingLeaveCount })) as any;

  return NextResponse.json({
    today,
    weekOffDay,
    officeLocation: OFFICE_LOCATION,
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
    myLeaves: myLeaves.map((r: any) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.reason,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
    })),
    pendingLeaves,
    teamView,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const action = body.action as "checkin" | "checkout";
    if (action !== "checkin" && action !== "checkout") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const today = istToday();
    const db = getDb();
    const row = db
      .select()
      .from(schema.attendance)
      .where(and(eq(schema.attendance.userId, user.id), eq(schema.attendance.date, today)))
      .get() as unknown as AttendanceRow | null;

    if (action === "checkin") {
      if (row?.checkinTime) {
        return NextResponse.json({ error: "You have already checked in today" }, { status: 400 });
      }

      const mode = body.mode === "field_duty" ? "field_duty" : "office";
      const fieldDutyReason = mode === "field_duty" ? String(body.fieldDutyReason || "").slice(0, 200) : null;
      if (mode === "field_duty" && !fieldDutyReason) {
        return NextResponse.json({ error: "Please provide a reason for field duty" }, { status: 400 });
      }

      const loc = validateLatLng(body.lat, body.lng);
      let distance: number | null = null;
      if (loc) {
        distance = haversineDistanceM(loc.lat, loc.lng, OFFICE_LOCATION.lat, OFFICE_LOCATION.lng);
        if (mode === "office" && distance > GEOFENCE_RADIUS_M) {
          return NextResponse.json(
            { error: `You are not near the office (${Math.round(distance)}m away). Select field duty mode if you are working from the field.` },
            { status: 400 }
          );
        }
      }

      db.insert(schema.attendance)
        .values({
          userId: user.id,
          date: today,
          mode,
          fieldDutyReason,
          checkinTime: istNowIso(),
          checkinLat: loc?.lat != null ? String(loc.lat) : null,
          checkinLng: loc?.lng != null ? String(loc.lng) : null,
          checkinDistanceM: distance,
          createdAt: istNowIso(),
        })
        .run();

      const fresh = db
        .select()
        .from(schema.attendance)
        .where(and(eq(schema.attendance.userId, user.id), eq(schema.attendance.date, today)))
        .get();

      return NextResponse.json({
        ok: true,
        row: fresh
          ? {
              ...fresh,
              checkinTimeLabel: formatIstClock(fresh.checkinTime),
              statusLabel: checkinStatus(fresh as unknown as AttendanceRow) === "late" ? "Late" : "On Time",
              distanceM: distance,
            }
          : null,
      });
    }

    if (!row?.checkinTime) {
      return NextResponse.json({ error: "Please check in first" }, { status: 400 });
    }
    if (row.checkoutTime) {
      return NextResponse.json({ error: "You have already checked out today" }, { status: 400 });
    }

    const loc = validateLatLng(body.lat, body.lng);
    let distance: number | null = null;
    if (loc) {
      distance = haversineDistanceM(loc.lat, loc.lng, OFFICE_LOCATION.lat, OFFICE_LOCATION.lng);
    }

    db.update(schema.attendance)
      .set({
        checkoutTime: istNowIso(),
        checkoutLat: loc?.lat != null ? String(loc.lat) : null,
        checkoutLng: loc?.lng != null ? String(loc.lng) : null,
        checkoutDistanceM: distance,
      })
      .where(eq(schema.attendance.id, row.id))
      .run();

    const fresh = db.select().from(schema.attendance).where(eq(schema.attendance.id, row.id)).get();
    return NextResponse.json({
      ok: true,
      row: fresh
        ? {
            ...fresh,
            checkoutTimeLabel: formatIstClock(fresh.checkoutTime),
            workingLabel: formatDuration(workingMinutes(fresh as unknown as AttendanceRow)),
          }
        : null,
    });
  } catch (error) {
    console.error("Attendance POST error:", error);
    return NextResponse.json({ error: "Failed to save attendance" }, { status: 500 });
  }
}