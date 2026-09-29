"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * My Pay - a single page for the two paid roles (sales_manager, caller).
 *
 * Money is release-gated: the API only ever returns salary_reports rows an
 * admin has released, so both the Salary and Incentive tabs read from that
 * snapshot. Attendance is the employee's own record of their check-ins, so it
 * loads live for whichever month is selected.
 *
 * The attendance endpoint also returns a live `incentiveEarned` figure. It is
 * deliberately ignored here - surfacing it would hand staff an unreleased
 * number that the Salary tab is specifically hiding.
 */

type ReleasedReport = {
  id: number;
  month: string;
  baseSalary: number;
  daysPresent: number;
  daysLate: number;
  daysAbsent: number;
  leaveDays: number;
  leaveDaysBankCovered: number;
  leaveDaysDeductible: number;
  weekOffsTaken: number;
  weekOffsWorkedBanked: number;
  holidaysInMonth: number;
  incentiveEarned: number;
  deductions: number;
  netPaid: number;
  paymentStatus: string;
  paymentDate: string | null;
  releasedAt: string | null;
};

type DayDetail = {
  date: string;
  dayName: string;
  type: string;
  label: string;
  checkinTime: string | null;
  checkoutTime: string | null;
  status: string | null;
};

type AttendanceData = {
  month: string;
  summary: {
    totalDays: number;
    daysPresent: number;
    halfDays: number;
    daysLate: number;
    daysAbsent: number;
    personalHolidays: number;
    leftJobDays: number;
    leaveDays: number;
    leaveDaysBankCovered: number;
    leaveDaysDeductible: number;
    weekOffsTaken: number;
    weekOffsWorkedBanked: number;
    holidaysInMonth: number;
  };
  holidays: { date: string; name: string }[];
  dayDetails: DayDetail[];
};

type Tab = "attendance" | "incentive" | "salary";

const TABS: { key: Tab; label: string }[] = [
  { key: "attendance", label: "Attendance" },
  { key: "incentive", label: "Incentive" },
  { key: "salary", label: "Salary" },
];

/** Month keys use IST, matching the server's currentMonthKey. */
function istNow(): Date {
  return new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
}

function currentMonthKey(): string {
  const now = istNow();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[m - 1]} ${y}`;
}

function formatRs(n: number): string {
  return `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
}

function dayNumber(date: string): string {
  return date.split("-")[2] || "";
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MyPayPanel({ name }: { name: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("attendance");
  const [reports, setReports] = useState<ReleasedReport[]>([]);
  const [month, setMonth] = useState(currentMonthKey());
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [attendanceMonth, setAttendanceMonth] = useState<string | null>(null);
  const [loadingReports, setLoadingReports] = useState(true);
  const [error, setError] = useState("");
  // Bumping this re-runs the load effect, so Retry reuses the same fetch
  // instead of duplicating it.
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/crm/api/salary")
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/crm/login");
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          return { error: body?.error || "Could not load your pay details." };
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (json?.error) {
          setError(json.error);
        } else {
          setReports(json?.reports || []);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load your pay details. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoadingReports(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, retryNonce]);

  // Attendance is per-month and independent of the pay snapshot, so it is
  // fetched on demand and cached for the month already shown.
  useEffect(() => {
    if (attendanceMonth === month) return;
    let cancelled = false;
    fetch(`/crm/api/attendance/report?month=${month}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/crm/login");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((json) => {
        if (cancelled) return;
        setAttendance(json);
        setAttendanceMonth(month);
      })
      .catch(() => {
        if (cancelled) return;
        setAttendance(null);
        setAttendanceMonth(month);
      });
    return () => {
      cancelled = true;
    };
  }, [month, attendanceMonth, router]);

  // Derived, not stored: while the cached month differs from the selected one
  // the fetch for the new month is still in flight.
  const loadingAttendance = attendanceMonth !== month;

  const releasedMonths = useMemo(
    () => reports.map((r) => r.month).sort().reverse(),
    [reports]
  );

  // The snapshot for the selected month, if that month has been released.
  const report = useMemo(
    () => reports.find((r) => r.month === month) || null,
    [reports, month]
  );

  const monthOptions = useMemo(() => {
    const set = new Set<string>([currentMonthKey(), ...releasedMonths]);
    return Array.from(set).sort().reverse();
  }, [releasedMonths]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-2xl border border-border bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                tab === t.key ? "bg-primary text-white" : "text-muted hover:text-navy"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="mypay-month" className="text-xs font-semibold text-muted">
            Month
          </label>
          <select
            id="mypay-month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
                {releasedMonths.includes(m) ? "" : " (not released)"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button
            onClick={() => {
              setError("");
              setLoadingReports(true);
              setRetryNonce((n) => n + 1);
            }}
            className="ml-3 font-bold underline"
          >
            Retry
          </button>
        </div>
      )}

      {tab === "attendance" && (
        <AttendanceTab data={attendance} loading={loadingAttendance} month={month} name={name} />
      )}

      {(tab === "incentive" || tab === "salary") && (
        <PayTab tab={tab} report={report} month={month} loading={loadingReports} />
      )}
    </div>
  );
}

function AttendanceTab({
  data,
  loading,
  month,
  name,
}: {
  data: AttendanceData | null;
  loading: boolean;
  month: string;
  name: string;
}) {
  if (loading && !data) {
    return <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted">Loading attendance...</div>;
  }
  if (!data) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted">
        Could not load attendance for {monthLabel(month)}.
      </div>
    );
  }

  const s = data.summary;
  const stats: { label: string; value: number; tone?: string }[] = [
    { label: "Present", value: s.daysPresent, tone: "text-green-700" },
    { label: "Half Days", value: s.halfDays, tone: "text-amber-700" },
    { label: "Late", value: s.daysLate, tone: "text-amber-700" },
    { label: "Absent", value: s.daysAbsent, tone: "text-red-600" },
    { label: "Leave", value: s.leaveDays },
    { label: "Week-offs Taken", value: s.weekOffsTaken },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="text-sm font-bold text-primary">{monthLabel(month)} attendance</div>
        <p className="mt-0.5 text-xs text-muted">{name} &middot; {s.totalDays} calendar days</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((st) => (
            <div key={st.label} className="rounded-xl bg-background px-3 py-2.5">
              <div className="text-[11px] text-muted">{st.label}</div>
              <div className={`text-lg font-bold ${st.tone || "text-navy"}`}>{st.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="text-sm font-bold text-primary">Day by day</div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Day</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Check-in</th>
                <th className="px-2 py-2">Check-out</th>
              </tr>
            </thead>
            <tbody>
              {data.dayDetails.map((d) => (
                <tr key={d.date} className="border-b border-border/50 last:border-0">
                  <td className="px-2 py-2 text-navy">
                    {dayNumber(d.date)} <span className="text-xs text-muted">{monthLabel(month).split(" ")[0].slice(0, 3)}</span>
                  </td>
                  <td className="px-2 py-2 text-xs text-muted">{d.dayName}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${dayTone(d.type)}`}>
                      {d.label}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-navy">{d.checkinTime || "—"}</td>
                  <td className="px-2 py-2 text-xs text-navy">{d.checkoutTime || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function dayTone(type: string): string {
  switch (type) {
    case "present":
    case "week_off":
    case "holiday":
    case "leave":
    case "absent_excused":
    case "on_duty":
      return "bg-green-100 text-green-700";
    case "absent":
    case "left_job":
      return "bg-red-100 text-red-700";
    case "half_day":
    case "late":
    case "week_off_worked":
      return "bg-amber-100 text-amber-700";
    case "future":
    case "not_joined":
      return "bg-gray-100 text-gray-500";
    default:
      return "bg-background text-muted";
  }
}

function PayTab({
  tab,
  report,
  month,
  loading,
}: {
  tab: "incentive" | "salary";
  report: ReleasedReport | null;
  month: string;
  loading: boolean;
}) {
  if (loading) {
    return <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted">Loading...</div>;
  }

  if (!report) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center">
        <div className="text-sm font-bold text-primary">{monthLabel(month)} not released yet</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Your {tab === "incentive" ? "incentive" : "salary"} for this month has not been
          published yet. It appears here as soon as your admin releases it.
        </p>
      </div>
    );
  }

  if (tab === "incentive") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-white p-6">
          <div className="text-sm font-bold text-primary">Incentive &middot; {monthLabel(month)}</div>
          <div className="mt-4 rounded-xl bg-primary/5 px-4 py-4">
            <div className="text-xs text-muted">Incentive earned</div>
            <div className="text-3xl font-bold text-green-700">
              {report.incentiveEarned > 0 ? `+${formatRs(report.incentiveEarned)}` : formatRs(0)}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            Released on {formatTimestamp(report.releasedAt)}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="text-sm font-bold text-primary">How this adds to your pay</div>
          <div className="mt-3 space-y-2">
            <PayLine label="Base Salary" value={formatRs(report.baseSalary)} />
            <PayLine label="Incentive Earned" value={`+${formatRs(report.incentiveEarned)}`} tone="text-green-700" />
            <PayLine label="Deductions" value={`-${formatRs(report.deductions)}`} tone="text-red-600" />
            <div className="mt-3 rounded-xl bg-primary/5 px-3 py-3">
              <div className="text-xs text-muted">Net Payable</div>
              <div className="text-2xl font-bold text-primary">{formatRs(report.netPaid)}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-primary">Salary Slip</div>
          <div className="text-sm text-muted">{monthLabel(month)}</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
          report.paymentStatus === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}>
          {report.paymentStatus === "paid" ? "Paid" : "Pending"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <PayLine label="Base Salary" value={formatRs(report.baseSalary)} />
          <PayLine label="Days Present" value={String(report.daysPresent)} />
          <PayLine label="Days Late" value={String(report.daysLate)} />
          <PayLine label="Days Absent" value={String(report.daysAbsent)} />
          <PayLine
            label="Leave Days"
            value={String(report.leaveDays)}
            sublabel={`Bank: ${report.leaveDaysBankCovered} | Deductible: ${report.leaveDaysDeductible}`}
          />
          <PayLine label="Week-Offs Taken" value={String(report.weekOffsTaken)} />
          <PayLine label="Week-Offs Worked (Banked)" value={String(report.weekOffsWorkedBanked)} />
          <PayLine label="Company Holidays" value={String(report.holidaysInMonth)} />
        </div>
        <div className="space-y-2">
          <PayLine label="Incentive Earned" value={`+${formatRs(report.incentiveEarned)}`} tone="text-green-700" />
          <PayLine label="Deductions" value={`-${formatRs(report.deductions)}`} tone="text-red-600" />
          <div className="mt-3 rounded-xl bg-primary/5 px-3 py-3">
            <div className="text-xs text-muted">Net Payable</div>
            <div className="text-2xl font-bold text-primary">{formatRs(report.netPaid)}</div>
          </div>
          {report.paymentDate && <PayLine label="Payment Date" value={report.paymentDate} />}
          <PayLine label="Released On" value={formatTimestamp(report.releasedAt) || "—"} />
        </div>
      </div>
    </div>
  );
}

function PayLine({
  label,
  value,
  sublabel,
  tone = "text-navy",
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2 text-xs">
      <div>
        <span className="text-muted">{label}</span>
        {sublabel && <div className="text-[10px] text-soft">{sublabel}</div>}
      </div>
      <span className={`font-bold ${tone}`}>{value}</span>
    </div>
  );
}
