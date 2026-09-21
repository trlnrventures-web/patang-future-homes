"use client";

import { useState, useEffect, useCallback } from "react";

type SalaryReportRow = {
  id: number;
  userId: number;
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
  createdAt: string;
};

type ComputedReport = {
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
};

type TeamUser = { id: number; name: string };

function currentMonthKey(): string {
  const now = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentYear(): number {
  return new Date(Date.now() + (5 * 60 + 30) * 60 * 1000).getUTCFullYear();
}

export default function SalaryReport({
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
  const [view, setView] = useState<"list" | "slip">("list");
  const [month, setMonth] = useState((initialMonth || currentMonthKey()).slice(0, 7));
  const [userId, setUserId] = useState(initialUserId ? Number(initialUserId) : currentUserId);
  const [year, setYear] = useState(currentYear());
  const [reports, setReports] = useState<SalaryReportRow[]>([]);
  const [slipReport, setSlipReport] = useState<SalaryReportRow | ComputedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [notice, setNotice] = useState("");

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2500);
  };

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (isAdmin) {
        // load all
      }
      const res = await fetch(`/crm/api/salary?${params}`);
      const json = await res.json();
      if (res.ok) setReports(json.reports || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [year, isAdmin]);

  const loadSlip = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (isAdmin && userId) params.set("userId", String(userId));
      const res = await fetch(`/crm/api/salary?${params}`);
      const json = await res.json();
      if (res.ok) {
        setSlipReport(json.report || json.computed);
        setView("slip");
      }
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
    const t = setTimeout(() => {
      if (view === "list") loadReports();
    }, 0);
    return () => clearTimeout(t);
  }, [view, loadReports]);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/crm/api/salary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, userId: isAdmin ? userId : undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      flash("Salary report generated");
      loadSlip();
    } catch (e: unknown) {
      flash((e as Error).message || "Something went wrong");
    } finally {
      setGenerating(false);
    }
  };

  const markPaid = async (id: number) => {
    try {
      const res = await fetch("/crm/api/salary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, paymentStatus: "paid" }),
      });
      if (res.ok) {
        flash("Marked as paid");
        loadReports();
        if (slipReport && "id" in slipReport && slipReport.id === id) {
          setSlipReport({ ...slipReport, paymentStatus: "paid", paymentDate: new Date().toISOString().slice(0, 10) });
        }
      }
    } catch {
      flash("Failed to update");
    }
  };

  const markPending = async (id: number) => {
    try {
      const res = await fetch("/crm/api/salary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, paymentStatus: "pending" }),
      });
      if (res.ok) {
        flash("Marked as pending");
        loadReports();
        if (slipReport && "id" in slipReport && slipReport.id === id) {
          setSlipReport({ ...slipReport, paymentStatus: "pending", paymentDate: null });
        }
      }
    } catch {
      flash("Failed to update");
    }
  };

  const formatRs = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-4">
      {notice && (
        <div className="fixed left-1/2 top-16 z-[100] -translate-x-1/2 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-2xl">
          {notice}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {view === "slip" ? (
          <button
            onClick={() => { setView("list"); setSlipReport(null); }}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30"
          >
            &larr; Back to List
          </button>
        ) : (
          <>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy"
            >
              {Array.from({ length: 5 }, (_, i) => currentYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
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
          </>
        )}
      </div>

      {view === "list" ? (
        loading ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted">
            Loading...
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted">
            No salary reports for {year}. Generate one from the month view.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-2 py-2">Month</th>
                    {isAdmin && <th className="px-2 py-2">User</th>}
                    <th className="px-2 py-2 text-right">Base</th>
                    <th className="px-2 py-2 text-right">Incentive</th>
                    <th className="px-2 py-2 text-right">Deductions</th>
                    <th className="px-2 py-2 text-right">Net Paid</th>
                    <th className="px-2 py-2 text-center">Status</th>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="px-2 py-2.5 font-semibold text-navy">{r.month}</td>
                      {isAdmin && (
                        <td className="px-2 py-2.5 text-xs text-muted">
                          {users.find((u) => u.id === r.userId)?.name || `#${r.userId}`}
                        </td>
                      )}
                      <td className="px-2 py-2.5 text-right text-navy">{formatRs(r.baseSalary)}</td>
                      <td className="px-2 py-2.5 text-right text-green-700">{r.incentiveEarned > 0 ? `+${formatRs(r.incentiveEarned)}` : "—"}</td>
                      <td className="px-2 py-2.5 text-right text-red-600">{r.deductions > 0 ? `-${formatRs(r.deductions)}` : "—"}</td>
                      <td className="px-2 py-2.5 text-right font-bold text-primary">{formatRs(r.netPaid)}</td>
                      <td className="px-2 py-2.5 text-center">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          r.paymentStatus === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {r.paymentStatus === "paid" ? "Paid" : "Pending"}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted">{r.paymentDate || "—"}</td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => { setMonth(r.month); setUserId(r.userId); loadSlip(); }}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          View Slip
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : slipReport ? (
        <SalarySlip
          report={slipReport}
          isAdmin={isAdmin}
          onMarkPaid={markPaid}
          onMarkPending={markPending}
          formatRs={formatRs}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="text-center">
            <p className="text-sm text-muted">No salary report generated for this month yet.</p>
            {isAdmin && (
              <button
                onClick={generateReport}
                disabled={generating}
                className="mt-3 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-secondary disabled:opacity-50"
              >
                {generating ? "Generating..." : "Generate Salary Report"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SalarySlip({
  report,
  isAdmin,
  onMarkPaid,
  onMarkPending,
  formatRs,
}: {
  report: SalaryReportRow | ComputedReport;
  isAdmin: boolean;
  onMarkPaid: (id: number) => void;
  onMarkPending: (id: number) => void;
  formatRs: (n: number) => string;
}) {
  const hasId = "id" in report;
  const r = report as SalaryReportRow;

  return (
    <div className="rounded-2xl border border-border bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-primary">Salary Slip</div>
          <div className="text-sm text-muted">Month: {report.month}</div>
        </div>
        {hasId && isAdmin && (
          <div className="flex gap-2">
            {r.paymentStatus === "pending" ? (
              <button
                onClick={() => onMarkPaid(r.id)}
                className="rounded-xl bg-green-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-green-700"
              >
                Mark as Paid
              </button>
            ) : (
              <button
                onClick={() => onMarkPending(r.id)}
                className="rounded-xl bg-amber-100 px-4 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-200"
              >
                Mark as Pending
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <SlipRow label="Base Salary" value={formatRs(report.baseSalary)} />
          <SlipRow label="Days Present" value={String(report.daysPresent)} />
          <SlipRow label="Days Late" value={String(report.daysLate)} />
          <SlipRow label="Days Absent" value={String(report.daysAbsent)} />
          <SlipRow label="Leave Days" value={String(report.leaveDays)} sublabel={`Bank: ${report.leaveDaysBankCovered} | Deductible: ${report.leaveDaysDeductible}`} />
          <SlipRow label="Week-Offs Taken" value={String(report.weekOffsTaken)} />
          <SlipRow label="Week-Offs Worked (Banked)" value={String(report.weekOffsWorkedBanked)} />
          <SlipRow label="Company Holidays" value={String(report.holidaysInMonth)} />
        </div>
        <div className="space-y-2">
          <SlipRow label="Incentive Earned" value={`+${formatRs(report.incentiveEarned)}`} color="text-green-700" />
          <SlipRow label="Deductions" value={`-${formatRs(report.deductions)}`} color="text-red-600" />
          <div className="mt-3 rounded-xl bg-primary/5 px-3 py-3">
            <div className="text-xs text-muted">Net Payable</div>
            <div className="text-2xl font-bold text-primary">{formatRs(report.netPaid)}</div>
          </div>
          {hasId && (
            <>
              <SlipRow label="Payment Status" value={r.paymentStatus === "paid" ? "Paid" : "Pending"} color={r.paymentStatus === "paid" ? "text-green-700" : "text-amber-700"} />
              {r.paymentDate && <SlipRow label="Payment Date" value={r.paymentDate} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SlipRow({
  label,
  value,
  sublabel,
  color = "text-navy",
}: {
  label: string;
  value: string;
  sublabel?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2 text-xs">
      <div>
        <span className="text-muted">{label}</span>
        {sublabel && <div className="text-[10px] text-soft">{sublabel}</div>}
      </div>
      <span className={`font-bold ${color}`}>{value}</span>
    </div>
  );
}
