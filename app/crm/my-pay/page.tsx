import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import MyPayPanel from "@/components/crm/MyPayPanel";

export const metadata: Metadata = {
  title: { absolute: "My Pay | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function MyPayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  // The only roles that get a pay record. Everyone else is redirected so the
  // page never renders as an empty shell for a user it was not built for.
  if (user.role !== "sales_manager" && user.role !== "caller") {
    redirect("/crm/dashboard");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">My Pay</h1>
        <p className="mt-0.5 text-sm text-muted">
          Your attendance, incentives and salary by month.
        </p>
      </div>
      <MyPayPanel name={user.name} />
    </div>
  );
}
