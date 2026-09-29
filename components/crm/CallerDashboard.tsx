"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { PhoneIcon, WhatsAppIcon } from "./ui";
import { sourceLabel } from "@/lib/crm/board-shared";
import { formatPhoneForWhatsApp } from "@/lib/crm/messages";
import { formatReportDate } from "@/lib/crm/report-text";
import CallQueue from "./CallQueue";
import type { CallQueueItem } from "@/app/crm/api/call-queue/route";

type Card = {
  id: number;
  name: string;
  phone: string;
  whatsappNumber: string | null;
  source: string;
  originalProject: string | null;
  preferredProject: string | null;
  nextAction: string;
  nextFollowUp: string;
  nextFollowUpIso: string | null;
  hasOverdueFollowUp: boolean;
};

type Queues = {
  callNow: Card[];
  followUpsToday: Card[];
  overdue: Card[];
  newToday: Card[];
  noResponse: Card[];
};

type Counts = {
  callNow: number;
  followUpsToday: number;
  overdue: number;
  newToday: number;
  noResponse: number;
};

type TileKey = "callNow" | "followUpsToday" | "overdue";

const ROWS_BEFORE_EXPANDING = 10;

const TILES: { key: TileKey; label: string }[] = [
  { key: "callNow", label: "Call Now" },
  { key: "followUpsToday", label: "Follow-ups Today" },
  { key: "overdue", label: "Overdue" },
];

/** Only these two are listed. New Today and No Response live in the Leads board. */
const SECTIONS: { key: "callNow" | "followUpsToday"; title: string; empty: string }[] = [
  { key: "callNow", title: "Call Now", empty: "No urgent call pending right now" },
  { key: "followUpsToday", title: "Follow-ups Today", empty: "No follow-ups scheduled today" },
];

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function CallerDashboard({ name }: { name: string }) {
  const [queues, setQueues] = useState<Queues>({
    callNow: [],
    followUpsToday: [],
    overdue: [],
    newToday: [],
    noResponse: [],
  });
  const [counts, setCounts] = useState<Counts | null>(null);
  const [istDate, setIstDate] = useState("");
  const [greeting, setGreeting] = useState("Good morning");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tile, setTile] = useState<TileKey | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showQueue, setShowQueue] = useState(false);

  // Lead quality lineup: a separate filtered list, with its own search.
  const [quality, setQuality] = useState<CallQueueItem[]>([]);
  const [qualityTotal, setQualityTotal] = useState(0);
  const [qualityQuery, setQualityQuery] = useState("");
  const [qualityExpanded, setQualityExpanded] = useState(false);
  const [showQualityQueue, setShowQualityQueue] = useState(false);

  // Resolved on mount rather than during render, so the server HTML and the
  // first client render agree even when they straddle an IST hour boundary.
  useEffect(() => {
    const tick = () => {
      const ist = new Date(Date.now() + (5 * 60 + 30) * 60000);
      setIstDate(ist.toISOString().slice(0, 10));
      setGreeting(greetingFor(ist.getUTCHours()));
    };
    tick();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/crm/api/caller-dashboard");
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (cancelled) return;
        setQueues(data.queues);
        setCounts(data.counts);
      } catch {
        if (!cancelled) setError("Could not load the dashboard. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // A failure here only hides the quality list, so it is not surfaced as a
  // page level error.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/crm/api/lead-quality?limit=30");
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (cancelled) return;
        setQuality(data.queue || []);
        setQualityTotal(data.total ?? (data.queue || []).length);
      } catch {
        if (!cancelled) setQuality([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const match = useCallback((c: Card) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.originalProject || "").toLowerCase().includes(q) ||
      (c.preferredProject || "").toLowerCase().includes(q)
    );
  }, [query]);

  /** Overdue first, then earliest due. Both sections use the same order. */
  const byUrgency = useCallback(
    (a: Card, b: Card) => {
      if (a.hasOverdueFollowUp !== b.hasOverdueFollowUp) {
        return a.hasOverdueFollowUp ? -1 : 1;
      }
      return (a.nextFollowUpIso || "9999").localeCompare(b.nextFollowUpIso || "9999");
    },
    []
  );

  // Which sections the current tile/search combination allows through.
  const visibleSections = useMemo(() => {
    if (tile === "callNow") return SECTIONS.filter((s) => s.key === "callNow");
    if (tile === "followUpsToday") return SECTIONS.filter((s) => s.key === "followUpsToday");
    return SECTIONS;
  }, [tile]);

  const rowsFor = useCallback(
    (key: "callNow" | "followUpsToday"): Card[] => {
      let list = queues[key].filter(match).sort(byUrgency);
      // The Overdue tile narrows both sections to overdue work only.
      if (tile === "overdue") list = list.filter((c) => c.hasOverdueFollowUp);
      return list;
    },
    [queues, match, byUrgency, tile]
  );

  const totalRows = visibleSections.reduce((sum, s) => sum + rowsFor(s.key).length, 0);

  const qualityRows = useMemo(() => {
    const q = qualityQuery.trim().toLowerCase();
    if (!q) return quality;
    return quality.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.phone || "").includes(q) ||
        l.requirementLines.join(" ").toLowerCase().includes(q)
    );
  }, [quality, qualityQuery]);

  const onTile = (key: TileKey) => setTile((t) => (t === key ? null : key));

  return (
    <div className="pb-8">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ===== Header: one greeting, one date, one primary action =====
          Mobile: "Start Calling" goes full-width as the primary action, with
          My Report / Full Inbox as a smaller row underneath. They were three
          squeezed controls in one row before, and the two secondary links were
          buried in a dropdown that was easy to miss entirely. ===== */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-navy sm:text-3xl">
              {greeting}, {name.split(" ")[0]}
            </h1>
            <p className="mt-1 text-sm text-muted">{istDate ? formatReportDate(istDate) : ""}</p>
          </div>

          <div className="hidden w-auto items-center gap-3 sm:flex">
            <button
              type="button"
              onClick={() => setShowQueue(true)}
              className="h-11 rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-secondary"
            >
              Start Calling
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                className="h-11 rounded-xl px-2 text-sm font-semibold text-muted transition-colors hover:text-primary"
              >
                More
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-border bg-white py-1 shadow-lg">
                  <Link
                    href="/crm/reports"
                    onClick={() => setMoreOpen(false)}
                    className="block px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-primary/5"
                  >
                    My Report
                  </Link>
                  <Link
                    href="/crm/leads"
                    onClick={() => setMoreOpen(false)}
                    className="block px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-primary/5"
                  >
                    Full Inbox
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:hidden">
          <button
            type="button"
            onClick={() => setShowQueue(true)}
            className="h-12 w-full rounded-xl bg-primary text-sm font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-secondary"
          >
            Start Calling
          </button>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/crm/reports"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-white text-sm font-semibold text-navy transition-colors hover:border-primary/40"
            >
              My Report
            </Link>
            <Link
              href="/crm/leads"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-white text-sm font-semibold text-navy transition-colors hover:border-primary/40"
            >
              Full Inbox
            </Link>
          </div>
        </div>
      </div>

      {/* ===== Lead quality lineup: the leads still worth calling ===== */}
      {tile === null && (
        <section className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-bold text-navy">Quality Leads</h2>
                <span className="text-sm text-muted">{qualityTotal}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                Skips anyone called today or yesterday, and any lead with a site visit or a booking.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowQualityQueue(true)}
              disabled={quality.length === 0}
              className="h-11 shrink-0 rounded-xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start Calling
            </button>
          </div>

          <input
            type="search"
            value={qualityQuery}
            onChange={(e) => setQualityQuery(e.target.value)}
            placeholder="Search quality leads by name, phone or requirement"
            className="mt-4 w-full max-w-sm rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy focus:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />

          {qualityRows.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              {qualityQuery.trim()
                ? "No quality leads match this search"
                : "No quality leads left. Every remaining lead was called recently, has a site visit, or is booked."}
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {(qualityExpanded ? qualityRows : qualityRows.slice(0, ROWS_BEFORE_EXPANDING)).map((l) => (
                <LeadRow
                  key={l.id}
                  id={l.id}
                  name={l.name}
                  phone={l.phone}
                  whatsappNumber={l.whatsappNumber}
                  line2={l.requirementLines.join("  ·  ")}
                  line3={`Added ${l.leadAge}${l.lastNote ? `  ·  ${l.lastNote}` : ""}`}
                  overdue={l.priorityGroup === "overdue"}
                />
              ))}
            </div>
          )}

          {qualityRows.length > ROWS_BEFORE_EXPANDING && (
            <button
              type="button"
              onClick={() => setQualityExpanded((v) => !v)}
              className="mt-3 text-sm font-semibold text-primary hover:underline"
            >
              {qualityExpanded
                ? "Show less"
                : `Show more (${qualityRows.length - ROWS_BEFORE_EXPANDING})`}
            </button>
          )}

          {qualityTotal > quality.length && (
            <p className="mt-3 text-sm text-muted">
              Showing the top {quality.length} of {qualityTotal}.
            </p>
          )}

          <div className="mt-3">
            <Link href="/crm/leads" className="text-sm font-semibold text-primary hover:underline">
              View all
            </Link>
          </div>
        </section>
      )}

      {/* ===== Three tiles, click to filter.
          Mobile: a 2-column grid so the tiles never wrap into an uneven
          2+2+1 with a lone orphan on the last row. Tiles are min-w-0 so the
          label truncates instead of forcing a new column. ===== */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {TILES.map((t) => {
          const active = tile === t.key;
          const isOverdue = t.key === "overdue";
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTile(t.key)}
              aria-pressed={active}
              className={`min-w-0 rounded-xl border bg-white px-4 py-3 text-left transition-colors sm:w-[200px] ${
                active ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/40"
              }`}
            >
              <div
                className={`text-3xl font-bold ${
                  isOverdue && (counts?.overdue ?? 0) > 0 ? "text-red-600" : "text-navy"
                }`}
              >
                {counts ? counts[t.key] : 0}
              </div>
              <div className="truncate mt-1 text-sm font-semibold text-muted">{t.label}</div>
            </button>
          );
        })}
      </div>

      {/* ===== One search, above the list ===== */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, phone or project"
        className="mt-6 w-full max-w-sm rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy focus:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />

      {loading ? (
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : totalRows === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-white p-8 text-center">
          <p className="text-sm font-semibold text-navy">
            {query.trim()
              ? "No leads match this search"
              : tile === "overdue"
                ? "Nothing overdue"
                : "All queues are clear"}
          </p>
          <p className="mt-2 text-sm text-muted">Nothing pending for now.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {visibleSections.map((s) => {
            const list = rowsFor(s.key);
            if (list.length === 0) return null;
            const isOpen = expanded[s.key];
            const shown = isOpen ? list : list.slice(0, ROWS_BEFORE_EXPANDING);
            return (
              <section key={s.key}>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-base font-bold text-navy">{s.title}</h2>
                  <span className="text-sm text-muted">{list.length}</span>
                </div>

                <div className="mt-3 space-y-3">
                  {shown.map((c) => (
                    <LeadRow
                      key={c.id}
                      id={c.id}
                      name={c.name}
                      phone={c.phone}
                      whatsappNumber={c.whatsappNumber}
                      line2={[c.preferredProject || c.originalProject || "", sourceLabel(c.source)]
                        .filter(Boolean)
                        .join("  ·  ")}
                      line3={`${c.nextAction}${c.nextFollowUp ? `  ·  ${c.nextFollowUp}` : ""}`}
                      overdue={c.hasOverdueFollowUp}
                    />
                  ))}
                </div>

                {list.length > ROWS_BEFORE_EXPANDING && (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [s.key]: !isOpen }))}
                    className="mt-3 text-sm font-semibold text-primary hover:underline"
                  >
                    {isOpen ? "Show less" : `Show more (${list.length - ROWS_BEFORE_EXPANDING})`}
                  </button>
                )}

                <div className="mt-3">
                  <Link href="/crm/leads" className="text-sm font-semibold text-primary hover:underline">
                    View all
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showQueue && <CallQueue onExit={() => setShowQueue(false)} />}
      {showQualityQueue && (
        <CallQueue mode="quality" onExit={() => setShowQualityQueue(false)} />
      )}
    </div>
  );
}

type RowProps = {
  id: number;
  name: string;
  phone: string;
  whatsappNumber: string | null;
  /** Second line: project and source, or the requirement summary. */
  line2: string;
  /** Third line: the action and when it is due. */
  line3: string;
  overdue?: boolean;
};

/** One lead. The whole row opens the lead; the two buttons sit above it. */
function LeadRow({ id, name, phone, whatsappNumber, line2, line3, overdue }: RowProps) {
  return (
    <div className="relative flex flex-col gap-3 rounded-xl border border-border bg-white p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:gap-4">
      {/* The link overlay covers the whole row; the buttons sit above it. */}
      <Link href={`/crm/leads/${id}`} className="min-w-0 flex-1 after:absolute after:inset-0 after:content-['']">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-bold text-navy">{name}</span>
          {overdue && (
            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-sm font-semibold leading-6 text-red-700">
              Overdue
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-sm text-muted">{line2}</div>
        <div className="mt-1 truncate text-sm text-muted">{line3}</div>
      </Link>

      <div className="relative z-10 flex shrink-0 gap-2">
        <a
          href={`tel:+${phone.replace(/\D/g, "")}`}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-secondary sm:flex-none"
        >
          <PhoneIcon className="h-[18px] w-[18px] shrink-0" />
          Call
        </a>
        <a
          href={`https://wa.me/${formatPhoneForWhatsApp(whatsappNumber || phone)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-border bg-white px-4 text-sm font-bold text-navy transition-colors hover:border-primary/40 sm:flex-none"
        >
          <WhatsAppIcon className="h-[18px] w-[18px] shrink-0" />
          WhatsApp
        </a>
      </div>
    </div>
  );
}
