import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import DataToolsPanel from "@/components/crm/DataToolsPanel";

export const metadata: Metadata = {
  title: { absolute: "Data Tools | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function DataToolsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const isAdmin = user.role === "admin" || user.role === "sales_head";
  if (!isAdmin) redirect("/crm/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Data Tools</h1>
        <p className="mt-0.5 text-sm text-muted">
          Recover archived leads. Deleting elsewhere in the CRM is always reversible from here.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-white p-4">
        <DataToolsPanel />
      </div>
    </div>
  );
}
