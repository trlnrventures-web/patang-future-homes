import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import UserTemplates from "@/components/crm/TemplateManager";

export const metadata: Metadata = {
  title: { absolute: "Message Templates | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function TemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const isAdmin = user.role === "admin" || user.role === "sales_head";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Message Templates</h1>
        <p className="mt-0.5 text-sm text-muted">
          {isAdmin
            ? "Shared templates manage karein — sabhi ko dikhte hain."
            : "Aapke personal templates yahan manage hote hain."}
        </p>
      </div>
      <UserTemplates isAdmin={isAdmin} />
    </div>
  );
}

