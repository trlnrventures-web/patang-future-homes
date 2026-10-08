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

/**
 * How many cards a stage renders before it makes the reader ask for more. A
 * column scrolls internally now, so this is about scroll lag and DOM weight on
 * a stage holding hundreds of leads rather than about fit — every column shows
 * its real count in the header, so nothing is hidden without saying so.
 */
const COLUMN_CARD_CAP = 60;
const COLUMN_REVEAL_STEP = 60;

function projectOf(lead: BoardLead): string {
  return lead.preferredProject || lead.originalProject || "";
}

/** Caller first, then SM — whoever is actually working the lead right now. */
function ownerOf(lead: BoardLead): string {
  if (lead.assignedCallerName) return lead.assignedCallerName;
  if (lead.assignedSmName) return lead.assignedSmName;
  return "Unassigned";
}

/**
 * Bulk-select tick for a card. The whole card is a button that opens the lead, so
 * the tick swallows its own click and keypress — otherwise every attempt to
 * select a card would navigate away from the board and the action bar could
 * never be used.
 */
function SelectBox({
  checked,
  onToggle,
  name,
}: {
  checked: boolean;
  onToggle: () => void;
  name: string;
}) {
  return (
    <label
      className="absolute left-2 top-2 z-10 -m-1.5 cursor-pointer p-1.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" || e.key === " ") e.preventDefault();
      }}
    >
      <span className="sr-only">Select {name} for bulk actions</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 cursor-pointer rounded border-border text-primary accent-primary"
      />
    </label>
  );
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

  // Mobile stage tab. The desktop board shows all eleven columns side by side,
  // which on a phone just means eleven narrow unreadable strips with no way to
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
  // Cards shown past COLUMN_CARD_CAP, per column key. Each entry records the set
  // of lead ids it was expanded for, so a new search or filter invalidates it
  // without needing to reset state - a reader is never left looking at hundreds
  // of expanded cards from a filter that no longer applies.
  const [reveal, setReveal] = useState<Record<string, { sig: string; n: number }>>({});
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

  /** Identity of the current result set, used to expire stale expansions. */
  const visibleSig = useMemo(() => visibleLeads.map((l) => l.id).join(","), [visibleLeads]);

  // ---- Bulk selection ----
  // Selection lives in the board, not the server: the board already holds every
  // lead of the current filter, so ticking cards and acting on them needs no
  // round trip until the action itself. Ids are always read through
  // `selectedIds`, which keeps the bar in step with what is on screen.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // "Assign SM", "Assign caller" and "Delete" are owner controls; a caller or
  // an SM may still bulk-move status within their own scope, which the server
  // re-checks lead by lead.
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkSm, setBulkSm] = useState("");
  const [bulkCaller, setBulkCaller] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [bulkMsg, setBulkMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canBulk = !!user && user.role !== "marketing";
  const isAdminUser = !!user && (user.role === "admin" || user.role === "sales_head");

  // The people a lead can be handed to, for the two assign menus.
  const [assignees, setAssignees] = useState<{ sms: { id: number; name: string }[]; callers: { id: number; name: string }[] }>({
    sms: [],
    callers: [],
  });
  useEffect(() => {
    if (!isAdminUser) return;
    let active = true;
    fetch("/crm/api/team")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.users) return;
        setAssignees({
          sms: d.users.filter((u: { role: string }) => u.role === "sales_manager").map((u: { id: number; name: string }) => ({ id: u.id, name: u.name })),
          callers: d.users.filter((u: { role: string }) => u.role === "caller").map((u: { id: number; name: string }) => ({ id: u.id, name: u.name })),
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isAdminUser]);

  // Selection is always read through `selectedIds`, which intersects with the
  // rows on screen: ticks for leads outside the current filter never reach the
  // bar, the count, or a bulk request, so there is nothing to clean up when the
  // filter changes (and pruning in an effect would just cause a second render).
  const selectedIds = useMemo(
    () => [...selected].filter((id) => visibleLeads.some((l) => l.id === id)),
    [selected, visibleLeads]
  );

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setBulkStatus("");
    setBulkSm("");
    setBulkCaller("");
    setBulkNote("");
    setBulkMsg(null);
    setConfirmDelete(false);
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelected((prev) => {
      const allSelected = visibleLeads.every((l) => prev.has(l.id));
      if (allSelected) {
        const visible = new Set(visibleLeads.map((l) => l.id));
        return new Set([...prev].filter((id) => !visible.has(id)));
      }
      return new Set([...prev, ...visibleLeads.map((l) => l.id)]);
    });
  }, [visibleLeads]);

  const runBulk = useCallback(
    async (body: Record<string, unknown>, successText: (n: number) => string) => {
      if (selectedIds.length === 0) return;
      setBusy(true);
      setBulkMsg(null);
      try {
        const res = await fetch("/crm/api/leads/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedIds, ...body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "That action could not be completed.");
        setBulkMsg({ tone: "ok", text: successText(Number(data.updated) || 0) });
        clearSelection();
        await load();
      } catch (e) {
        setBulkMsg({ tone: "err", text: e instanceof Error ? e.message : "That action could not be completed." });
      } finally {
        setBusy(false);
        setConfirmDelete(false);
      }
    },
    [selectedIds, clearSelection, load]
  );

  const applyBulkStatus = useCallback(() => {
    if (!bulkStatus) return;
    const label = LEAD_STATUS_LABELS[bulkStatus] || bulkStatus;
    void runBulk({ action: "status", status: bulkStatus, notes: bulkNote.trim() || undefined }, (n) =>
      n === 0 ? "Those leads were already in that stage." : `${n} lead${n === 1 ? "" : "s"} moved to ${label}.`
    );
  }, [bulkStatus, bulkNote, runBulk]);

  const applyBulkSm = useCallback(() => {
    if (!bulkSm) return;
    const name = bulkSm === "auto" ? "auto-assign" : assignees.sms.find((s) => String(s.id) === bulkSm)?.name;
    void runBulk({ action: "assign_sm", ...(bulkSm === "clear" ? { clear: true } : { smId: bulkSm === "auto" ? null : Number(bulkSm) }) }, (n) =>
      n === 0 ? "No lead changed — they already had that sales manager." : `${n} lead${n === 1 ? "" : "s"} assigned to ${name}.`
    );
  }, [bulkSm, assignees.sms, runBulk]);

  const applyBulkCaller = useCallback(() => {
    if (!bulkCaller) return;
    const name = bulkCaller === "auto" ? "auto-assign" : assignees.callers.find((c) => String(c.id) === bulkCaller)?.name;
    void runBulk({ action: "assign_caller", ...(bulkCaller === "clear" ? { clear: true } : { callerId: bulkCaller === "auto" ? null : Number(bulkCaller) }) }, (n) =>
      n === 0 ? "No lead changed — they already had that caller." : `${n} lead${n === 1 ? "" : "s"} assigned to ${name}.`
    );
  }, [bulkCaller, assignees.callers, runBulk]);


  /** Cards to render for a column right now: the cap, unless expanded. */
  const shownFor = useCallback(
    (key: string) => (reveal[key]?.sig === visibleSig ? reveal[key].n : COLUMN_CARD_CAP),
    [reveal, visibleSig]
  );

  const showMore = useCallback(
    (key: string) =>
      setReveal((r) => {
        const from = r[key]?.sig === visibleSig ? r[key].n : COLUMN_CARD_CAP;
        return { ...r, [key]: { sig: visibleSig, n: from + COLUMN_REVEAL_STEP } };
      }),
    [visibleSig]
  );

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
    <div className="pb-24 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden md:pb-0">
      <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row sm:items-center">
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
        {canBulk && visibleLeads.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectAllVisible}
            className="shrink-0 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary/50 hover:text-primary"
          >
            {selectedIds.length === visibleLeads.length ? "Clear selection" : "Select all"}
          </button>
        )}
      </div>

      {/* ===== Bulk action bar =====
          Appears only while something is ticked, so it cannot push the board
          around during ordinary reading. Every control here maps to one case in
          /crm/api/leads/bulk, which re-checks scope per lead; the client only
          decides what to draw. Delete is the one destructive action, so it
          takes a second, explicit confirmation rather than firing on click. */}
      {canBulk && selectedIds.length > 0 && (
        <div className="mt-2.5 shrink-0 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-navy">
              {selectedIds.length} selected
            </span>
            <button
              type="button"
              onClick={clearSelection}
              disabled={busy}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-muted hover:text-navy disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted">Move to stage</span>
              <div className="flex gap-1.5">
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  disabled={busy}
                  className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm font-semibold text-navy outline-none focus:border-primary"
                >
                  <option value="">Choose a stage</option>
                  {LEAD_COLUMNS.map((c) => (
                    <option key={c.key} value={c.dropStatus}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applyBulkStatus}
                  disabled={busy || !bulkStatus}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
            </label>

            {isAdminUser && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted">Assign sales manager</span>
                <div className="flex gap-1.5">
                  <select
                    value={bulkSm}
                    onChange={(e) => setBulkSm(e.target.value)}
                    disabled={busy}
                    className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm font-semibold text-navy outline-none focus:border-primary"
                  >
                    <option value="">Choose</option>
                    <option value="auto">Auto-assign (lightest load)</option>
                    <option value="clear">Unassign</option>
                    {assignees.sms.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={applyBulkSm}
                    disabled={busy || !bulkSm}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </label>
            )}

            {isAdminUser && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted">Assign caller</span>
                <div className="flex gap-1.5">
                  <select
                    value={bulkCaller}
                    onChange={(e) => setBulkCaller(e.target.value)}
                    disabled={busy}
                    className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm font-semibold text-navy outline-none focus:border-primary"
                  >
                    <option value="">Choose</option>
                    <option value="auto">Auto-assign (lightest load)</option>
                    <option value="clear">Unassign</option>
                    {assignees.callers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={applyBulkCaller}
                    disabled={busy || !bulkCaller}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </label>
            )}

            {isAdminUser &&
              (confirmDelete ? (
                <div className="flex items-end gap-1.5">
                  <span className="pb-1.5 text-xs font-semibold text-red-700">
                    Delete {selectedIds.length} lead{selectedIds.length === 1 ? "" : "s"}?
                  </span>
                  <button
                    type="button"
                    onClick={() => void runBulk({ action: "delete" }, (n) => `${n} lead${n === 1 ? "" : "s"} deleted.`)}
                    disabled={busy}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy}
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-semibold text-muted hover:text-navy"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Delete
                </button>
              ))}
          </div>

          {bulkMsg && (
            <p
              className={`mt-2 text-sm font-semibold ${bulkMsg.tone === "ok" ? "text-green-700" : "text-red-700"}`}
              role="status"
            >
              {bulkMsg.text}
            </p>
          )}
        </div>
      )}

      <ContactMaskingBanner masking={masking} className="mt-2.5 md:shrink-0" />

      {/* ===== Mobile stage tabs =====
          A horizontally scrollable tab per stage with its lead count. Pinned
          under the quick filters so it stays reachable while the list scrolls.
          md:hidden: from md up the full eleven-column board renders instead. */}
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
        <div className="mt-2.5 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-3 flex gap-3 md:min-h-0 md:flex-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="min-h-[24rem] w-64 shrink-0 animate-pulse rounded-xl bg-gray-100 md:h-auto md:min-h-0 md:flex-1" />
          ))}
        </div>
      ) : (
        <>
          {visibleLeads.length === 0 && (
            <div className="mt-3 shrink-0 rounded-xl border border-dashed border-border bg-white px-4 py-3 text-center">
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
              stage happens from the lead itself.

              There is no horizontal misalignment to fix on mobile: one stage at
              a time in normal page flow is the correct pattern for a phone, so
              this list keeps scrolling with the page rather than becoming its
              own viewport-height pane. It does share the desktop's card cap. */}
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
              <>
                {activeLeads
                  .slice(0, shownFor(activeStageColumn.key))
                  .map((lead) => (
                    <MobileStageCard
                      key={lead.id}
                      lead={lead}
                      pending={pendingId === lead.id}
                      onOpen={() => router.push(`/crm/leads/${lead.id}${hrefQuery}`)}
                      selectable={canBulk}
                      selected={selected.has(lead.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                <ShowMore
                  hidden={Math.max(0, activeLeads.length - shownFor(activeStageColumn.key))}
                  total={activeLeads.length}
                  onShowMore={() => showMore(activeStageColumn.key)}
                />
              </>
            )}
          </div>

          {/* ===== Desktop: the full eleven-column board =====
              `min-h-0 flex-1` is what gives every column a definite height:
              `items-stretch` then hands that same height to all eleven sections,
              and each section's card list scrolls inside it. Without a bounded
              height here the sections grow with their tallest card list, the
              lists never overflow, and the whole page scrolls instead. */}
          <div className="mt-3 hidden min-h-0 flex-1 items-stretch gap-3 overflow-x-auto pb-2 md:flex [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          {LEAD_COLUMNS.map((column) => (
            <BoardColumn
              key={column.key}
              column={column}
              cards={byColumn[column.key]}
              shownCount={shownFor(column.key)}
              onShowMore={() => showMore(column.key)}
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
              selectable={canBulk}
              selected={selected}
              onToggleSelect={toggleSelect}
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
  shownCount,
  onShowMore,
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
  selectable,
  selected,
  onToggleSelect,
}: {
  column: LeadColumn;
  cards: BoardLead[];
  /** Cards rendered before the rest are held back; see COLUMN_CARD_CAP. */
  shownCount: number;
  onShowMore: () => void;
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
  selectable: boolean;
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
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
      {/* `shrink-0` keeps the header pinned to the top of the column while the
          list below it scrolls; the section's height comes from the board row,
          which is what every column shares. */}
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
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 [scrollbar-width:thin]">
        {cards.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-soft">{isOver ? "Drop here" : "No leads"}</p>
        ) : (
          <>
            {cards.slice(0, shownCount).map((lead) => (
              <BoardCard
                key={lead.id}
                lead={lead}
                dragging={draggingId === lead.id}
                pending={pendingId === lead.id}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onOpen={onOpen}
                selectable={selectable}
                selected={selected.has(lead.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
            <ShowMore
              hidden={cards.length - Math.min(shownCount, cards.length)}
              total={cards.length}
              onShowMore={onShowMore}
            />
          </>
        )}
      </div>
    </section>
  );
}

/** "+N more" affordance, so a capped column never looks truncated. */
function ShowMore({
  hidden,
  total,
  onShowMore,
}: {
  hidden: number;
  total: number;
  onShowMore: () => void;
}) {
  if (hidden <= 0) return null;
  return (
    <button
      type="button"
      onClick={onShowMore}
      className="shrink-0 rounded-lg border border-dashed border-border bg-background/60 px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary/40 hover:text-primary"
    >
      Showing {total - hidden} of {total} — show {Math.min(hidden, COLUMN_REVEAL_STEP)} more
    </button>
  );
}

function BoardCard({
  lead,
  dragging,
  pending,
  onDragStart,
  onDragEnd,
  onOpen,
  selectable,
  selected,
  onToggleSelect,
}: {
  lead: BoardLead;
  dragging: boolean;
  pending: boolean;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  onOpen: (id: number) => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (id: number) => void;
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
      } ${pending ? "animate-pulse" : ""} ${selected ? "border-primary ring-2 ring-primary/20" : ""} ${
        selectable ? "pl-7" : ""
      }`}
    >
      {selectable && (
        <SelectBox
          checked={selected}
          onToggle={() => onToggleSelect(lead.id)}
          name={lead.name}
        />
      )}
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
  selectable,
  selected,
  onToggleSelect,
}: {
  lead: BoardLead;
  pending: boolean;
  onOpen: () => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (id: number) => void;
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
      } ${selected ? "border-primary ring-2 ring-primary/20" : ""} ${selectable ? "pl-9" : ""}`}
    >
      {selectable && (
        <SelectBox
          checked={selected}
          onToggle={() => onToggleSelect(lead.id)}
          name={lead.name}
        />
      )}
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
