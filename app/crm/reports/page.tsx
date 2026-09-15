import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import { isAdmin as isAdminRole } from "@/lib/crm/auth";
import { getDailyMetricsForEmployee, getTeamReport, istToday } from "@/lib/crm/reports";
import DailyReport from "@/components/crm/DailyReport";
import type { DailyMetrics, TeamReport } from "@/lib/crm/reports";

export const metadata: Metadata = {
  title: { absolute: "Daily Report | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const date = istToday();
  const my = {
    date,
    name: user.name,
    role: user.role,
    metrics: getDailyMetricsForEmployee({ id: user.id, name: user.name, role: user.role }, date),
  };

  const isAdmin = isAdminRole({ id: user.id, name: user.name, email: user.email, role: user.role });
  let team: TeamReport | null = null;
  if (isAdmin) team = getTeamReport(date);

  return (
    <DailyReport
      initialMy={my as { date: string; name: string; role: string; metrics: DailyMetrics }}
      initialTeam={team}
      isAdmin={isAdmin}
    />
  );
}