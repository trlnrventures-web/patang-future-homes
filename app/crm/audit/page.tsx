import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/crm/data";
import { istToday } from "@/lib/crm/attendance";
import { queryAuditLog, type AuditCategory } from "@/lib/crm/audit";
import { Card, Button } from "@/components/crm/ui";

export const metadata: Metadata = {
  title: { absolute: "Audit Log | Patang CRM" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const CATEGORIES: { key: AuditCategory; label: string; cls: string }[] = [
  { key: "settings", label: "Settings", cls: "bg-blue-100 text-blue-700" },
  { key: "contact_access", label: "Contact access", cls: "bg-amber-100 text-amber-800" },
  { key: "incentive", label: "Incentives", cls: "bg-green-100 text-green-700" },
  { key: "attendance", label: "Attendance", cls: "bg-violet-100 text-violet-700" },
  { key: "leave", label: "Leave", cls: "bg-cyan-100 text-cyan-800" },
  { key: "holiday", label: "Holidays", cls: "bg-rose-100 text-rose-700" },
  { key: "data", label: "Data", cls: "bg-slate-100 text-slate-700" },
];

const CATEGORY_META = new Map(CATEGORIES.map((c) => [c.key, c]));

function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000).toISOString().slice(0, 10);
}

function formatDayHeading(dateKey: string): string {
  try {
    return new Date(`${dateKey}T12:00:00+05:30`).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return dateKey;
  }
}

function formatTime(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return "";
  }
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ categories?: string | string[]; from?: string; to?: string; action?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");
  if (user.role !== "admin" && user.role !== "sales_head") redirect("/crm/dashboard");

  const params = await searchParams;
  const today = istToday();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from || "") ? params.from! : addDays(today, -30);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to || "") ? params.to! : today;

  const rawCategories =
    params.categories == null ? [] : Array.isArray(params.categories) ? params.categories : [params.categories];
  const selected = rawCategories.filter((c): c is AuditCategory =>
    CATEGORIES.some((cat) => cat.key === c)
  );
  const action = (params.action || "").trim();

  const rows = queryAuditLog({
    categories: selected.length ? selected : undefined,
    action: action || undefined,
    from: `${from}T00:00:00.000Z`,
    to: `${to}T23:59:59.999Z`,
    limit: 500,
  });

  const grouped = rows.reduce<Record<string, typeof rows>>((acc, r) => {
    const day = r.createdAt.slice(0, 10);
    (acc[day] ||= []).push(r);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const counts = CATEGORIES.map((c) => ({
    ...c,
    n: rows.filter((r) => r.category === c.key).length,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Audit Log</h1>
          <p className="mt-0.5 text-sm text-muted">
            Every configuration change, contact reveal and payroll event, newest first.
          </p>
        </div>
      </div>

      <Card className="p-4">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-muted">
            From
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-1 block rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            To
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="mt-1 block rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Action
            <input
              type="text"
              name="action"
              defaultValue={action}
              placeholder="e.g. update"
              className="mt-1 block rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
            />
          </label>
          <div className="min-w-[18rem] flex-1">
            <div className="text-xs font-semibold text-muted">Categories (none = all)</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {CATEGORIES.map((c) => (
                <label key={c.key} className="inline-flex items-center gap-1.5 text-xs text-navy">
                  <input type="checkbox" name="categories" value={c.key} defaultChecked={selected.includes(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Link
              href="/crm/audit"
              className="inline-flex items-center rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-muted hover:border-primary/30"
            >
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {counts.map((c) => (
          <Card key={c.key} className="px-4 py-3">
            <div className="text-2xl font-bold text-navy">{c.n}</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{c.label}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-bold text-primary">
          Entries <span className="font-medium text-muted">({rows.length}{rows.length >= 500 ? "+" : ""})</span>
        </h2>

        {dates.length === 0 ? (
          <p className="mt-4 rounded-xl bg-background px-3 py-6 text-center text-sm text-soft">
            No audit entries for the selected filters.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {dates.map((date) => (
              <div key={date}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted">
                    {formatDayHeading(date)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-1.5">
                  {grouped[date].map((r) => {
                    const meta = CATEGORY_META.get(r.category as AuditCategory);
                    return (
                      <div
                        key={r.id}
                        className="flex items-start gap-3 rounded-xl border border-border bg-white px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                meta?.cls ?? "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {meta?.label ?? r.category}
                            </span>
                            <span className="text-sm font-semibold text-navy">{r.summary}</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted">
                            {r.actorName ? `by ${r.actorName}` : "system"}
                            {r.action ? ` · ${r.action}` : ""}
                            {r.entityType ? ` · ${r.entityType}${r.entityId ? ` #${r.entityId}` : ""}` : ""}
                          </div>
                        </div>
                        <span className="shrink-0 text-right text-[10px] text-soft">{formatTime(r.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
