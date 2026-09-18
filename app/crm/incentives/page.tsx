import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import { getMonthlyIncentives, getUserIncentiveForMonth, currentMonthKey, INCENTIVE_LADDERS, type IncentiveEntry } from "@/lib/crm/incentives";
import { Card } from "@/components/crm/ui";
import MarkPaidButton from "@/components/crm/MarkPaidButton";

export const metadata: Metadata = {
  title: { absolute: "Incentives | Patang CRM" },
  robots: { index: false, follow: false },
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function IncentivesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const { month: monthParam } = await searchParams;
  const month = (monthParam || currentMonthKey()).slice(0, 7);
  const isAdmin = user.role === "admin" || user.role === "sales_head";

  const entries = isAdmin
    ? getMonthlyIncentives(month)
    : (getUserIncentiveForMonth(user.id, month) ? [getUserIncentiveForMonth(user.id, month) as IncentiveEntry] : []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Incentives</h1>
          <p className="mt-0.5 text-sm text-muted">
            {isAdmin
              ? "Tier-based incentive ladder. It recalculates automatically with every booking."
              : "Your monthly incentive updates live with every booking."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/crm/incentives?month=${shiftMonth(month, -1)}`}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30"
          >
            ← Prev
          </Link>
          <span className="rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-white">
            {month}
          </span>
          <Link
            href={`/crm/incentives?month=${shiftMonth(month, 1)}`}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30"
          >
            Next →
          </Link>
        </div>
      </div>

      {/* Ladder reference */}
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.values(INCENTIVE_LADDERS).map((ladder) => (
          <Card key={ladder.key} className="p-4">
            <div className="text-sm font-bold text-primary">{ladder.label} ladder</div>
            <div className="mt-2 space-y-1">
              {ladder.tiers.map((t, i) => {
                const next = i < ladder.tiers.length - 1 ? ladder.tiers[i + 1].threshold : null;
                const range = next
                  ? next - 1 === t.threshold
                    ? `${t.threshold}`
                    : `${t.threshold}–${next - 1}`
                  : `${t.threshold}+`;
                return (
                  <div key={t.threshold} className="flex items-center justify-between rounded-lg bg-background px-3 py-1.5 text-xs">
                    <span className="font-medium text-navy">
                      {ladder.key === "sm" ? "Bookings" : "Units"}: {range}
                    </span>
                    <span className="font-bold text-primary">₹{t.rate.toLocaleString("en-IN")} each</span>
                  </div>
                );
              })}
              <p className="pt-1 text-[11px] text-soft">
                Retroactive: cross a threshold and all units for the month recalculate at the higher rate.
              </p>
            </div>
          </Card>
        ))}
      </div>

      {entries.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          No bookings this month yet. Close the first booking and your incentive unlocks!
        </Card>
      ) : isAdmin ? (
        <Card className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2 text-center">Count</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.userId} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-2.5 font-semibold text-navy">{e.name}</td>
                    <td className="px-2 py-2.5 text-xs text-muted">{e.role === "sales_manager" ? "SM" : "Caller"}</td>
                    <td className="px-2 py-2.5 text-center text-navy">{e.count}</td>
                    <td className="px-2 py-2.5 text-right text-muted">₹{e.rate.toLocaleString("en-IN")}</td>
                    <td className="px-2 py-2.5 text-right font-bold text-primary">₹{e.total.toLocaleString("en-IN")}</td>
                    <td className="px-2 py-2.5 text-right">
                      <MarkPaidButton
                        userId={e.userId}
                        month={month}
                        total={e.total}
                        outstanding={e.outstanding}
                        paid={!!e.paid}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        (() => {
          const e = entries[0];
          return (
            <div className="space-y-3">
              <Card className="p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-primary">
                      {e.role === "sales_manager" ? "Sales Manager incentive" : "Caller incentive"} for {month}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {e.count} {e.role === "sales_manager" ? "bookings" : "units"} × ₹{e.rate.toLocaleString("en-IN")} each
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">₹{e.total.toLocaleString("en-IN")}</div>
                    <div className="text-[11px] text-muted">
                      {e.paid ? "Paid" : e.outstanding > 0 ? `Outstanding: ₹${e.outstanding.toLocaleString("en-IN")}` : "Pending"}
                    </div>
                  </div>
                </div>
                <p className="mt-3 rounded-xl bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
                  {e.hint}
                </p>
              </Card>
            </div>
          );
        })()
      )}
    </div>
  );
}