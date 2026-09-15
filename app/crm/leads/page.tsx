import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/crm/data";
import { redirect } from "next/navigation";
import LeadsPageContent from "@/components/crm/LeadsPageContent";

export const metadata: Metadata = {
  title: { absolute: "Leads | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function LeadsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  return <LeadsPageContent role={user.role} />;
}