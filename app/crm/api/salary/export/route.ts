import { NextRequest } from "next/server";
import { and, desc, eq, isNotNull, lte, gte } from "drizzle-orm";
import ExcelJS from "exceljs";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { istToday } from "@/lib/crm/attendance";
import { fileSlug, rupeeColumn, styleHeaderRow, xlsxDownload } from "@/lib/crm/excel";

export const dynamic = "force-dynamic";

/** `pending` is what the row says; people read it as awaiting sign-off. */
function statusLabel(report: { paymentStatus: string }): string {
  return report.paymentStatus === "pending" ? "Pending Confirmation" : "Paid";
}

function reportYear(): number {
  return Number(istToday().slice(0, 4));
}

/**
 * The salary ledger as a spreadsheet - the exact rows the Salary Reports page
 * lists, for one year. Admins can export the whole team (userId=0 or omitted);
 * an employee's export is always limited to their own released months.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const userIsAdmin = isAdmin(user);
  const year = Number(params.get("year")) || reportYear();
  const userIdParam = params.get("userId");

  const db = getDb();
  const conditions = userIsAdmin ? [] : [eq(schema.salaryReports.userId, user.id)];

  if (!userIsAdmin) {
    conditions.push(isNotNull(schema.salaryReports.releasedAt));
  }

  if (userIsAdmin && userIdParam && Number(userIdParam) > 0) {
    conditions.push(eq(schema.salaryReports.userId, Number(userIdParam)));
  }

  conditions.push(gte(schema.salaryReports.month, `${year}-01`));
  conditions.push(lte(schema.salaryReports.month, `${year}-12`));

  const reports = db
    .select()
    .from(schema.salaryReports)
    .where(and(...conditions))
    .orderBy(desc(schema.salaryReports.month))
    .all();

  if (reports.length === 0) {
    return Response.json({ error: "No salary reports for this selection" }, { status: 404 });
  }

  const names = new Map(
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .all()
      .map((u) => [u.id, u.name])
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Patang Future Homes CRM";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Salary");
  sheet.columns = [
    { header: "Month", key: "month", width: 10 },
    { header: "User", key: "user", width: 22 },
    { header: "Base Salary", key: "base", width: 14 },
    { header: "Days Present", key: "present", width: 14 },
    { header: "Half Days", key: "half", width: 11 },
    { header: "Late", key: "late", width: 8 },
    { header: "Absent", key: "absent", width: 9 },
    { header: "Leave", key: "leave", width: 9 },
    { header: "Incentive", key: "incentive", width: 14 },
    { header: "Deductions", key: "deductions", width: 13 },
    { header: "Net Payable", key: "net", width: 14 },
    { header: "Status", key: "status", width: 21 },
    { header: "Payment Date", key: "paidOn", width: 14 },
    { header: "Released", key: "released", width: 14 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const key of ["base", "incentive", "deductions", "net"]) {
    rupeeColumn(sheet.getColumn(key));
  }

  let rows = 0;
  for (const report of reports) {
    sheet.addRow({
      month: report.month,
      user: names.get(report.userId) || `User #${report.userId}`,
      base: report.baseSalary,
      present: report.daysPresent,
      half: report.halfDays,
      late: report.daysLate,
      absent: report.daysAbsent,
      leave: report.leaveDaysDeductible,
      incentive: report.incentiveEarned,
      deductions: report.deductions,
      net: report.netPaid,
      status: statusLabel(report),
      paidOn: report.paymentDate || "-",
      released: report.releasedAt ? report.releasedAt.slice(0, 10) : "Not released",
    });
    rows++;
  }

  const total = reports.reduce((sum, r) => sum + r.netPaid, 0);
  const totalRow = sheet.addRow({
    month: "",
    user: `TOTAL (${rows} months)`,
    net: total,
    status: "",
  });
  totalRow.font = { bold: true };

  const who =
    userIsAdmin && userIdParam && Number(userIdParam) > 0
      ? fileSlug(names.get(Number(userIdParam)) || `user-${userIdParam}`)
      : userIsAdmin
        ? "all-users"
        : fileSlug(user.name);

  return xlsxDownload(`salary-${year}-${who}.xlsx`, workbook);
}
