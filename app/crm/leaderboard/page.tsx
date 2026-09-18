import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import { getSmLeaderboard, currentMonthKey } from "@/lib/crm/incentives";
import { Card } from "@/components/crm/ui";

export const metadata: Metadata = {
  title: { absolute: "Leaderboard | Patang CRM" },
  robots: { index: false, follow: false },
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const { month: monthParam } = await searchParams;
  const month = (monthParam || currentMonthKey()).slice(0, 7);
  const standings = getSmLeaderboard(month);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Monthly Leaderboard</h1>
          <p className="mt-0.5 text-sm text-muted">
            Sales Managers ranked by bookings closed, alongside their incentives. Transparency keeps everyone motivated. 🏆
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/crm/leaderboard?month=${shiftMonth(month, -1)}`} className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30">
            ← Prev
          </Link>
          <span className="rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-white">{month}</span>
          <Link href={`/crm/leaderboard?month=${shiftMonth(month, 1)}`} className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30">
            Next →
          </Link>
        </div>
      </div>

      {standings.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          No bookings have been closed this month yet. The first booking earns a spot on the leaderboard!
        </Card>
      ) : (
        <Card className="p-2">
          <div className="space-y-1">
            {standings.map((s, idx) => {
              const isFirst = idx === 0;
              return (
                <div
                  key={s.userId}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 ${
                    isFirst ? "bg-primary/10 ring-1 ring-primary/20" : "bg-background"
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      isFirst ? "bg-primary text-white" : "bg-white text-muted border border-border"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm font-bold text-navy">
                      {s.name}
                      {isFirst && <span className="text-sm">🏆</span>}
                    </div>
                    <div className="text-[11px] text-muted">
                      {s.count} booking{s.count === 1 ? "" : "s"} · tier ₹{s.rate.toLocaleString("en-IN")} each
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-primary">₹{s.total.toLocaleString("en-IN")}</div>
                    <div className="text-[10px] text-muted">{s.paid ? "Paid" : "Incentive"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <p className="text-center text-[11px] text-soft">
        For incentive details, see the <Link href="/crm/incentives" className="font-semibold text-primary hover:underline">Incentives page →</Link>
      </p>
    </div>
  );
}