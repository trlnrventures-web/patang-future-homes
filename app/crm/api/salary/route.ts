import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, and, desc, gte, lte, isNotNull } from "drizzle-orm";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { writeAuditLog } from "@/lib/crm/audit";
import { computeSalaryReport } from "@/lib/crm/salary";
import { ensureMonthlySalaryDrafts } from "@/lib/crm/salary-sweep";
import { currentMonthKey } from "@/lib/crm/incentives";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const userIsAdmin = isAdmin(user);
  const monthParam = request.nextUrl.searchParams.get("month");
  const yearParam = request.nextUrl.searchParams.get("year");
  const userIdParam = request.nextUrl.searchParams.get("userId");

  // Cheap, guarded: drafts the new month owes us appear before this list is
  // read, so the admin never opens Salary Reports to find last month missing.
  await ensureMonthlySalaryDrafts();

  if (monthParam) {
    const month = monthParam.slice(0, 7);
    const targetUserId = userIdParam && userIsAdmin ? Number(userIdParam) : user.id;

    const existing = db
      .select()
      .from(schema.salaryReports)
      .where(and(eq(schema.salaryReports.userId, targetUserId), eq(schema.salaryReports.month, month)))
      .get();

    if (existing) {
      // A month the admin has not released yet is invisible to the employee.
      if (!userIsAdmin && !existing.releasedAt) {
        return NextResponse.json({ report: null, computed: null, released: false });
      }
      return NextResponse.json({
        report: existing,
        computed: null,
        released: Boolean(existing.releasedAt),
      });
    }

    // `computed` is a live mid-month figure that will still change, so staff
    // never see it. They get the snapshot once the month is released.
    if (!userIsAdmin) {
      return NextResponse.json({ report: null, computed: null, released: false });
    }

    const computed = await computeSalaryReport(targetUserId, month);
    return NextResponse.json({ report: null, computed, released: false });
  }

  const conditions = userIsAdmin ? [] : [eq(schema.salaryReports.userId, user.id)];

  // Non-admins only ever see released months.
  if (!userIsAdmin) {
    conditions.push(isNotNull(schema.salaryReports.releasedAt));
  }

  // Admins can narrow the year list to one person from the user dropdown;
  // userId=0 (or no value) means everyone.
  if (userIsAdmin && userIdParam && Number(userIdParam) > 0) {
    conditions.push(eq(schema.salaryReports.userId, Number(userIdParam)));
  }

  if (yearParam) {
    const y = Number(yearParam);
    if (Number.isFinite(y)) {
      conditions.push(gte(schema.salaryReports.month, `${y}-01`));
      conditions.push(lte(schema.salaryReports.month, `${y}-12`));
    }
  }

  const reports = db
    .select()
    .from(schema.salaryReports)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.salaryReports.month))
    .all();

  return NextResponse.json({ reports });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const month = (body.month || currentMonthKey()).slice(0, 7);
    const targetUserId = Number(body.userId) || user.id;

    const db = getDb();

    const existing = db
      .select()
      .from(schema.salaryReports)
      .where(and(eq(schema.salaryReports.userId, targetUserId), eq(schema.salaryReports.month, month)))
      .get();

    if (existing) {
      return NextResponse.json({ error: "Salary report already exists for this month. Use PATCH to update payment status." }, { status: 409 });
    }

    const computed = await computeSalaryReport(targetUserId, month);
    if (!computed) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Derived display values with no matching column, so keep them out of the
    // persisted row: effectiveDaysPresent/personalHolidays/leftJobDays and the
    // hours-shortage figures, which live inside `deductions` instead.
    const {
      effectiveDaysPresent,
      personalHolidays,
      leftJobDays,
      hoursDeduction,
      shortageDays,
      ...persistable
    } = computed;
    void effectiveDaysPresent;
    void personalHolidays;
    void leftJobDays;
    void hoursDeduction;
    void shortageDays;

    const inserted = db
      .insert(schema.salaryReports)
      .values({
        ...persistable,
        generatedBy: user.id,
        createdAt: new Date().toISOString(),
      })
      .returning({ id: schema.salaryReports.id })
      .get();

    const targetName = db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).get()?.name || "Unknown";

    writeAuditLog({
      category: "incentive",
      action: "salary_report_generated",
      actorUserId: user.id,
      targetUserId,
      entityType: "salary_report",
      entityId: inserted?.id,
      summary: `Generated ${month} salary report for ${targetName}: ₹${computed.netPaid.toLocaleString("en-IN")} net paid.`,
      details: computed,
    });

    return NextResponse.json({ ok: true, id: inserted?.id, report: computed });
  } catch (error) {
    console.error("Salary POST error:", error);
    return NextResponse.json({ error: "Failed to generate salary report" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!id) {
      return NextResponse.json({ error: "Report id is required" }, { status: 400 });
    }

    const db = getDb();
    const report = db.select().from(schema.salaryReports).where(eq(schema.salaryReports.id, id)).get();
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (body.paymentStatus === "paid" || body.paymentStatus === "pending") {
      updates.paymentStatus = body.paymentStatus;
    }
    if (body.paymentDate !== undefined) {
      updates.paymentDate = body.paymentDate || null;
    }
    if (body.paymentStatus === "paid" && !report.paymentDate) {
      updates.paymentDate = new Date().toISOString().slice(0, 10);
    }
    // Releasing is what makes the month visible to the employee. Re-releasing
    // an already released month keeps the original released_at so the history
    // of who published it, and when, stays intact.
    if (body.action === "release") {
      updates.releasedAt = report.releasedAt || new Date().toISOString();
      updates.releasedBy = user.id;
    } else if (body.action === "unrelease") {
      updates.releasedAt = null;
      updates.releasedBy = null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
    }

    db.update(schema.salaryReports)
      .set(updates)
      .where(eq(schema.salaryReports.id, id))
      .run();

    if (body.action === "release" || body.action === "unrelease") {
      const targetName =
        db.select().from(schema.users).where(eq(schema.users.id, report.userId)).get()?.name || "Unknown";
      const released = body.action === "release";
      writeAuditLog({
        category: "incentive",
        action: released ? "salary_report_released" : "salary_report_unreleased",
        actorUserId: user.id,
        targetUserId: report.userId,
        entityType: "salary_report",
        entityId: id,
        summary: released
          ? `Released ${report.month} salary report for ${targetName} (₹${report.netPaid.toLocaleString("en-IN")} net, incentive ₹${report.incentiveEarned.toLocaleString("en-IN")}).`
          : `Withdrew release of ${report.month} salary report for ${targetName}.`,
        details: { month: report.month, action: body.action },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Salary PATCH error:", error);
    return NextResponse.json({ error: "Failed to update salary report" }, { status: 500 });
  }
}
