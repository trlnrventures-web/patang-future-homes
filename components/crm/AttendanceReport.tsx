"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type DayDetail = {
  date: string;
  dayName: string;
  type: string;
  label: string;
  checkinTime: string | null;
  checkoutTime: string | null;
  status: string | null;
};

type Holiday = { date: string; name: string };

type ReportData = {
  month: string;
  user: { id: number; name: string; role: string; baseSalary: number | null; weekOffDay: string };
  summary: {
    totalDays: number;
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
  };
  holidays: Holiday[];
  dayDetails: DayDetail[];
};

type TeamUser = { id: number; name: string };

const TYPE_COLORS: Record<string, string> = {
  week_off: "bg-gray-100 text-gray-600",
  leave: "bg-amber-100 text-amber-700",
  absent: "bg-red-100 text-red-700",
  not_checked_in: "bg-gray-100 text-gray-500",
  checked_in: "bg-blue-100 text-blue-700",
  missing_checkout: "bg-orange-100 text-orange-700",
  on_time: "bg-green-100 text-green-700",
  late: "bg-red-100 text-red-700",
  holiday: "bg-purple-100 text-purple-700",
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey(): string {
  const now = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function AttendanceReport({
  currentUserId,
  isAdmin,
  initialMonth,
  initialUserId,
}: {
  currentUserId: number;
  isAdmin: boolean;
  initialMonth?: string;
  initialUserId?: string;
}) {
  const [month, setMonth] = useState((initialMonth || currentMonthKey()).slice(0, 7));
  const [userId, setUserId] = useState(initialUserId ? Number(initialUserId) : currentUserId);
  const [report, setReport] = useState<ReportData | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (isAdmin && userId) params.set("userId", String(userId));
      const res = await fetch(`/crm/api/attendance/report?${params}`);
      const json = await res.json();
      if (res.ok) setReport(json);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [month, userId, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetch("/crm/api/team")
        .then((r) => r.json())
        .then((json) => setUsers(json.users || []))
        .catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => {
    const t = setTimeout(loadReport, 0);
    return () => clearTimeout(t);
  }, [loadReport]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/crm/attendance/report?month=${shiftMonth(month, -1)}${isAdmin && userId ? `&userId=${userId}` : ""}`}
            onClick={(e) => { e.preventDefault(); setMonth(shiftMonth(month, -1)); }}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30"
          >
            &larr; Prev
          </Link>
          <span className="rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-white">{month}</span>
          <Link
            href={`/crm/attendance/report?month=${shiftMonth(month, 1)}${isAdmin && userId ? `&userId=${userId}` : ""}`}
            onClick={(e) => { e.preventDefault(); setMonth(shiftMonth(month, 1)); }}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30"
          >
            Next &rarr;
          </Link>
        </div>
        {isAdmin && users.length > 0 && (
          <select
            value={userId}
            onChange={(e) => setUserId(Number(e.target.value))}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted">
          Loading report...
        </div>
      ) : !report ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted">
          No data available for this month.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
            <SummaryCard label="Total Days" value={report.summary.totalDays} />
            <SummaryCard label="Present" value={report.summary.daysPresent} color="text-green-700" />
            <SummaryCard label="Late" value={report.summary.daysLate} color="text-amber-700" />
            <SummaryCard label="Absent" value={report.summary.daysAbsent} color="text-red-700" />
            <SummaryCard label="Leave Days" value={report.summary.leaveDays} color="text-amber-600" />
            <SummaryCard label="Holidays" value={report.summary.holidaysInMonth} color="text-purple-700" />
          </div>

          {/* Detailed breakdown */}
          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="mb-3 text-sm font-bold text-primary">Breakdown</div>
            <div className="grid gap-2 sm:grid-cols-2 text-xs">
              <div className="flex justify-between rounded-xl bg-background px-3 py-2">
                <span className="text-muted">Days Present (On Time)</span>
                <span className="font-bold text-green-700">{report.summary.daysPresent - report.summary.daysLate}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-background px-3 py-2">
                <span className="text-muted">Days Late</span>
                <span className="font-bold text-amber-700">{report.summary.daysLate}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-background px-3 py-2">
                <span className="text-muted">Days Absent</span>
                <span className="font-bold text-red-700">{report.summary.daysAbsent}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-background px-3 py-2">
                <span className="text-muted">Leave Days (Total)</span>
                <span className="font-bold text-amber-600">{report.summary.leaveDays}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-background px-3 py-2">
                <span className="text-muted">&nbsp; Bank-Covered</span>
                <span className="font-semibold text-green-600">{report.summary.leaveDaysBankCovered}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-background px-3 py-2">
                <span className="text-muted">&nbsp; Deductible</span>
                <span className="font-semibold text-red-600">{report.summary.leaveDaysDeductible}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-background px-3 py-2">
                <span className="text-muted">Week-Offs Taken</span>
                <span className="font-bold text-gray-600">{report.summary.weekOffsTaken}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-background px-3 py-2">
                <span className="text-muted">Week-Offs Worked &amp; Banked</span>
                <span className="font-bold text-blue-600">{report.summary.weekOffsWorkedBanked}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-background px-3 py-2">
                <span className="text-muted">Company Holidays</span>
                <span className="font-bold text-purple-700">{report.summary.holidaysInMonth}</span>
              </div>
              {report.summary.incentiveEarned > 0 && (
                <div className="flex justify-between rounded-xl bg-background px-3 py-2">
                  <span className="text-muted">Incentive Earned</span>
                  <span className="font-bold text-primary">₹{report.summary.incentiveEarned.toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Holidays list */}
          {report.holidays.length > 0 && (
            <div className="rounded-2xl border border-border bg-white p-5">
              <div className="mb-3 text-sm font-bold text-primary">Company Holidays in {month}</div>
              <div className="space-y-1.5">
                {report.holidays.map((h) => (
                  <div key={h.date} className="flex items-center justify-between rounded-xl bg-purple-50 px-3 py-2 text-xs">
                    <span className="font-medium text-purple-800">{h.name}</span>
                    <span className="text-purple-600">{h.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day-by-day grid */}
          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="mb-3 text-sm font-bold text-primary">Day-by-Day View</div>
            <div className="grid grid-cols-7 gap-1.5">
              {report.dayDetails.map((d) => (
                <div
                  key={d.date}
                  className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center ${TYPE_COLORS[d.type] || "bg-gray-100"}`}
                  title={`${d.date} · ${d.dayName} · ${d.label}`}
                >
                  <div className="text-[10px] font-semibold">{d.date.slice(8, 10)}</div>
                  <div className="text-[9px] font-medium">{d.dayName.slice(0, 3)}</div>
                  <div className="text-[8px] leading-tight">{d.label.split(":")[0]}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />On Time</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />Late/Absent</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Leave</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-gray-300" />Week Off</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-purple-400" />Holiday</span>
            </div>
          </div>

          {/* Salary link */}
          <Link
            href={`/crm/salary?month=${month}${isAdmin && userId ? `&userId=${userId}` : ""}`}
            className="inline-flex items-center gap-1 rounded-xl border border-border bg-white px-4 py-2 text-xs font-semibold text-navy hover:border-primary/30"
          >
            View Salary Report for {month} &rarr;
          </Link>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color = "text-navy" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{label}</div>
    </div>
  );
}
