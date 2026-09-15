import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import MarketingCenter from "@/components/crm/MarketingCenter";

const MARKETING_ROLES = ["admin", "sales_head", "marketing"];

export const metadata: Metadata = {
  title: { absolute: "Marketing | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function MarketingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");
  if (!MARKETING_ROLES.includes(user.role)) redirect("/crm/dashboard");

  return <MarketingCenter name={user.name} role={user.role} />;
}