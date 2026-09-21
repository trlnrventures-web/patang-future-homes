import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import TeamManager from "@/components/crm/TeamManager";

export const metadata: Metadata = {
  title: { absolute: "Team Members | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function TeamSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const isAdmin = user.role === "admin" || user.role === "sales_head";
  if (!isAdmin) redirect("/crm/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Team Members</h1>
        <p className="mt-0.5 text-sm text-muted">
          Manage team salaries, week-off days, and active status. Salary changes only affect future months.
        </p>
      </div>
      <TeamManager />
    </div>
  );
}
