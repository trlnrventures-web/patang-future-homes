import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import GeneralSettingsForm from "@/components/crm/GeneralSettingsForm";

export const metadata: Metadata = {
  title: { absolute: "Lead Rules | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function GeneralSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const isAdmin = user.role === "admin" || user.role === "sales_head";
  if (!isAdmin) redirect("/crm/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Lead Rules</h1>
        <p className="mt-0.5 text-sm text-muted">
          Timers, matching weights and the budget chips the team works with.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-white p-4">
        <GeneralSettingsForm />
      </div>
    </div>
  );
}
