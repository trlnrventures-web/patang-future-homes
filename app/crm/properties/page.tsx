import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import { canManageProperties } from "@/lib/crm/auth";
import PropertiesManager from "@/components/crm/PropertiesManager";

export const metadata: Metadata = {
  title: { absolute: "Properties | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function PropertiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const canManage = canManageProperties(user);
  if (!canManage) redirect("/crm/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Properties</h1>
        <p className="mt-0.5 text-sm text-muted">
          Manage projects shown on the website. Archived properties are hidden from the public site and matching.
        </p>
      </div>
      <PropertiesManager />
    </div>
  );
}