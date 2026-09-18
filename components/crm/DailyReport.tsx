"use client";

import { useState, useCallback } from "react";
import { Button, Badge } from "./ui";
import {
  formatReportDate,
  buildMyReportText,
  buildTeamReportText,
} from "@/lib/crm/report-text";
import type { DailyMetrics, TeamReport } from "@/lib/crm/reports";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function shiftDate(date: string, delta: number): string {
  const ms = new Date(`${date}T00:00:00+05:30`).getTime() + delta * 86400000;
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

type Props = {
  initialMy: { date: string; name: string; role: string; metrics: DailyMetrics };
  initialTeam: TeamReport | null;
  isAdmin: boolean;
};

export default function DailyReport({ initialMy, initialTeam, isAdmin }: Props) {
  const [view, setView] = useState<"my" | "team">(initialTeam ? "team" : "my");
  const [date, setDate] = useState(initialMy.date);
  const [my, setMy] = useState(initialMy);
  const [team, setTeam] = useState<TeamReport | null>(initialTeam);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);
  const [customDate, setCustomDate] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }, []);

  const load = useCallback(async (targetDate: string, targetView: "my" | "team") => {
    setLoading(true);
    try {
      if (targetView === "team") {
        const res = await fetch(`/crm/api/reports/team?date=${targetDate}`);
        if (!res.ok) throw new Error("Failed");
        const d = await res.json();
        setTeam(d);
      } else {
        const res = await fetch(`/crm/api/reports/my?date=${targetDate}`);
        if (!res.ok) throw new Error("Failed");
        setMy(await res.json());
      }
    } catch {
      showToast("Could not load the report");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const applyDate = (next: string) => {
    setDate(next);
    load(next, view);
  };

  const changeView = (next: "my" | "team") => {
    setView(next);
    load(date, next);
  };

  const myText = buildMyReportText({
    date: my.date,
    employeeName: my.name,
    role: my.role,
    metrics: my.metrics,
  });

  const teamText = (view === "team" && team)
    ? buildTeamReportText({
        date: team.date,
        totals: team.totals,
        callers: team.callers,
        salesManagers: team.salesManagers,
      })
    : "";

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Report copied");
    } catch {
      showToast("Could not copy");
    }
  };

  const openWhatsApp = (text: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const metricList: { label: string; value: number | undefined; color?: string }[] =
    view === "team" && team
      ? [
          { label: "Total Leads", value: team.totals.newLeads },
          { label: "Total Calls", value: team.totals.calls },
          { label: "Connected", value: team.totals.connected },
          { label: "Qualified", value: team.totals.qualified },
          { label: "Visits Booked", value: team.totals.visitsBooked },
          { label: "Visits Completed", value: team.totals.visitsCompleted },
          { label: "Negotiations", value: team.totals.negotiations },
          { label: "Bookings", value: team.totals.bookings },
        ]
      : my.role === "caller"
        ? [
            { label: "New Leads", value: my.metrics.newLeads },
            { label: "Calls Made", value: my.metrics.calls },
            { label: "Connected", value: my.metrics.connected, color: "text-green-700" },
            { label: "Qualified", value: my.metrics.qualified, color: "text-emerald-700" },
            { label: "Assigned to SM", value: my.metrics.assigned },
            { label: "No Response", value: my.metrics.noResponse },
            { label: "Follow-ups Completed", value: my.metrics.followUpsCompleted },
          ]
        : [
            { label: "New Leads Assigned", value: my.metrics.assigned },
            { label: "Calls Made", value: my.metrics.calls },
            { label: "Connected", value: my.metrics.connected, color: "text-green-700" },
            { label: "Qualified", value: my.metrics.qualified, color: "text-emerald-700" },
            { label: "Follow-ups Completed", value: my.metrics.followUpsCompleted },
            { label: "Visits Booked", value: my.metrics.visitsBooked },
            { label: "Visits Completed", value: my.metrics.visitsCompleted },
            { label: "Negotiations", value: my.metrics.negotiations },
            { label: "Bookings", value: my.metrics.bookings, color: "text-green-700" },
          ];

  const totalActivity = metricList.reduce((sum, m) => sum + (m.value || 0), 0);

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed left-1/2 top-16 z-[100] -translate-x-1/2 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-2xl">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Daily Report</h1>
          <p className="mt-0.5 text-xs text-muted">Asia/Kolkata (IST) based daily activity</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => copyText(view === "team" ? teamText : myText)}>
            COPY REPORT
          </Button>
          <Button
            size="sm"
            onClick={() =>
              setPreview({
                title: view === "team" ? "Team Daily Report" : "Daily Report",
                text: view === "team" ? teamText : myText,
              })
            }
          >
            SHARE REPORT
          </Button>
        </div>
      </div>

      {isAdmin && (
        <div className="flex gap-2">
          <button
            onClick={() => changeView("my")}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${view === "my" ? "bg-primary text-white" : "border border-border bg-white text-muted"}`}
          >
            MY REPORT
          </button>
          <button
            onClick={() => changeView("team")}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${view === "team" ? "bg-primary text-white" : "border border-border bg-white text-muted"}`}
          >
            TEAM REPORT
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => applyDate(shiftDate(date, -1))}>
          ← Previous Day
        </Button>
        <span className="text-sm font-bold text-navy">{formatReportDate(date)}</span>
        <Button size="sm" variant="ghost" onClick={() => applyDate(shiftDate(date, 1))}>
          Next Day →
        </Button>
        <Button size="sm" variant="ghost" onClick={() => applyDate(initialMy.date)}>
          Today
        </Button>
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs text-navy"
          />
          <Button size="sm" variant="ghost" disabled={!customDate} onClick={() => applyDate(customDate)}>
            GO
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : totalActivity === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-6 text-center">
          <p className="text-sm font-semibold text-navy">No activity recorded today</p>
          <p className="mt-1 text-xs text-muted">
            {view === "team" ? "Team activity" : "Your activity"} shows 0 for this date.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
          {metricList.map((m) => (
            <div key={m.label} className="rounded-2xl border border-border bg-white p-3">
              <div className={`text-2xl font-bold ${m.color || "text-navy"}`}>{m.value ?? 0}</div>
              <div className="mt-0.5 text-[11px] font-semibold text-muted">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Team breakdown */}
      {view === "team" && team && !loading && (
        <div className="space-y-4">
          {team.callers.length > 0 && (
            <div className="rounded-2xl border border-border bg-white p-4">
              <h2 className="mb-2 text-sm font-bold text-primary">Callers</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-muted">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wide">
                      <th className="py-1.5 pr-2">Name</th>
                      <th className="px-2 py-1.5">Leads</th>
                      <th className="px-2 py-1.5">Calls</th>
                      <th className="px-2 py-1.5">Connected</th>
                      <th className="px-2 py-1.5">Qualified</th>
                      <th className="px-2 py-1.5">Assigned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.callers.map((c) => (
                      <tr key={c.id} className="border-b border-border/50">
                        <td className="py-2 pr-2 font-semibold text-navy">{c.name}</td>
                        <td className="px-2 py-2">{c.metrics.newLeads}</td>
                        <td className="px-2 py-2">{c.metrics.calls}</td>
                        <td className="px-2 py-2">{c.metrics.connected}</td>
                        <td className="px-2 py-2">{c.metrics.qualified}</td>
                        <td className="px-2 py-2">{c.metrics.assigned}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {team.salesManagers.length > 0 && (
            <div className="rounded-2xl border border-border bg-white p-4">
              <h2 className="mb-2 text-sm font-bold text-primary">Sales Managers</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-muted">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wide">
                      <th className="py-1.5 pr-2">Name</th>
                      <th className="px-2 py-1.5">Assigned</th>
                      <th className="px-2 py-1.5">Calls</th>
                      <th className="px-2 py-1.5">Visits</th>
                      <th className="px-2 py-1.5">Visits Done</th>
                      <th className="px-2 py-1.5">Negotiations</th>
                      <th className="px-2 py-1.5">Bookings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.salesManagers.map((s) => (
                      <tr key={s.id} className="border-b border-border/50">
                        <td className="py-2 pr-2 font-semibold text-navy">{s.name}</td>
                        <td className="px-2 py-2">{s.metrics.assigned}</td>
                        <td className="px-2 py-2">{s.metrics.calls}</td>
                        <td className="px-2 py-2">{s.metrics.visitsBooked}</td>
                        <td className="px-2 py-2">{s.metrics.visitsCompleted}</td>
                        <td className="px-2 py-2">{s.metrics.negotiations}</td>
                        <td className="px-2 py-2">{s.metrics.bookings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview / Share sheet */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="mb-2 text-sm font-bold text-primary">{preview.title}</h3>
            <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-navy">
              {preview.text}
            </pre>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => { copyText(preview.text); setPreview(null); }}>
                COPY REPORT
              </Button>
              <Button size="sm" variant="whatsapp" onClick={() => { openWhatsApp(preview.text); setPreview(null); }}>
                OPEN WHATSAPP
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                CLOSE
              </Button>
            </div>
          </div>
        </div>
      )}

      <Badge className="bg-primary/5 text-primary">Definitions match the caller/SM dashboard KPIs</Badge>
    </div>
  );
}