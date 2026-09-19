import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import { istToday } from "@/lib/crm/attendance";
import {
  buildAttendanceAudit,
  auditUsers,
  activeHolidays,
  AUDIT_TYPE_LABELS,
  type AttendanceAuditEventType,
  type AttendanceAuditTone,
} from "@/lib/crm/attendance-audit";
import { Card, Button } from "@/components/crm/ui";
import HolidayManager from "@/components/crm/HolidayManager";

export const metadata: Metadata = {
  title: { absolute: "Attendance Audit | Patang CRM" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ALL_TYPES = Object.keys(AUDIT_TYPE_LABELS) as AttendanceAuditEventType[];

const TONE_CLASS: Record<AttendanceAuditTone, string> = {
  green: "bg-green-500",
  red: "bg-red-500",
  amber: "bg-amber-500",
  gray: "bg-gray-400",
  blue: "bg-blue-500",
};

const TONE_BADGE: Record<AttendanceAuditTone, string> = {
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  gray: "bg-gray-100 text-gray-600",
  blue: "bg-blue-100 text-blue-700",
};

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

function formatTimestamp(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso;
  }
}

export default async function AttendanceAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; from?: string; to?: string; types?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");
  if (user.role !== "admin" && user.role !== "sales_head") redirect("/crm/attendance");

  const params = await searchParams;
  const today = istToday();
  const defaultFrom = addDays(today, -30);

  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from || "") ? params.from! : defaultFrom;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to || "") ? params.to! : today;
  const userId = params.userId && /^\d+$/.test(params.userId) ? Number(params.userId) : undefined;

  const rawTypes = params.types == null ? [] : Array.isArray(params.types) ? params.types : [params.types];
  const selectedTypes = rawTypes.filter((t): t is AttendanceAuditEventType =>
    (ALL_TYPES as string[]).includes(t)
  );
  const typeSet = selectedTypes.length > 0 ? new Set(selectedTypes) : undefined;

  const users = auditUsers();
  const events = buildAttendanceAudit({ userId, from, to, types: typeSet });
  const holidays = activeHolidays();

  const grouped = events.reduce<Record<string, typeof events>>((acc, e) => {
    (acc[e.date] ||= []).push(e);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const summary = {
    checkins: events.filter((e) => e.type === "checkin").length,
    late: events.filter((e) => e.type === "checkin" && e.tone === "amber").length,
    weekOffs: events.filter((e) => e.type === "week_off_used" || e.type === "week_off_adjusted").length,
    lapsed: events.filter((e) => e.type === "week_off_expired").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Attendance Audit Log</h1>
          <p className="mt-0.5 text-sm text-muted">
            Admin-only chronological trail of check-ins, weekly week-offs (credited / availed / adjusted / lapsed), and company holidays.
          </p>
        </div>
        <Link
          href="/crm/attendance"
          className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30"
        >
          ← Attendance
        </Link>
      </div>

      <Card className="p-4">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-muted">
            User
            <select
              name="userId"
              defaultValue={userId ? String(userId) : ""}
              className="mt-1 block rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.weekOffDay}
                </option>
              ))}
            </select>
          </label>
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
          <div className="min-w-[16rem] flex-1">
            <div className="text-xs font-semibold text-muted">Event types (none = all)</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {ALL_TYPES.map((t) => (
                <label key={t} className="inline-flex items-center gap-1.5 text-xs text-navy">
                  <input type="checkbox" name="types" value={t} defaultChecked={selectedTypes.includes(t)} />
                  {AUDIT_TYPE_LABELS[t]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Link
              href="/crm/attendance/audit"
              className="inline-flex items-center rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-muted hover:border-primary/30"
            >
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Check-ins", value: summary.checkins, cls: "text-primary" },
          { label: "Late check-ins", value: summary.late, cls: "text-amber-600" },
          { label: "Week-offs taken", value: summary.weekOffs, cls: "text-green-600" },
          { label: "Week-offs lapsed", value: summary.lapsed, cls: "text-red-600" },
        ].map((s) => (
          <Card key={s.label} className="px-4 py-3">
            <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{s.label}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-primary">Company holidays</h2>
            <p className="mt-0.5 text-[11px] text-soft">Additions and removals are recorded in the audit trail below.</p>
          </div>
        </div>
        <div className="mt-3">
          <HolidayManager holidays={holidays} today={today} />
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-primary">
            Events <span className="font-medium text-muted">({events.length})</span>
          </h2>
          <span className="text-[11px] text-soft">
            {from} → {to}
            {userId ? ` · ${users.find((u) => u.id === userId)?.name ?? "user"}` : " · all users"}
          </span>
        </div>

        {dates.length === 0 ? (
          <p className="mt-4 rounded-xl bg-background px-3 py-6 text-center text-sm text-soft">
            No audit events for the selected filters.
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
                  {grouped[date].map((e) => (
                    <div
                      key={e.key}
                      className="flex items-start gap-3 rounded-xl border border-border bg-white px-3 py-2"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_CLASS[e.tone]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-navy">{e.title}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TONE_BADGE[e.tone]}`}>
                            {AUDIT_TYPE_LABELS[e.type]}
                          </span>
                          <span className="text-[11px] font-medium text-primary">{e.userName}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted">{e.detail}</div>
                      </div>
                      <span className="shrink-0 text-right text-[10px] text-soft">
                        {e.timeLabel || formatTimestamp(e.at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
