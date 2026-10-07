import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { buildAttendanceReport } from "@/lib/crm/attendance-report";
import { formatIstClock } from "@/lib/crm/attendance";
import { currentMonthKey } from "@/lib/crm/incentives";
import { fileSlug, rupeeColumn, styleHeaderRow, xlsxDownload } from "@/lib/crm/excel";

export const dynamic = "force-dynamic";

/**
 * The month as a spreadsheet: one row per person per day with the actual
 * check-in and check-out times, plus a summary tab. Admins pull the whole team
 * in one file (userId=0 or omitted); everyone else only ever downloads their
 * own sheet - the same rows the report page shows them.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const month = (params.get("month") || currentMonthKey()).slice(0, 7);
  const userIdParam = params.get("userId");
  const userIsAdmin = isAdmin(user);

  const db = getDb();
  const wantAll = userIsAdmin && (!userIdParam || Number(userIdParam) === 0);
  const targets = wantAll
    ? db
        .select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.active, true))
        .all()
    : (() => {
        const id = userIdParam && userIsAdmin ? Number(userIdParam) : user.id;
        return db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.id, id))
          .all();
      })();

  if (targets.length === 0) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Patang Future Homes CRM";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Attendance");
  sheet.columns = [
    { header: "User", key: "user", width: 22 },
    { header: "Date", key: "date", width: 12 },
    { header: "Day", key: "day", width: 11 },
    { header: "Status", key: "status", width: 32 },
    { header: "Check In", key: "checkin", width: 13 },
    { header: "Check Out", key: "checkout", width: 13 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "User", key: "user", width: 22 },
    { header: "Present", key: "present", width: 10 },
    { header: "Half Days", key: "half", width: 11 },
    { header: "Late", key: "late", width: 8 },
    { header: "Absent", key: "absent", width: 9 },
    { header: "Leave", key: "leave", width: 9 },
    { header: "Week Offs", key: "weekoff", width: 11 },
    { header: "Holidays", key: "holidays", width: 10 },
    { header: "Incentive", key: "incentive", width: 14 },
  ];
  styleHeaderRow(summary.getRow(1));
  summary.views = [{ state: "frozen", ySplit: 1 }];
  rupeeColumn(summary.getColumn("incentive"));

  let exported = 0;
  for (const target of targets) {
    const report = buildAttendanceReport(target.id, month);
    if (!report) continue;
    exported++;

    for (const day of report.dayDetails) {
      sheet.addRow({
        user: report.user.name,
        date: day.date,
        day: day.dayName,
        status: day.label,
        checkin: formatIstClock(day.checkinTime) || "-",
        checkout: formatIstClock(day.checkoutTime) || "-",
      });
    }

    const s = report.summary;
    summary.addRow({
      user: report.user.name,
      present: s.daysPresent,
      half: s.halfDays,
      late: s.daysLate,
      absent: s.daysAbsent,
      leave: s.leaveDaysDeductible,
      weekoff: s.weekOffsTaken,
      holidays: s.holidaysInMonth,
      incentive: s.incentiveEarned,
    });
  }

  if (exported === 0) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const who =
    targets.length === 1 ? fileSlug(targets[0].name) : "all-users";
  return xlsxDownload(`attendance-${month}-${who}.xlsx`, workbook);
}
