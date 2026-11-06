"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConversionFunnel, FunnelSlice } from "@/lib/crm/reports";

const input =
  "rounded-xl border border-border bg-white px-3 py-1.5 text-sm text-navy outline-none focus:border-primary";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-background px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-base font-bold text-navy">{value}</p>
    </div>
  );
}

function pctLabel(value: number): string {
  return `${value}%`;
}

function FunnelTable({ title, rows }: { title: string; rows: FunnelSlice[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-navy">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
              <th className="px-2 py-1.5">{title}</th>
              <th className="px-2 py-1.5 text-right">Leads</th>
              <th className="px-2 py-1.5 text-right">Graded</th>
              <th className="px-2 py-1.5 text-right">A / B / C</th>
              <th className="px-2 py-1.5 text-right">A share</th>
              <th className="px-2 py-1.5 text-right">Visit booked</th>
              <th className="px-2 py-1.5 text-right">Visit done</th>
              <th className="px-2 py-1.5 text-right">Booked</th>
              <th className="px-2 py-1.5 text-right">Lost</th>
              <th className="px-2 py-1.5">Top lost reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-2 py-3 text-center text-muted">
                  No leads in this window.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border/50 last:border-0">
                <td className="px-2 py-1.5 font-semibold text-navy">{row.label}</td>
                <td className="px-2 py-1.5 text-right">{row.totalLeads}</td>
                <td className="px-2 py-1.5 text-right">{row.graded}</td>
                <td className="px-2 py-1.5 text-right">
                  <span className="text-emerald-700">{row.gradeA}</span>
                  {" / "}
                  <span className="text-amber-700">{row.gradeB}</span>
                  {" / "}
                  <span className="text-slate-600">{row.gradeC}</span>
                </td>
                <td className="px-2 py-1.5 text-right">{pctLabel(row.aSharePct)}</td>
                <td className="px-2 py-1.5 text-right">
                  {row.visitsBooked} <span className="text-muted">({pctLabel(row.visitBookedPct)})</span>
                </td>
                <td className="px-2 py-1.5 text-right">
                  {row.visitsDone} <span className="text-muted">({pctLabel(row.visitDonePct)})</span>
                </td>
                <td className="px-2 py-1.5 text-right">
                  {row.booked} <span className="text-muted">({pctLabel(row.bookingPct)})</span>
                </td>
                <td className="px-2 py-1.5 text-right">
                  {row.lost} <span className="text-muted">({pctLabel(row.lostPct)})</span>
                </td>
                <td className="px-2 py-1.5 text-muted">
                  {row.lostReasons[0]
                    ? `${row.lostReasons[0].reason} (${row.lostReasons[0].count})`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ConversionFunnelReport() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<ConversionFunnel | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (fromDate?: string, toDate?: string) => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/crm/api/conversion/funnel?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not load the funnel");
        return;
      }
      setData(json);
      setFrom(json.from);
      setTo(json.to);
    } catch {
      setError("Could not load the funnel");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <section className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-primary">Vasai West conversion funnel</h2>
          <p className="text-xs text-muted">
            Grade mix, visit show-up and booking rate, and lost reasons by caller, SM and pitched project.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
          <span className="text-xs text-muted">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
          <button
            type="button"
            onClick={() => load(from, to)}
            className="rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-secondary"
          >
            Apply
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

      {data && (
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Metric label="Leads" value={data.overall.totalLeads} />
            <Metric label="Graded" value={data.overall.graded} />
            <Metric label="A share" value={pctLabel(data.overall.aSharePct)} />
            <Metric label="Visit booked" value={pctLabel(data.overall.visitBookedPct)} />
            <Metric label="Visit done" value={pctLabel(data.overall.visitDonePct)} />
            <Metric label="Booking" value={pctLabel(data.overall.bookingPct)} />
            <Metric label="Lost" value={pctLabel(data.overall.lostPct)} />
          </div>

          {data.overall.lostReasons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.overall.lostReasons.map((reason) => (
                <span
                  key={reason.reason}
                  className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"
                >
                  {reason.reason} · {reason.count}
                </span>
              ))}
            </div>
          )}

          <FunnelTable title="Caller" rows={data.perCaller} />
          <FunnelTable title="Sales manager" rows={data.perSm} />
          <FunnelTable title="Pitched project" rows={data.perProject} />
        </div>
      )}
    </section>
  );
}
