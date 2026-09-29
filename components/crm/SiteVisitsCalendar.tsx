"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "./ui";
import ContactMaskingBanner from "./ContactMaskingBanner";

type ContactMasking = {
  active: boolean;
  withinOfficeHours: boolean;
  banner: string | null;
};

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
  /** Set by the API when the number is masked because it is outside hours. */
  contactHidden?: boolean;
};

type ViewMode = "month" | "week" | "agenda";

/** Events shown per day before the overflow control appears. */
const MAX_PER_DAY = 4;

/** Statuses that are still "open" - i.e. nobody has closed the loop yet. */
const OPEN_STATUSES = ["proposed", "booked", "confirmed", "arrived"];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Tone = {
  key: string;
  label: string;
  chip: string;
  badge: string;
  dot: string;
  strike: boolean;
};

/**
 * Resolves the *display* state of a visit.
 *
 * The database only stores the raw status, so a past visit that is still
 * `booked`/`confirmed` is really "not marked done" - it never got closed out.
 * That distinction is derived here at render time only; no status is written
 * back to the database.
 */
function visitState(status: string, date: string, today: string): Tone {
  const isPast = date < today;
  const stillOpen = OPEN_STATUSES.includes(status);

  if (isPast && stillOpen) {
    return {
      key: "not_done",
      label: "Not marked done",
      chip: "border-amber-300 bg-amber-50 text-amber-900",
      badge: "bg-amber-100 text-amber-900",
      dot: "bg-amber-500",
      strike: false,
    };
  }

  switch (status) {
    case "visit_done":
      return {
        key: "done",
        label: "Visit Done",
        chip: "border-green-300 bg-green-50 text-green-900",
        badge: "bg-green-100 text-green-800",
        dot: "bg-green-600",
        strike: false,
      };
    case "confirmed":
    case "arrived":
      return {
        key: "confirmed",
        label: status === "arrived" ? "Arrived" : "Confirmed",
        chip: "border-blue-300 bg-blue-50 text-blue-900",
        badge: "bg-blue-100 text-blue-900",
        dot: "bg-blue-600",
        strike: false,
      };
    case "booked":
    case "proposed":
      return {
        key: "scheduled",
        label: status === "proposed" ? "Proposed" : "Booked",
        chip: "border-sky-300 bg-sky-50 text-sky-900",
        badge: "bg-sky-100 text-sky-900",
        dot: "bg-sky-500",
        strike: false,
      };
    case "no_show":
      return {
        key: "no_show",
        label: "No Show",
        chip: "border-red-300 bg-red-50 text-red-900",
        badge: "bg-red-100 text-red-800",
        dot: "bg-red-600",
        strike: false,
      };
    case "cancelled":
      return {
        key: "cancelled",
        label: "Cancelled",
        chip: "border-red-200 bg-red-50/60 text-red-700",
        badge: "bg-red-50 text-red-700",
        dot: "bg-red-400",
        strike: true,
      };
    case "rescheduled":
      return {
        key: "rescheduled",
        label: "Rescheduled",
        chip: "border-violet-300 bg-violet-50 text-violet-900",
        badge: "bg-violet-100 text-violet-900",
        dot: "bg-violet-600",
        strike: false,
      };
    default:
      return {
        key: "other",
        label: status ? status.replace(/_/g, " ") : "—",
        chip: "border-border bg-background text-muted",
        badge: "bg-background text-muted",
        dot: "bg-slate-400",
        strike: false,
      };
  }
}

const LEGEND: { key: string; label: string; dot: string }[] = [
  { key: "done", label: "Done", dot: "bg-green-600" },
  { key: "confirmed", label: "Confirmed", dot: "bg-blue-600" },
  { key: "scheduled", label: "Booked", dot: "bg-sky-500" },
  { key: "not_done", label: "Not marked done", dot: "bg-amber-500" },
  { key: "no_show", label: "Missed", dot: "bg-red-600" },
  { key: "cancelled", label: "Cancelled", dot: "bg-red-400" },
];

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
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function SiteVisitsCalendar() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewMode>("month");
  const [viewPinned, setViewPinned] = useState(false);
  const [cursor, setCursor] = useState(todayIst());
  const [deleting, setDeleting] = useState<number | null>(null);
  const [smFilter, setSmFilter] = useState<number | "all">("all");
  const [quick, setQuick] = useState<Visit | null>(null);
  const [overflow, setOverflow] = useState<{ date: string; x: number; y: number } | null>(null);
  const [masking, setMasking] = useState<ContactMasking | null>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/crm/api/site-visits", { cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (active) {
          setVisits(data.visits || []);
          if (data.contactMasking) setMasking(data.contactMasking);
        }
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

  // Phones get the agenda list by default; tablets/desktops get the month grid.
  // An explicit view choice pins the selection and stops the resize handler
  // from overriding it.
  //
  // Agenda is the default below md (768px), matching the app's own mobile
  // breakpoint. The month grid needs more than a 375px phone can give it: times
  // truncate to "16:...", and a busy day collapses into a "+7 more" control
  // that is far too small a target to hit reliably.
  useEffect(() => {
    if (viewPinned) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setView(mq.matches ? "agenda" : "month");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [viewPinned]);

  // Click-outside for the overflow popover.
  useEffect(() => {
    if (!overflow) return;
    const onDown = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflow(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOverflow(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [overflow]);

  const today = todayIst();

  const cancelVisit = async (visitId: number) => {
    if (!window.confirm("Cancel this site visit?")) return;
    setDeleting(visitId);
    try {
      const res = await fetch("/crm/api/site-visits", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId }),
      });
      if (res.ok) {
        setVisits((prev) =>
          prev.map((v) => (v.id === visitId ? { ...v, status: "cancelled" } : v))
        );
        setQuick(null);
      }
    } finally {
      setDeleting(null);
    }
  };

  const sms = useMemo(() => {
    const map = new Map<number, string>();
    for (const v of visits) if (v.smId) map.set(v.smId, v.smName || `SM ${v.smId}`);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [visits]);

  const filtered = useMemo(
    () => (smFilter === "all" ? visits : visits.filter((v) => v.smId === smFilter)),
    [visits, smFilter]
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const v of filtered) {
      const list = map.get(v.date);
      if (list) list.push(v);
      else map.set(v.date, [v]);
    }
    return map;
  }, [filtered]);

  const cells = useMemo(() => {
    if (view === "week") {
      const start = mondayOf(cursor);
      return Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), inMonth: true }));
    }
    const d = parseYmd(cursor);
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
    const offset = (first.getUTCDay() + 6) % 7;
    const start = ymd(new Date(first.getTime() - offset * 86400000));
    const month = d.getUTCMonth();
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(start, i);
      return { date, inMonth: parseYmd(date).getUTCMonth() === month };
    });
  }, [view, cursor]);

  const monthCells = useMemo(() => {
    const d = parseYmd(cursor);
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
    const offset = (first.getUTCDay() + 6) % 7;
    const start = ymd(new Date(first.getTime() - offset * 86400000));
    const month = d.getUTCMonth();
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(start, i);
      return { date, inMonth: parseYmd(date).getUTCMonth() === month };
    });
  }, [cursor]);

  const shift = (dir: number) => {
    if (view === "week") {
      setCursor(addDays(cursor, dir * 7));
      return;
    }
    const d = parseYmd(cursor);
    setCursor(ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1, 12))));
  };

  const rangeLabel =
    view === "week"
      ? `${dayLabel(mondayOf(cursor))} – ${dayLabel(addDays(mondayOf(cursor), 6))}`
      : monthLabel(cursor);

  // Agenda scope: every day of the cursor month that has visits.
  //
  // Chronological, oldest first. The previous most-recent-first ordering ran
  // the list backwards on a phone: today landed in the middle of the scroll and
  // the visits you could still act on were all the way at the bottom.
  const agendaDays = useMemo(() => {
    const d = parseYmd(cursor);
    const days: string[] = [];
    for (let i = 0; i < 31; i++) {
      const date = ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1 + i, 12)));
      if (parseYmd(date).getUTCMonth() !== d.getUTCMonth()) break;
      const list = byDate.get(date);
      if (list && list.length) days.push(date);
    }
    return days;
  }, [cursor, byDate]);

  const scopedDates = useMemo(
    () => new Set((view === "week" ? cells : monthCells).map((c) => c.date)),
    [cells, monthCells, view]
  );
  const inRange = filtered.filter((v) => scopedDates.has(v.date));

  const counts = useMemo(() => {
    const c = { done: 0, upcoming: 0, notDone: 0, missed: 0 };
    for (const v of inRange) {
      const t = visitState(v.status, v.date, today);
      if (t.key === "done") c.done++;
      else if (t.key === "not_done") c.notDone++;
      else if (t.key === "no_show" || t.key === "cancelled") c.missed++;
      else if (v.date >= today) c.upcoming++;
    }
    return c;
  }, [inRange, today]);

  const openOverflow = (e: React.MouseEvent, date: string) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOverflow({ date, x: r.left, y: r.bottom + 4 });
  };

  const EventChip = ({ v, dense }: { v: Visit; dense?: boolean }) => {
    const tone = visitState(v.status, v.date, today);
    return (
      <div className="group flex items-center">
        <button
          type="button"
          onClick={() => setQuick(v)}
          title={`${v.customerName || "Visit"} · ${v.projectName || "No project"} · ${tone.label}`}
          className={`min-w-0 flex-1 truncate rounded-md border px-1.5 font-semibold text-left ${
            dense ? "py-0.5 text-[10px]" : "py-1 text-[11px]"
          } ${tone.chip} ${tone.strike ? "line-through" : ""} hover:brightness-95`}
        >
          {!dense && v.time ? <span className="opacity-70">{v.time} </span> : null}
          {v.customerName || v.projectName || "Visit"}
        </button>
        {v.status !== "cancelled" && v.status !== "visit_done" && (
          <button
            type="button"
            disabled={deleting === v.id}
            onClick={(e) => {
              e.stopPropagation();
              cancelVisit(v.id);
            }}
            className="ml-0.5 hidden shrink-0 rounded p-0.5 text-red-400 hover:bg-red-50 hover:text-red-600 group-hover:inline-flex disabled:opacity-50"
            title="Cancel visit"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <ContactMaskingBanner masking={masking} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border bg-white p-0.5">
            {(["month", "week", "agenda"] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setView(v);
                  setViewPinned(true);
                }}
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
            aria-label="Previous"
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
            aria-label="Next"
          >
            Next →
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sms.length > 1 && (
            <select
              value={String(smFilter)}
              onChange={(e) => setSmFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy"
              aria-label="Filter by sales manager"
            >
              <option value="all">All sales managers</option>
              {sms.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <div className="text-sm font-bold text-navy">{rangeLabel}</div>
        </div>
      </div>

      {/* Count pills. Scrolls sideways on a phone instead of wrapping onto
          three ragged lines above the agenda. */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0">
        <span className="shrink-0 rounded-lg bg-white px-3 py-1.5 font-semibold text-navy shadow-sm">
          {inRange.length} in view
        </span>
        <span className="shrink-0 rounded-lg bg-green-50 px-3 py-1.5 font-semibold text-green-700">
          {counts.done} done
        </span>
        <span className="shrink-0 rounded-lg bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
          {counts.upcoming} upcoming
        </span>
        {counts.notDone > 0 && (
          <span className="shrink-0 rounded-lg bg-amber-50 px-3 py-1.5 font-semibold text-amber-800">
            {counts.notDone} not marked done
          </span>
        )}
        {counts.missed > 0 && (
          <span className="shrink-0 rounded-lg bg-red-50 px-3 py-1.5 font-semibold text-red-700">
            {counts.missed} missed
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
        {LEGEND.map((l) => (
          <span key={l.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${l.dot}`} />
            {l.label}
          </span>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading site visits...</p>
      ) : error ? (
        <p className="py-10 text-center text-sm text-red-600">{error}</p>
      ) : view === "agenda" ? (
        <div className="space-y-4">
          {agendaDays.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No site visits in {monthLabel(cursor)}.</p>
          ) : (
            agendaDays.map((date) => {
              const isToday = date === today;
              return (
              <div
                key={date}
                className={`rounded-2xl border bg-white p-3 ${
                  isToday ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
                }`}
              >
                {/* Today carries a purple label and a rule under it, so it is
                    findable partway down a long agenda. */}
                <div className={`mb-2 flex items-center gap-2 text-xs font-bold ${isToday ? "text-primary" : "text-navy"}`}>
                  <span>{dayLabel(date)}</span>
                  {isToday && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                      Today
                    </span>
                  )}
                  {isToday && <span className="h-px flex-1 bg-primary/30" />}
                </div>
                <div className="space-y-2">
                  {(byDate.get(date) || []).map((v) => {
                    const tone = visitState(v.status, v.date, today);
                    return (
                      <div key={v.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => setQuick(v)}
                          className="block w-full rounded-xl border border-border bg-white p-2.5 text-left transition-colors hover:border-primary/30"
                        >
                          {/* Full-width row: time, name, project and a status
                              dot. Deliberately not truncated - the month grid
                              was cutting times down to "16...". */}
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 text-xs font-bold text-navy">
                              {v.time || "TBD"}
                            </span>
                            <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                            <span
                              className={`text-[11px] font-semibold ${tone.strike ? "line-through" : ""}`}
                            >
                              {tone.label}
                            </span>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-navy">
                            {v.customerName || "Lead"}
                          </div>
                          <div className="text-xs text-muted">
                            {v.projectName || "Project TBD"}
                          </div>
                          {v.smName && (
                            <div className="text-[11px] text-soft">SM: {v.smName}</div>
                          )}
                        </button>
                        {v.status !== "cancelled" && v.status !== "visit_done" && (
                          <button
                            type="button"
                            disabled={deleting === v.id}
                            onClick={() => cancelVisit(v.id)}
                            className="absolute right-1.5 top-1.5 rounded-md bg-white/90 p-1 text-red-400 shadow-sm hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            title="Cancel visit"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })
          )}
        </div>
      ) : (
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

          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const dayVisits = byDate.get(cell.date) || [];
              const isToday = cell.date === today;
              const shown = dayVisits.slice(0, MAX_PER_DAY);
              const hidden = dayVisits.length - shown.length;
              return (
                <div
                  key={cell.date}
                  className={`min-h-[96px] border-b border-r border-border/60 p-1.5 last:border-r-0 ${
                    cell.inMonth ? "bg-white" : "bg-background/40"
                  } ${isToday ? "bg-primary/[0.04]" : ""}`}
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
                    {shown.map((v) => (
                      <EventChip key={v.id} v={v} dense={view === "month"} />
                    ))}
                    {hidden > 0 && (
                      <button
                        type="button"
                        onClick={(e) => openOverflow(e, cell.date)}
                        className="w-full rounded-md border border-dashed border-border px-1.5 py-0.5 text-[10px] font-bold text-muted hover:border-primary/40 hover:text-primary"
                      >
                        +{hidden} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visits.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          No site visits scheduled yet. Book one from a lead to see it here.
        </p>
      )}

      {overflow && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOverflow(null)} />
          <div
            ref={overflowRef}
            className="fixed z-50 w-[240px] max-w-[calc(100vw-24px)] rounded-xl border border-border bg-white p-2 shadow-xl"
            style={{
              left: Math.min(overflow.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 252),
              top: overflow.y,
            }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
              <span className="text-[11px] font-bold text-navy">{dayLabel(overflow.date)}</span>
              <button
                type="button"
                onClick={() => setOverflow(null)}
                className="text-soft hover:text-navy"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-[300px] space-y-1 overflow-y-auto">
              {(byDate.get(overflow.date) || []).slice(MAX_PER_DAY).map((v) => (
                <EventChip key={v.id} v={v} />
              ))}
            </div>
          </div>
        </>
      )}

      {quick && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-4"
          onClick={() => setQuick(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-navy">
                  {quick.customerName || "Lead"}
                </div>
                <div className="text-[11px] text-muted">{quick.projectName || "Project TBD"}</div>
              </div>
              <button
                type="button"
                onClick={() => setQuick(null)}
                className="rounded-lg p-1 text-soft hover:bg-background hover:text-navy"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <Badge color={visitState(quick.status, quick.date, today).badge}>
                {visitState(quick.status, quick.date, today).label}
              </Badge>
              {quick.time && <Badge color="bg-background text-navy">{quick.time}</Badge>}
            </div>

            <dl className="mb-4 space-y-1.5 text-[11px]">
              {[
                ["Date", dayLabel(quick.date)],
                ["Sales manager", quick.smName || "—"],
                ["Meeting point", quick.meetingPoint || "—"],
                ["Property shown", quick.propertyShown || "—"],
                ["Phone", quick.phone || "—"],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-border/60 pb-1.5">
                  <dt className="shrink-0 text-muted">{k}</dt>
                  <dd
                    className={`truncate text-right font-semibold ${
                      k === "Phone" && quick.contactHidden ? "text-amber-700" : "text-navy"
                    }`}
                  >
                    {val}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="flex gap-2">
              <Link
                href={`/crm/leads/${quick.leadId}`}
                className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-center text-xs font-semibold text-white hover:bg-primary/90"
              >
                Open lead
              </Link>
              {quick.status !== "cancelled" && quick.status !== "visit_done" && (
                <button
                  type="button"
                  disabled={deleting === quick.id}
                  onClick={() => cancelVisit(quick.id)}
                  className="rounded-xl border border-border px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting === quick.id ? "..." : "Cancel"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
