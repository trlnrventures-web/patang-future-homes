"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOARD_QUICK_FILTERS,
  BOARD_SERVER_QUICK_KEYS,
  LEAD_COLUMNS,
  columnForStatus,
  sourceLabel,
  type BoardLead,
  type LeadColumn,
} from "@/lib/crm/board-shared";
import {
  LEAD_LOST_REASONS,
  LEAD_STATUS_LABELS,
  lostReasonLabel,
  setLeadLostReasonInNotes,
} from "@/lib/crm/leads";
import {
  EMPTY_FILTERS,
  applyFilters,
  type LeadFilters,
} from "@/lib/crm/lead-filters";
import LeadFilterPanel from "./LeadFilterPanel";
import ContactMaskingBanner from "./ContactMaskingBanner";
import type { LeadsViewContext } from "./LeadsPageContent";

type McUser = { id: number; role: string };

type ContactMasking = {
  active: boolean;
  withinOfficeHours: boolean;
  banner: string | null;
};

type Props = {
  listContext?: LeadsViewContext;
  /** Callers on a handed-off lead see the board read-only. */
  readOnly?: boolean;
};

/** Roles that own leads directly, so "My Leads" is meaningful for them. */
const MY_LEADS_ROLES = new Set(["caller", "sales_manager"]);

function projectOf(lead: BoardLead): string {
  return lead.preferredProject || lead.originalProject || "";
}

/** Caller first, then SM — whoever is actually working the lead right now. */
function ownerOf(lead: BoardLead): string {
  if (lead.assignedCallerName) return lead.assignedCallerName;
  if (lead.assignedSmName) return lead.assignedSmName;
  return "Unassigned";
}

export default function LeadBoard({ listContext, readOnly }: Props) {
  const router = useRouter();
  const [leads, setLeads] = useState<BoardLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [quick, setQuick] = useState(listContext?.quick ?? "");
  const [query, setQuery] = useState(listContext?.q ?? "");
  const [user, setUser] = useState<McUser | null>(null);
  // Owned by the filter panel, which persists it per user in localStorage.
  const [filtersState, setFiltersState] = useState<LeadFilters>(EMPTY_FILTERS);
  const [masking, setMasking] = useState<ContactMasking | null>(null);
  // Lost is the only column that starts collapsed, and it stays at the far right.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(LEAD_COLUMNS.filter((c) => c.closed).map((c) => c.key))
  );

  // Mobile stage tab. The desktop board shows all nine columns side by side,
  // which on a phone just means nine narrow unreadable strips with no way to
  // tell which one you are looking at. On mobile we show one stage at a time as
  // a flat list, chosen with this tab. Keyed by column key so it stays in step
  // with LEAD_COLUMNS.
  const [activeStage, setActiveStage] = useState<string>(LEAD_COLUMNS[0].key);

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const [lostTarget, setLostTarget] = useState<BoardLead | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [lostNote, setLostNote] = useState("");
  const [busy, setBusy] = useState(false);
  const loadSeq = useRef(0);

  // Adjacent stage, for the swipe gesture and for keeping the tab in view.
  const stageIndex = LEAD_COLUMNS.findIndex((c) => c.key === activeStage);
  const goToStage = (index: number) => {
    const next = LEAD_COLUMNS[index];
    if (next) setActiveStage(next.key);
  };

  // Horizontal swipe on the list body moves between adjacent stages. Only a
  // clearly horizontal gesture counts, and vertical scrolling is left alone so
  // the list still scrolls normally. The starting point is captured on
  // touchstart and compared on touchend, rather than tracked per move, so the
  // handler stays cheap on long lists.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Require a mostly-horizontal move of at least 48px.
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
    // Swipe left => next stage, swipe right => previous stage.
    goToStage(stageIndex + (dx < 0 ? 1 : -1));
  };

  // "My Leads" is resolved here rather than on the server, so the four filter
  // buttons collapse to three for roles that do not own leads.
  const myLeadsActive = quick === "my_leads" && !!user && MY_LEADS_ROLES.has(user.role);

  const filters = useMemo(
    () =>
      BOARD_QUICK_FILTERS.filter(
        (f) => f.key !== "my_leads" || (user ? MY_LEADS_ROLES.has(user.role) : false)
      ),
    [user]
  );

  useEffect(() => {
    let active = true;
    fetch("/crm/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.user) setUser({ id: d.user.id, role: d.user.role as string });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // `my_leads` is a client-side cut of an already-fetched board, so it never
  // reaches the server; the other filters are.
  const serverQuick = BOARD_SERVER_QUICK_KEYS.includes(quick) ? quick : "";

  const hrefQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (serverQuick) params.set("quick", serverQuick);
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [serverQuick, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const seq = ++loadSeq.current;
    try {
      // The board draws every lead of the current filter at once so a card can
      // be dragged between columns; there is no pagination.
      const params = new URLSearchParams();
      params.set("view", "board");
      if (serverQuick) params.set("quick", serverQuick);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/crm/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      if (seq !== loadSeq.current) return;
      const seen = new Set<number>();
      const rows = (data.leads as BoardLead[]).filter((l) =>
        seen.has(l.id) ? false : (seen.add(l.id), true)
      );
      setLeads(rows);
      // The API decides whether contact details are masked; the board only
      // relays that so the banner and the disabled actions agree with the data.
      if (data.contactMasking) setMasking(data.contactMasking);
    } catch {
      if (seq === loadSeq.current) setError("Could not load leads. Please try again.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [serverQuick, query]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Quick filter and the filter panel both cut the already-fetched board rows,
  // so the two combine and neither needs another request.
  const visibleLeads = useMemo(() => {
    const byQuick = myLeadsActive && user
      ? leads.filter((l) =>
          user.role === "caller" ? l.assignedCallerId === user.id : l.assignedSmId === user.id
        )
      : leads;
    return applyFilters(byQuick, filtersState);
  }, [leads, myLeadsActive, user, filtersState]);

  // Columns are always drawn, even with zero cards, so a filter that empties a
  // stage still shows where that stage went instead of collapsing the board.
  const byColumn = useMemo(() => {
    const grouped: Record<string, BoardLead[]> = {};
    for (const c of LEAD_COLUMNS) grouped[c.key] = [];
    for (const lead of visibleLeads) {
      const col = columnForStatus(lead.status);
      if (col) grouped[col.key].push(lead);
    }
    return grouped;
  }, [visibleLeads]);

  // The leads shown by the mobile stage list, and that stage's name for the
  // empty state. Declared after `byColumn`, which it reads.
  const activeStageColumn = LEAD_COLUMNS[stageIndex] ?? LEAD_COLUMNS[0];
  const activeStageLabel = activeStageColumn.label;
  const activeLeads = byColumn[activeStageColumn.key] ?? [];

  const moveLead = useCallback(
    async (lead: BoardLead, targetStatus: string) => {
      if (readOnly || lead.status === targetStatus) return;
      setPendingId(lead.id);
      setError("");
      try {
        const res = await fetch(`/crm/api/leads/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // Same server-side status-change path the detail page uses: it updates
          // the stage, stamps stage_changed_at and logs a status_change activity.
          body: JSON.stringify({ status: targetStatus }),
        });
        if (!res.ok) throw new Error("failed");
        await load();
      } catch {
        setError(`Could not move ${lead.name}. Please try again.`);
      } finally {
        setPendingId(null);
      }
    },
    [readOnly, load]
  );

  const confirmLost = useCallback(async () => {
    if (!lostTarget || !lostReason) return;
    setBusy(true);
    try {
      const res = await fetch(`/crm/api/leads/${lostTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "lost",
          // The lost reason lives in the notes column, which is what reports read.
          notes: setLeadLostReasonInNotes(lostTarget.notes, lostReason),
          statusChangeNote: lostNote.trim() || `Lead lost: ${lostReasonLabel(lostReason)}`,
        }),
      });
      if (!res.ok) throw new Error("failed");
      setLostTarget(null);
      setLostReason("");
      setLostNote("");
      await load();
    } catch {
      setError(`Could not mark ${lostTarget.name} as lost. Please try again.`);
    } finally {
      setBusy(false);
    }
  }, [lostTarget, lostReason, lostNote, load]);

  const handleDrop = useCallback(
    (column: LeadColumn, id: number) => {
      setOverColumn(null);
      setDraggingId(null);
      const lead = leads.find((l) => l.id === id);
      if (!lead || readOnly) return;
      // Losing a lead is the one drop that needs a decision from the user, so it
      // goes through the same reason picker the detail page uses.
      if (column.closed) {
        setLostTarget(lead);
        setLostReason("");
        setLostNote("");
        return;
      }
      void moveLead(lead, column.dropStatus);
    },
    [leads, readOnly, moveLead]
  );

  return (
    <div className="pb-24">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, or project..."
          aria-label="Search leads"
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy outline-none transition-colors focus:border-primary sm:flex-1"
        />
        {!readOnly && (
          <LeadFilterPanel
            leads={leads}
            userId={user?.id ?? null}
            filters={filtersState}
            onFiltersChange={setFiltersState}
            resultCount={visibleLeads.length}
          />
        )}
        <div
          className="flex shrink-0 gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Quick filters"
        >
          {filters.map((f) => (
            <button
              key={f.key || "all"}
              type="button"
              onClick={() => setQuick(f.key)}
              aria-pressed={quick === f.key}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                quick === f.key
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-muted hover:bg-primary/5 hover:text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ContactMaskingBanner masking={masking} className="mt-2.5" />

      {/* ===== Mobile stage tabs =====
          A horizontally scrollable tab per stage with its lead count. Pinned
          under the quick filters so it stays reachable while the list scrolls.
          md:hidden: from md up the full nine-column board renders instead. */}
      <div className="sticky top-14 z-30 -mx-4 mt-2.5 border-y border-border bg-white px-4 py-2 md:hidden">
        <div
          className="flex gap-1.5 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Lead stage"
        >
          {LEAD_COLUMNS.map((column) => {
            const active = column.key === activeStage;
            const count = byColumn[column.key]?.length ?? 0;
            return (
              <button
                key={column.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveStage(column.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  active ? "bg-primary text-white" : "bg-background text-muted"
                }`}
              >
                {column.label}
                <span
                  className={`rounded-full px-1.5 text-xs font-bold ${
                    active ? "bg-white/25 text-white" : "bg-white text-navy"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mt-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-3 flex gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[calc(100vh-16rem)] min-h-[24rem] w-64 shrink-0 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          {visibleLeads.length === 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-white px-4 py-3 text-center">
              <p className="text-sm font-semibold text-navy">
                {myLeadsActive ? "No leads assigned to you" : "No leads match these filters"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {myLeadsActive
                  ? "Switch back to All leads to see the whole queue."
                  : "Every stage is still shown below so you can see what was filtered out."}
              </p>
            </div>
          )}

          {/* ===== Mobile: the active stage as one flat list =====
              Cards keep the same four lines as the board but get 12px of
              separation and a 64px minimum row, so they no longer run together
              behind a hairline. Drag-and-drop is not offered here; moving a
              stage happens from the lead itself. */}
          <div
            className="mt-3 flex flex-col gap-3 pb-2 md:hidden"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {activeLeads.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-white px-4 py-8 text-center">
                <p className="text-sm font-semibold text-navy">
                  No leads in {activeStageLabel}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Swipe or pick another stage above.
                </p>
              </div>
            ) : (
              activeLeads.map((lead) => (
                <MobileStageCard
                  key={lead.id}
                  lead={lead}
                  pending={pendingId === lead.id}
                  onOpen={() => router.push(`/crm/leads/${lead.id}${hrefQuery}`)}
                />
              ))
            )}
          </div>

          {/* ===== Desktop: the full nine-column board ===== */}
          <div className="mt-3 hidden items-stretch gap-3 overflow-x-auto pb-2 md:flex [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          {LEAD_COLUMNS.map((column) => (
            <BoardColumn
              key={column.key}
              column={column}
              cards={byColumn[column.key]}
              collapsed={collapsed.has(column.key)}
              readOnly={readOnly}
              draggingId={draggingId}
              isOver={overColumn === column.key}
              pendingId={pendingId}
              onToggleCollapse={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(column.key)) next.delete(column.key);
                  else next.add(column.key);
                  return next;
                })
              }
              onDragStart={(e, id) => {
                e.dataTransfer.setData("text/plain", String(id));
                e.dataTransfer.effectAllowed = "move";
                setDraggingId(id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setOverColumn(null);
              }}
              onDragOverColumn={() => setOverColumn(column.key)}
              onDragLeaveColumn={() =>
                setOverColumn((c) => (c === column.key ? null : c))
              }
              onDrop={(id) => handleDrop(column, id)}
              onOpen={(id) => router.push(`/crm/leads/${id}${hrefQuery}`)}
            />
          ))}
          </div>
        </>
      )}

      {lostTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 sm:items-center sm:p-4">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="text-sm font-bold text-navy">Mark {lostTarget.name} as lost</h3>
            <p className="mt-0.5 text-sm text-muted">Select a reason (required).</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {LEAD_LOST_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setLostReason(r.value)}
                  aria-pressed={lostReason === r.value}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    lostReason === r.value
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-border bg-white text-muted hover:border-red-300"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              value={lostNote}
              onChange={(e) => setLostNote(e.target.value)}
              placeholder="Optional note (what happened and why)..."
              rows={2}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-red-400"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={confirmLost}
                disabled={busy || !lostReason}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-secondary disabled:opacity-50"
              >
                {busy ? "Working..." : "Confirm Lost"}
              </button>
              <button
                type="button"
                onClick={() => setLostTarget(null)}
                className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-navy"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  column,
  cards,
  collapsed,
  readOnly,
  draggingId,
  isOver,
  pendingId,
  onToggleCollapse,
  onDragStart,
  onDragEnd,
  onDragOverColumn,
  onDragLeaveColumn,
  onDrop,
  onOpen,
}: {
  column: LeadColumn;
  cards: BoardLead[];
  collapsed: boolean;
  readOnly?: boolean;
  draggingId: number | null;
  isOver: boolean;
  pendingId: number | null;
  onToggleCollapse: () => void;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  onDragOverColumn: () => void;
  onDragLeaveColumn: () => void;
  onDrop: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={`Expand ${column.label} column, ${cards.length} leads`}
        className={`flex w-12 shrink-0 flex-col items-center gap-2 rounded-xl border py-3 transition-colors ${
          isOver ? "border-primary bg-primary/5" : "border-border bg-white hover:bg-primary/5"
        }`}
      >
        <span className="text-sm font-bold text-navy [writing-mode:vertical-rl] rotate-180">
          {column.label}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-sm font-bold text-muted">
          {cards.length}
        </span>
      </button>
    );
  }

  return (
    <section
      onDragOver={(e) => {
        if (readOnly || draggingId === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOverColumn();
      }}
      onDragLeave={onDragLeaveColumn}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(Number(e.dataTransfer.getData("text/plain")));
      }}
      aria-label={`${column.label} — ${cards.length} lead${cards.length === 1 ? "" : "s"}`}
      className={`flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border bg-white transition-colors ${
        isOver ? "border-primary ring-2 ring-primary/20" : "border-border"
      }`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-navy">{column.label}</h3>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-sm font-bold text-muted">
          {cards.length}
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={`Collapse ${column.label} column`}
          className="shrink-0 text-soft transition-colors hover:text-navy"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>
      <div className="flex min-h-[8rem] flex-1 flex-col gap-2 overflow-y-auto p-2">
        {cards.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-soft">{isOver ? "Drop here" : "No leads"}</p>
        ) : (
          cards.map((lead) => (
            <BoardCard
              key={lead.id}
              lead={lead}
              dragging={draggingId === lead.id}
              pending={pendingId === lead.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onOpen={onOpen}
            />
          ))
        )}
      </div>
    </section>
  );
}

function BoardCard({
  lead,
  dragging,
  pending,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  lead: BoardLead;
  dragging: boolean;
  pending: boolean;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  onOpen: (id: number) => void;
}) {
  const project = projectOf(lead);
  const owner = ownerOf(lead);
  const source = sourceLabel(lead.source);

  return (
    <article
      draggable={!pending}
      onDragStart={(e) => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(lead.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(lead.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${lead.name}, ${LEAD_STATUS_LABELS[lead.status] || lead.status}`}
      className={`relative cursor-pointer rounded-lg border border-border bg-white px-3 py-2.5 transition-colors hover:border-primary/40 ${
        dragging ? "border-primary opacity-40" : ""
      } ${pending ? "animate-pulse" : ""}`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-navy">{lead.name}</div>
        {project && <div className="mt-0.5 truncate text-sm text-muted">{project}</div>}
        <div className="mt-0.5 truncate text-sm text-muted">{owner}</div>
        {source && <div className="mt-0.5 truncate text-sm text-muted">{source}</div>}
      </div>
      {lead.hasOverdueFollowUp && (
        <span
          title="Follow-up overdue"
          aria-label="Follow-up overdue"
          className="absolute bottom-2 right-2 text-red-600"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
      )}
    </article>
  );
}

/**
 * The mobile stand-in for a board column: the same four lines as `BoardCard`,
 * but as a full-width row with a 64px minimum tap target. Cards are separated
 * by 12px of gap from the list above, so they read as separate rows rather than
 * one continuous block behind a hairline.
 */
function MobileStageCard({
  lead,
  pending,
  onOpen,
}: {
  lead: BoardLead;
  pending: boolean;
  onOpen: () => void;
}) {
  const project = projectOf(lead);
  const owner = ownerOf(lead);
  const source = sourceLabel(lead.source);

  return (
    <article
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${lead.name}, ${LEAD_STATUS_LABELS[lead.status] || lead.status}`}
      className={`relative flex min-h-16 cursor-pointer items-center rounded-xl border border-border bg-white px-3 py-3 transition-colors active:border-primary ${
        pending ? "animate-pulse" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-navy">{lead.name}</div>
        {project && <div className="mt-0.5 truncate text-sm text-muted">{project}</div>}
        <div className="mt-0.5 truncate text-sm text-muted">{owner}</div>
        {source && <div className="mt-0.5 truncate text-sm text-muted">{source}</div>}
      </div>
      {lead.hasOverdueFollowUp && (
        <span
          title="Follow-up overdue"
          aria-label="Follow-up overdue"
          className="ml-2 shrink-0 text-red-600"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
      )}
    </article>
  );
}
