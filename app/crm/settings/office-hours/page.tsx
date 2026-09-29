import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import OfficeHoursForm from "@/components/crm/OfficeHoursForm";

export const metadata: Metadata = {
  title: { absolute: "Office Hours | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function OfficeHoursSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  // Masking is a data-protection switch, so the same guard as Team Members.
  const isAdmin = user.role === "admin" || user.role === "sales_head";
  if (!isAdmin) redirect("/crm/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Office Hours</h1>
        <p className="mt-0.5 text-sm text-muted">
          When staff may see and use lead contact details. Outside these hours the
          Caller and Sales Manager roles see masked numbers, and Call and WhatsApp
          are disabled.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-white p-4">
        <OfficeHoursForm />
      </div>
    </div>
  );
}
