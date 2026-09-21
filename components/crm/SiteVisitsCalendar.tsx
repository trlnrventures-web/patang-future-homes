"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "./ui";

type Visit = {
  id: number;
  leadId: number;
  customerName: string;
  phone: string;
  leadStatus: string;
  projectId: string | null;
  projectName: string;
  smId: number;
  smName: string;
  date: string;
  time: string;
  status: string;
  meetingPoint: string;
  propertyShown: string;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function addDays(s: string, delta: number): string {
  const d = parseYmd(s);
  d.setUTCDate(d.getUTCDate() + delta);
  return ymd(d);
}

function mondayOf(s: string): string {
  const d = parseYmd(s);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(s, -dow);
}

function monthLabel(s: string): string {
  return parseYmd(s).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dayLabel(s: string): string {
  return parseYmd(s).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function statusMeta(status: string): { label: string; cls: string } {
  switch (status) {
    case "proposed":
      return { label: "Proposed", cls: "bg-cyan-100 text-cyan-800" };
    case "booked":
      return { label: "Booked", cls: "bg-teal-100 text-teal-800" };
    case "confirmed":
      return { label: "Confirmed", cls: "bg-teal-200 text-teal-900" };
    case "arrived":
      return { label: "Arrived", cls: "bg-sky-100 text-sky-800" };
    case "visit_done":
      return { label: "Visit Done", cls: "bg-green-100 text-green-800" };
    case "no_show":
      return { label: "No Show", cls: "bg-red-100 text-red-700" };
    case "cancelled":
      return { label: "Cancelled", cls: "bg-slate-100 text-slate-600" };
    default:
      return { label: status || "—", cls: "bg-background text-muted" };
  }
}

function chipCls(status: string): string {
  switch (status) {
    case "visit_done":
      return "border-green-200 bg-green-50 text-green-900";
    case "confirmed":
    case "booked":
    case "arrived":
      return "border-teal-200 bg-teal-50 text-teal-900";
    case "no_show":
      return "border-red-200 bg-red-50 text-red-800";
    case "cancelled":
      return "border-slate-200 bg-slate-50 text-slate-500 line-through";
    default:
      return "border-cyan-200 bg-cyan-50 text-cyan-900";
  }
}

export default function SiteVisitsCalendar() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(todayIst());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/crm/api/site-visits", { cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (active) setVisits(data.visits || []);
      } catch {
        if (active) setError("Could not load site visits.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const v of visits) {
      const key = v.date || "";
      const list = map.get(key);
      if (list) list.push(v);
      else map.set(key, [v]);
    }
    return map;
  }, [visits]);

  const cells = useMemo(() => {
    if (view === "month") {
      const d = parseYmd(cursor);
      const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
      const offset = (first.getUTCDay() + 6) % 7;
      const start = ymd(new Date(first.getTime() - offset * 86400000));
      const month = d.getUTCMonth();
      return Array.from({ length: 42 }, (_, i) => {
        const date = addDays(start, i);
        return { date, inMonth: parseYmd(date).getUTCMonth() === month };
      });
    }
    const start = mondayOf(cursor);
    return Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), inMonth: true }));
  }, [view, cursor]);

  const rangeLabel =
    view === "month"
      ? monthLabel(cursor)
      : `${dayLabel(mondayOf(cursor))} – ${dayLabel(addDays(mondayOf(cursor), 6))}`;

  const shift = (dir: number) => {
    if (view === "month") {
      const d = parseYmd(cursor);
      setCursor(ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1, 12))));
    } else {
      setCursor(addDays(cursor, dir * 7));
    }
  };

  const today = todayIst();

  const visibleDates = useMemo(() => new Set(cells.map((c) => c.date)), [cells]);
  const inRange = visits.filter((v) => visibleDates.has(v.date));
  const doneCount = inRange.filter((v) => v.status === "visit_done").length;
  const upcomingCount = inRange.filter((v) =>
    ["proposed", "booked", "confirmed", "arrived"].includes(v.status)
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-border bg-white p-0.5">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                  view === v ? "bg-primary text-white" : "text-muted hover:text-primary"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => shift(-1)}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30"
          >
            ← Prev
          </button>
          <button
            onClick={() => setCursor(today)}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30"
          >
            Today
          </button>
          <button
            onClick={() => shift(1)}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-primary/30"
          >
            Next →
          </button>
        </div>
        <div className="text-sm font-bold text-navy">{rangeLabel}</div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="rounded-lg bg-white px-3 py-1.5 font-semibold text-navy shadow-sm">
          {inRange.length} in view
        </span>
        <span className="rounded-lg bg-green-50 px-3 py-1.5 font-semibold text-green-700">
          {doneCount} done
        </span>
        <span className="rounded-lg bg-teal-50 px-3 py-1.5 font-semibold text-teal-700">
          {upcomingCount} upcoming
        </span>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading site visits...</p>
      ) : error ? (
        <p className="py-10 text-center text-sm text-red-600">{error}</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="grid grid-cols-7 border-b border-border bg-background/60">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted"
                >
                  {d}
                </div>
              ))}
            </div>

            {view === "month" ? (
              <div className="grid grid-cols-7">
                {cells.map((cell) => {
                  const dayVisits = byDate.get(cell.date) || [];
                  const isToday = cell.date === today;
                  return (
                    <div
                      key={cell.date}
                      className={`min-h-[96px] border-b border-r border-border/60 p-1.5 last:border-r-0 ${
                        cell.inMonth ? "bg-white" : "bg-background/40"
                      }`}
                    >
                      <div
                        className={`mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                          isToday
                            ? "bg-primary text-white"
                            : cell.inMonth
                              ? "text-navy"
                              : "text-soft"
                        }`}
                      >
                        {parseYmd(cell.date).getUTCDate()}
                      </div>
                      <div className="space-y-1">
                        {dayVisits.slice(0, 3).map((v) => (
                          <Link
                            key={v.id}
                            href={`/crm/leads/${v.leadId}`}
                            className={`block truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${chipCls(
                              v.status
                            )}`}
                            title={`${v.customerName} · ${v.projectName} · ${statusMeta(v.status).label}`}
                          >
                            {v.time ? `${v.time} ` : ""}
                            {v.customerName || v.projectName || "Visit"}
                          </Link>
                        ))}
                        {dayVisits.length > 3 && (
                          <div className="px-1 text-[10px] font-semibold text-soft">
                            +{dayVisits.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-7 sm:divide-x sm:divide-y-0">
                {cells.map((cell) => {
                  const dayVisits = byDate.get(cell.date) || [];
                  const isToday = cell.date === today;
                  return (
                    <div key={cell.date} className="min-h-[140px] p-2">
                      <div
                        className={`mb-2 flex items-center gap-1.5 text-xs font-bold ${
                          isToday ? "text-primary" : "text-navy"
                        }`}
                      >
                        <span
                          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 ${
                            isToday ? "bg-primary text-white" : "bg-background"
                          }`}
                        >
                          {parseYmd(cell.date).getUTCDate()}
                        </span>
                        {dayLabel(cell.date)}
                      </div>
                      <div className="space-y-2">
                        {dayVisits.length === 0 ? (
                          <p className="text-[11px] text-soft">—</p>
                        ) : (
                          dayVisits.map((v) => (
                            <Link
                              key={v.id}
                              href={`/crm/leads/${v.leadId}`}
                              className="block rounded-xl border border-border bg-white p-2 transition-colors hover:border-primary/30"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-bold text-navy">
                                  {v.time || "TBD"}
                                </span>
                                <Badge color={statusMeta(v.status).cls}>
                                  {statusMeta(v.status).label}
                                </Badge>
                              </div>
                              <div className="mt-1 truncate text-xs font-semibold text-navy">
                                {v.customerName || "Lead"}
                              </div>
                              <div className="truncate text-[11px] text-muted">
                                {v.projectName || "Project TBD"}
                              </div>
                              {v.smName && (
                                <div className="truncate text-[10px] text-soft">SM: {v.smName}</div>
                              )}
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {visits.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              No site visits scheduled yet. Book one from a lead to see it here.
            </p>
          )}
        </>
      )}
    </div>
  );
}
