import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./schema";
import { computeSalaryReport } from "./salary";
import { getSetting, updateSetting } from "./settings";
import { writeAuditLog } from "./audit";
import { istToday } from "./attendance";

/**
 * Salary drafts used to exist only when an admin remembered to press Generate.
 * Now the month that just closed drafts itself the first time anyone opens the
 * CRM afterwards - as a *pending* row, never a paid one - so nobody is
 * scrambling on payday. The guard key holds the last month this ran for, which
 * makes the whole sweep a single settings read on every call after the first.
 */
const GUARD_KEY = "salary_drafts_last_month";

/** The month before `todayKey`, as a `YYYY-MM` key. */
export function previousMonthKey(todayKey: string = istToday()): string {
  const [y, m] = todayKey.split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Who gets an automatic draft: active salaried staff (base salary on record)
 * and the marketing team, whose pay is pure commission and therefore always
 * worth drafting. Admins and sales heads are managed by hand and stay out.
 */
function isEligible(user: {
  active: boolean;
  role: string;
  baseSalary: number | null;
}): boolean {
  if (!user.active) return false;
  if (user.role === "admin" || user.role === "sales_head") return false;
  return user.role === "marketing" || (user.baseSalary || 0) > 0;
}

/**
 * Generate pending drafts for the previous month. Safe to call from anywhere -
 * it is guarded, idempotent per user, and swallows its own errors so a salary
 * housekeeping job can never break page rendering. Returns drafts created.
 */
export async function ensureMonthlySalaryDrafts(): Promise<number> {
  try {
    const targetMonth = previousMonthKey();
    if (getSetting(GUARD_KEY) === targetMonth) return 0;

    const db = getDb();
    const users = db.select().from(schema.users).all();

    let created = 0;
    for (const user of users) {
      if (!isEligible(user)) continue;

      const existing = db
        .select({ id: schema.salaryReports.id })
        .from(schema.salaryReports)
        .where(
          and(
            eq(schema.salaryReports.userId, user.id),
            eq(schema.salaryReports.month, targetMonth)
          )
        )
        .get();
      if (existing) continue;

      const computed = await computeSalaryReport(user.id, targetMonth);
      if (!computed) continue;

      // Derived display figures - no column of their own, see computeSalaryReport.
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
          generatedBy: null,
          createdAt: new Date().toISOString(),
        })
        .returning({ id: schema.salaryReports.id })
        .get();

      writeAuditLog({
        category: "incentive",
        action: "salary_report_auto_generated",
        actorUserId: null,
        targetUserId: user.id,
        entityType: "salary_report",
        entityId: inserted?.id,
        summary: `Auto-drafted ${targetMonth} salary for ${user.name}: ₹${computed.netPaid.toLocaleString("en-IN")} net (pending confirmation).`,
        details: { month: targetMonth, netPaid: computed.netPaid, source: "auto" },
      });
      created++;
    }

    updateSetting(GUARD_KEY, targetMonth);
    return created;
  } catch (error) {
    console.error("Salary draft sweep failed:", error);
    return 0;
  }
}
