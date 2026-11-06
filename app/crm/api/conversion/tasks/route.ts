import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/crm/auth";
import { getDb } from "@/lib/crm/db";
import { reminderTasksFor, overdueReminderTasks, overdueOutcomeVisits } from "@/lib/crm/visit-flow";
import { nurtureTasksFor, flagNurtureForNewProjects } from "@/lib/crm/nurture";
import { unassignedLeads } from "@/lib/crm/routing";

export const dynamic = "force-dynamic";

/**
 * The conversion task feed behind the dashboard cards. Derived on request, so
 * reminders, overdue outcomes and routing queues need no cron worker.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "marketing") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  // Opportunistic scan: a newly published project can resurface dormant nurture leads.
  try { flagNurtureForNewProjects(db); } catch { /* non-fatal */ }
  const isAdmin = user.role === "admin" || user.role === "sales_head";

  const reminders = reminderTasksFor(db, user.id, user.role);
  const nurture = user.role === "caller" ? nurtureTasksFor(db, user.id) : { tasks: [], capped: false, total: 0 };

  const admin = isAdmin
    ? {
        overdueReminders: overdueReminderTasks(db),
        overdueOutcomes: overdueOutcomeVisits(db).map((v) => ({
          visitId: v.id,
          leadId: v.leadId,
          date: v.date,
          time: v.time,
        })),
        needsRouting: unassignedLeads(db).map((l) => ({
          leadId: l.id,
          name: l.name,
          grade: l.grade,
          status: l.status,
        })),
      }
    : null;

  return NextResponse.json({
    reminders,
    nurture,
    admin,
    serverNow: new Date().toISOString(),
  });
}
