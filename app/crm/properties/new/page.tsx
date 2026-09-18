import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import PropertyForm from "@/components/crm/PropertyForm";

export const metadata: Metadata = {
  title: { absolute: "Add Property | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function NewPropertyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");
  if (user.role !== "admin" && user.role !== "sales_head") redirect("/crm/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Add Property</h1>
        <p className="mt-0.5 text-sm text-muted">Create a new project to show on the website.</p>
      </div>
      <PropertyForm mode="new" />
    </div>
  );
}