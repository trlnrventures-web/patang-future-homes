import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import SiteVisitsCalendar from "@/components/crm/SiteVisitsCalendar";

export const metadata: Metadata = {
  title: { absolute: "Site Visits | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function SiteVisitsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");
  if (user.role === "marketing") redirect("/crm/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Site Visits</h1>
        <p className="mt-0.5 text-sm text-muted">
          {user.role === "admin" || user.role === "sales_head"
            ? "All scheduled and completed site visits across the team."
            : user.role === "sales_manager"
              ? "Your site visits calendar."
              : "Site visits for the leads you own."}
        </p>
      </div>
      <SiteVisitsCalendar />
    </div>
  );
}
