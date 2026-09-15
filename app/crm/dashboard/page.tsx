import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getDashboardData } from "@/lib/crm/data";
import { getDailyMetricsForEmployee, istToday } from "@/lib/crm/reports";
import { Card, Badge } from "@/components/crm/ui";
import CallerDashboard from "@/components/crm/CallerDashboard";

export const metadata: Metadata = {
  title: { absolute: "Dashboard | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

const data = await getDashboardData(user);

  const isAdmin = user.role === "admin" || user.role === "sales_head";
  const isSm = user.role === "sales_manager";
  const isCaller = user.role === "caller";

  const smMetrics =
    isSm ? getDailyMetricsForEmployee({ id: user.id, name: user.name, role: user.role }, istToday()) : null;

return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-primary sm:text-2xl">
          Namaste, {user.name.split(" ")[0]} ji
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isCaller
            ? "Aaj ka command center — priority calls, follow-ups aur performance ek jagah."
            : isSm
              ? "Aaj ke visits, follow-ups aur hot leads yahan dikhte hain."
              : "Aaj ka sales performance ek nazar mein."}
        </p>
      </div>

      {/* Caller command center */}
      {isCaller && <CallerDashboard name={user.name} />}

      {/* Owner stats */}
      {isAdmin && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
<StatCard label="Today Leads" value={String(data.todayLeads)} accent />
          <StatCard label="Total Leads" value={String(data.totalLeads)} />
          <StatCard label="Qualified" value={String(data.qualified)} />
          <StatCard label="Visits Booked" value={String(data.visitsBooked)} />
          <StatCard label="Visits Done" value={String(data.visitsDone)} />
          <StatCard label="Bookings" value={String(data.bookings)} />
        </div>
      )}

{/* SM today quick stats */}
      {isSm && smMetrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="New Assigned" value={String(smMetrics.assigned)} accent />
          <StatCard label="Calls" value={String(smMetrics.calls)} />
          <StatCard label="Connected" value={String(smMetrics.connected)} />
          <StatCard label="Qualified" value={String(smMetrics.qualified)} />
          <StatCard label="Visits Booked" value={String(smMetrics.visitsBooked)} />
          <StatCard label="Visits Done" value={String(smMetrics.visitsCompleted)} />
          <StatCard label="Negotiations" value={String(smMetrics.negotiations)} />
          <StatCard label="Bookings" value={String(smMetrics.bookings)} />
        </div>
      )}

      {/* Team performance - Owner view */}
      {isAdmin && (
        <>
<section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-primary">
                Sales Manager Performance
              </h2>
              <Link
                href="/crm/reports"
                className="text-xs font-semibold text-accent-ink hover:underline"
              >
                Team Daily Report →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.salesManagers.map((sm) => (
                <Card key={sm.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-navy">{sm.name}</div>
                    <Badge
                      color={
                        sm.leadToBooking >= 5
                          ? "bg-green-100 text-green-800"
                          : sm.leadToBooking >= 3
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-700"
                      }
                    >
                      {sm.leadToBooking}% L→B
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="Leads" value={String(sm.leads)} />
                    <MiniStat label="Visits" value={String(sm.visitsCompleted)} />
                    <MiniStat label="Bookings" value={String(sm.bookings)} />
                  </div>
                  <div className="mt-3 text-[11px] text-muted">
                    Overdue follow-ups:{" "}
                    <span className="font-semibold text-red-600">
                      {sm.overdue}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-primary">
              Caller Performance
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.callers.map((caller) => (
                <Card key={caller.id} className="p-4">
                  <div className="text-sm font-bold text-navy">{caller.name}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="Leads" value={String(caller.leads)} />
                    <MiniStat
                      label="Contact %"
                      value={`${caller.contactRate}%`}
                    />
                    <MiniStat
                      label="Qualified"
                      value={String(caller.qualified)}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}

{/* Caller full-inbox shortcut */}
      {isCaller && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-primary">Aapki Inbox</h2>
            <Link href="/crm/leads" className="text-xs font-semibold text-primary hover:underline">
              Full inbox & call center →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ActionCard href="/crm/leads" label="Lead Inbox" />
            <ActionCard href="/crm/reports" label="Daily Report" />
            <ActionCard href="/crm/messages" label="Messages" />
            <ActionCard href="/crm/leads" label="Call Center" />
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? "border-primary bg-primary"
          : "border-border bg-white"
      }`}
    >
      <div
        className={`text-sm font-bold ${
          accent ? "text-white" : "text-navy"
        }`}
      >
        {value}
      </div>
      <div
        className={`mt-0.5 text-[11px] ${
          accent ? "text-white/70" : "text-muted"
        }`}
      >
        {label}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background px-1 py-1.5">
      <div className="text-sm font-bold text-primary">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}

function ActionCard({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white p-4 text-center transition-colors hover:border-primary/30 hover:bg-primary/5"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
      <span className="text-xs font-semibold text-navy">{label}</span>
    </Link>
  );
}

