import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import IncentiveLadderForm from "@/components/crm/IncentiveLadderForm";

export const metadata: Metadata = {
  title: { absolute: "Incentive Rates | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function IncentiveRatesSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  // Rates feed salary, so the same guard as Office Hours and Team Members.
  const isAdmin = user.role === "admin" || user.role === "sales_head";
  if (!isAdmin) redirect("/crm/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Incentive Rates</h1>
        <p className="mt-0.5 text-sm text-muted">
          What a Sales Manager and a Caller earn per confirmed booking, by how many
          they have landed that month. Rates are retroactive, so crossing a
          threshold revalues the whole month.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-white p-4">
        <IncentiveLadderForm />
      </div>
    </div>
  );
}
