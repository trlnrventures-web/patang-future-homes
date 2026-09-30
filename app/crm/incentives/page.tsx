import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import {
  getBookingIncentiveRows,
  getIncentiveLiabilitySummary,
  getIncentiveParticipants,
  currentMonthKey,
  INCENTIVE_LADDERS,
  type BookingIncentiveRow,
} from "@/lib/crm/incentives";
import { queryAuditLog } from "@/lib/crm/audit";
import { Card } from "@/components/crm/ui";
import MarkBookingPaidButton from "@/components/crm/MarkBookingPaidButton";

export const metadata: Metadata = {
  title: { absolute: "Incentives | Patang CRM" },
  robots: { index: false, follow: false },
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatWhen(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso;
  }
}

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso;
  }
}

const rs = (n: number) => `₹${n.toLocaleString("en-IN")}`;

type Filters = {
  month: string;
  role: string;
  person: string;
  paid: string;
};

export default async function IncentivesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; role?: string; person?: string; paid?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const params = await searchParams;
  const isAdmin = user.role === "admin" || user.role === "sales_head";

  const filters: Filters = {
    month: /^\d{4}-\d{2}$/.test(params.month || "") ? params.month! : currentMonthKey(),
    role: ["caller", "sales_manager"].includes(params.role || "") ? params.role! : "",
    person: /^\d+$/.test(params.person || "") ? params.person! : "",
    paid: ["true", "false"].includes(params.paid || "") ? params.paid! : "",
  };

  const query = {
    month: filters.month,
    role: (filters.role || undefined) as "caller" | "sales_manager" | undefined,
    userId: filters.person ? Number(filters.person) : undefined,
    paid: filters.paid === "true" ? true : filters.paid === "false" ? false : undefined,
  };

  // Staff are pinned to their own rows regardless of what the URL asks for.
  const rows: BookingIncentiveRow[] = isAdmin
    ? getBookingIncentiveRows(query)
    : getBookingIncentiveRows({ ...query, userId: user.id });

  const liability = isAdmin
    ? getIncentiveLiabilitySummary({ month: filters.month })
    : { unpaidTotal: 0, unpaidRows: 0, paidTotal: 0, paidRows: 0 };

  const myUnpaid = rows.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0);
  const participants = isAdmin ? getIncentiveParticipants({ month: filters.month }) : [];

  const audit = isAdmin ? queryAuditLog({ categories: ["incentive"], limit: 12 }) : [];

  // A filter-aware link so every control on the page keeps the others intact.
  const link = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    const qs = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    return `/crm/incentives?${qs.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Incentives</h1>
          <p className="mt-0.5 text-sm text-muted">
            {isAdmin
              ? "One row per person per confirmed booking. A booking earns the assigned Caller and the assigned SM separately."
              : "Your incentives from confirmed bookings, paid and unpaid."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={link({ month: shiftMonth(filters.month, -1) })}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30"
          >
            ← Prev
          </Link>
          <span className="rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-white">
            {filters.month}
          </span>
          <Link
            href={link({ month: shiftMonth(filters.month, 1) })}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30"
          >
            Next →
          </Link>
        </div>
      </div>

      {/* Liability. Unpaid is the number that answers "what do we owe right
          now", so it is stated outright rather than left to be totalled. */}
      {isAdmin && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="px-4 py-3">
            <div className="text-2xl font-bold text-red-600">{rs(liability.unpaidTotal)}</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Unpaid liability
            </div>
          </Card>
          <Card className="px-4 py-3">
            <div className="text-2xl font-bold text-primary">{liability.unpaidRows}</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Unpaid rows
            </div>
          </Card>
          <Card className="px-4 py-3">
            <div className="text-2xl font-bold text-green-600">{rs(liability.paidTotal)}</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Paid this month
            </div>
          </Card>
          <Card className="px-4 py-3">
            <div className="text-2xl font-bold text-navy">
              {rs(rows.reduce((s, r) => s + r.amount, 0))}
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Shown here
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-3">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="month" value={filters.month} />
          <label className="text-xs font-semibold text-muted">
            Role
            <select
              name="role"
              defaultValue={filters.role}
              className="mt-1 block rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
            >
              <option value="">All roles</option>
              <option value="caller">Caller</option>
              <option value="sales_manager">Sales Manager</option>
            </select>
          </label>

          {isAdmin && (
            <label className="text-xs font-semibold text-muted">
              Person
              <select
                name="person"
                defaultValue={filters.person}
                className="mt-1 block rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
              >
                <option value="">Everyone</option>
                {participants.map((p) => (
                  <option key={`${p.userId}:${p.role}`} value={p.userId}>
                    {p.name} · {p.role === "caller" ? "Caller" : "SM"}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="text-xs font-semibold text-muted">
            Status
            <select
              name="paid"
              defaultValue={filters.paid}
              className="mt-1 block rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
            >
              <option value="">Paid &amp; unpaid</option>
              <option value="false">Unpaid only</option>
              <option value="true">Paid only</option>
            </select>
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-secondary"
            >
              Apply
            </button>
            <Link
              href={`/crm/incentives?month=${filters.month}`}
              className="inline-flex items-center rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold text-muted hover:border-primary/30"
            >
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          No incentives for these filters. An incentive appears when a booking is
          confirmed.
        </Card>
      ) : (
        <Card className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-2 py-2">Lead</th>
                  <th className="px-2 py-2">Project</th>
                  <th className="px-2 py-2">Person</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2">Booked</th>
                  {isAdmin && <th className="px-2 py-2 text-right">Mark as Paid</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-2.5">
                      <Link
                        href={`/crm/leads/${r.leadId}`}
                        className="font-semibold text-navy hover:text-primary hover:underline"
                      >
                        {r.leadName}
                      </Link>
                      {r.unit && <span className="ml-1 text-[11px] text-soft">Unit {r.unit}</span>}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted">{r.projectTitle || "—"}</td>
                    <td className="px-2 py-2.5 font-semibold text-navy">{r.userName}</td>
                    <td className="px-2 py-2.5 text-xs text-muted">
                      {r.role === "sales_manager" ? "SM" : "Caller"}
                    </td>
                    <td className="px-2 py-2.5 text-right font-bold text-primary">{rs(r.amount)}</td>
                    <td className="px-2 py-2.5 text-xs text-muted">{formatDay(r.bookedAt)}</td>
                    {isAdmin && (
                      <td className="px-2 py-2.5 text-right">
                        <MarkBookingPaidButton
                          bookingId={r.bookingId}
                          userId={r.userId}
                          personName={r.userName}
                          amount={r.amount}
                          paid={r.paid}
                          paidAtLabel={r.paid ? formatDay(r.paidAt) : null}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Own totals, so a staff member does not have to add the table up. */}
      {!isAdmin && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="px-4 py-3">
            <div className="text-2xl font-bold text-red-600">{rs(myUnpaid)}</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Your unpaid incentives
            </div>
          </Card>
          <Card className="px-4 py-3">
            <div className="text-2xl font-bold text-primary">
              {rs(rows.reduce((s, r) => s + r.amount, 0) - myUnpaid)}
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Your paid incentives
            </div>
          </Card>
        </div>
      )}

      {/* Ladder reference. The ladder is retroactive, which is why every row a
          person owns in a month shows the same figure: crossing a threshold
          revalues the whole month, earlier bookings included. */}
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
                  <div
                    key={t.threshold}
                    className="flex items-center justify-between rounded-lg bg-background px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium text-navy">
                      {ladder.key === "sm" ? "Bookings" : "Units"}: {range}
                    </span>
                    <span className="font-bold text-primary">{rs(t.rate)} each</span>
                  </div>
                );
              })}
              <p className="pt-1 text-[11px] text-soft">
                Retroactive: cross a threshold and every row that person owns that
                month moves to the higher rate, earlier bookings included.
              </p>
            </div>
          </Card>
        ))}
      </div>

      {isAdmin && audit.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-primary">Payment audit trail</h2>
          <p className="mt-0.5 text-[11px] text-soft">
            Recent incentive paid / reversed events, with who changed it and when.
          </p>
          <div className="mt-3 space-y-1.5">
            {audit.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background px-3 py-2 text-xs"
              >
                <span className="min-w-0 text-navy">
                  {a.action === "incentive_marked_unpaid" ? (
                    <span className="mr-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      REVERSED
                    </span>
                  ) : (
                    <span className="mr-1.5 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                      PAID
                    </span>
                  )}
                  {a.summary}
                </span>
                <span className="shrink-0 text-[10px] text-soft">
                  by {a.actorName || "System"} · {formatWhen(a.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
