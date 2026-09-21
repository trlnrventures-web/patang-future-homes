import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import AttendanceReport from "@/components/crm/AttendanceReport";

export const metadata: Metadata = {
  title: { absolute: "Attendance Report | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function AttendanceReportPage({
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
        <h1 className="text-xl font-bold text-primary">Attendance Report</h1>
        <p className="mt-0.5 text-sm text-muted">
          Monthly attendance breakdown with day-by-day details.
        </p>
      </div>
      <AttendanceReport
        currentUserId={user.id}
        isAdmin={user.role === "admin" || user.role === "sales_head"}
        initialMonth={params.month}
        initialUserId={params.userId}
      />
    </div>
  );
}
