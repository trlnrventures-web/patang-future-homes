import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import SalaryReport from "@/components/crm/SalaryReport";

export const metadata: Metadata = {
  title: { absolute: "Salary Reports | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function SalaryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; userId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const params = await searchParams;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Salary Reports</h1>
        <p className="mt-0.5 text-sm text-muted">
          {user.role === "admin" || user.role === "sales_head"
            ? "Monthly salary records for the full team."
            : "Your monthly salary records."}
        </p>
      </div>
      <SalaryReport
        currentUserId={user.id}
        isAdmin={user.role === "admin" || user.role === "sales_head"}
        initialMonth={params.month}
        initialUserId={params.userId}
      />
    </div>
  );
}
