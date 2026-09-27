"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AccentLegend from "./AccentLegend";
import {
  BOARD_QUICK_FILTERS,
  BOARD_SORTS,
  BOARD_STATUS_FILTERS,
  FALLBACK_ACCENT,
  LEAD_FUNNEL_STAGES,
  STAGE_ACCENTS,
  agingTone,
  funnelStageForStatus,
  type BoardDensity,
  type BoardLead,
  type FunnelStage,
} from "@/lib/crm/board-shared";
import { LEAD_STATUS_LABELS, bhkLabel } from "@/lib/crm/leads";
import { leadAccentCls } from "@/lib/crm/sla";
import type { LeadsViewContext } from "./LeadsPageContent";

type McUser = { id: number; name: string; role: string };

type Props = {
  listContext?: LeadsViewContext;
  /** Callers on a handed-off lead see the board read-only. */
  readOnly?: boolean;
};

const DEFAULT_SORT = "longest_in_stage";

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("") || "?"
  );
}

export default function LeadBoard({ listContext, readOnly }: Props) {
  const router = useRouter();
  const [leads, setLeads] = useState<BoardLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [status, setStatus] = useState(listContext?.status ?? "all");
  const [quick, setQuick] = useState(listContext?.quick ?? "");
  const [sort, setSort] = useState(listContext?.sort || DEFAULT_SORT);
  const [query, setQuery] = useState(listContext?.q ?? "");
  const [density, setDensity] = useState<BoardDensity>("comfortable");
  const [swimlanes, setSwimlanes] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const [role, setRole] = useState("");
  const [sms, setSms] = useState<McUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [bulkAction, setBulkAction] = useState<"" | "assign_sm" | "status" | "delete">("");
  const [bulkSmId, setBulkSmId] = useState<number | "">("");
  const [bulkStatus, setBulkStatus] = useState("");
  const loadSeq = useRef(0);

  // Carried into every lead link so the detail page offers Previous/Next Lead
  // through the exact queue the user is looking at, and "Back to Leads" restores
  // the same filters, sort and search.
  const hrefQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (quick) params.set("quick", quick);
    if (sort) params.set("sort", sort);
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [status, quick, sort, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const seq = ++loadSeq.current;
    try {
      // The board draws every lead of the current filter at once so a card can
      // be dragged between columns; there is no pagination.
      const params = new URLSearchParams();
      params.set("view", "board");
      if (status !== "all") params.set("status", status);
      if (quick) params.set("quick", quick);
      if (sort) params.set("sort", sort);
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
      // A refresh can drop leads (filtered out, soft-deleted); keep the
      // selection honest so bulk actions never act on a hidden lead.
      setSelected((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set<number>();
        for (const l of rows) if (prev.has(l.id)) next.add(l.id);
        return next.size === prev.size ? prev : next;
      });
    } catch {
      if (seq === loadSeq.current) setError("Could not load leads. Please try again.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [status, quick, sort, query]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    let active = true;
    fetch("/crm/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.user) return;
        setRole(d.user.role as string);
        if (["admin", "sales_head", "sales_manager"].includes(d.user.role)) {
          fetch("/crm/api/team/assignees")
            .then((r) => r.json())
            .then((team) => {
              if (active) setSms(team.sms || []);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const byStage = useMemo(() => {
    const grouped: Record<string, BoardLead[]> = {};
    for (const stage of LEAD_FUNNEL_STAGES) grouped[stage.key] = [];
    // Leads that left the funnel (lost / invalid / dnc) have no column of their
    // own and are not shown — the board is a view of the live funnel.
    for (const lead of leads) {
      const stage = funnelStageForStatus(lead.status);
      if (stage) grouped[stage.key].push(lead);
    }
    // Column order is the server's sort order, untouched, so the card the user
    // sees first is the one Previous/Next Lead walks to first.
    return grouped;
  }, [leads]);

  const shownIds = useMemo(
    () => LEAD_FUNNEL_STAGES.flatMap((s) => byStage[s.key].map((l) => l.id)),
    [byStage]
  );
  const selectedCount = selected.size;
  const isAdmin = role === "admin" || role === "sales_head";

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

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleColumn = useCallback((stageKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const ids = byStage[stageKey]?.map((l) => l.id) || [];
      // Select the whole column, or clear it if it is already fully selected.
      const all = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [byStage]);

  const clearSelection = () => setSelected(new Set());
  const selectAllVisible = () => setSelected(new Set(shownIds));

  const runBulk = async () => {
    if (selectedCount === 0 || !bulkAction) return;
    setBusy(true);
    setNotice("");
    try {
      const payload: Record<string, unknown> = { ids: [...selected], action: bulkAction };
      if (bulkAction === "assign_sm") payload.smId = bulkSmId === "" ? undefined : bulkSmId;
      if (bulkAction === "status") payload.status = bulkStatus;
      const res = await fetch("/crm/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error || "Bulk action failed");
      } else {
        setNotice(
          bulkAction === "delete"
            ? `Deleted ${data.updated} lead(s)`
            : bulkAction === "assign_sm"
              ? `Assigned ${data.updated} lead(s) to SM`
              : `Updated ${data.updated} lead(s)`
        );
        setSelected(new Set());
        setBulkAction("");
        setBulkSmId("");
        setBulkStatus("");
        load();
        setTimeout(() => setNotice(""), 4000);
      }
    } catch {
      setNotice("Bulk action failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    if (selectedCount === 0) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/crm/api/leads/bulk?ids=${[...selected].join(",")}`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const rows = data.leads as Record<string, unknown>[];
      const headers = [
        "ID", "Name", "Phone", "WhatsApp", "Email", "Source", "Status",
        "Location", "Sub-location", "Budget", "BHK", "Project", "Preferred Project",
        "Assigned Caller", "Assigned SM", "Created At", "Last Attempt",
      ];
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [
        headers.join(","),
        ...rows.map((r) =>
          [
            r.id, r.name, r.phone, r.whatsappNumber, r.email, r.source, r.status,
            r.location, r.sublocation, r.budget, r.bhk, r.originalProject, r.preferredProject,
            r.assignedCaller, r.assignedSm, r.createdAt, r.lastAttemptAt,
          ].map(esc).join(",")
        ),
      ];
      const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice(`Exported ${rows.length} lead(s)`);
      setTimeout(() => setNotice(""), 4000);
    } catch {
      setNotice("Export failed");
    } finally {
      setBusy(false);
    }
  };

  const selectableStatuses = Object.entries(LEAD_STATUS_LABELS).filter(
    ([s]) => !["invalid", "dnc"].includes(s)
  );
  const hidden = leads.length - shownIds.length;
  const columnHeights = "h-[calc(100vh-19rem)] min-h-[24rem]";

  return (
    <div className="space-y-3 pb-24">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, or project..."
              aria-label="Search leads"
              className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy outline-none transition-colors focus:border-primary"
            />
          </div>
          {selectedCount > 0 && (
            <button
              onClick={clearSelection}
              className="shrink-0 rounded-xl border border-border bg-white px-3 py-2.5 text-xs font-semibold text-navy hover:bg-primary/5"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {BOARD_QUICK_FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              onClick={() => setQuick(f.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                quick === f.key
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-muted hover:bg-primary/5"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {BOARD_STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                status === s
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-muted hover:bg-primary/5"
              }`}
            >
              {s === "all" ? "All Stages" : LEAD_STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AccentLegend />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSwimlanes((v) => !v)}
              aria-pressed={swimlanes}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                swimlanes
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-white text-muted hover:bg-primary/5"
              }`}
            >
              {swimlanes ? "By Sales Manager" : "Flat"}
            </button>
            <div
              className="flex items-center gap-0.5 rounded-full border border-border bg-white p-0.5"
              role="group"
              aria-label="Card density"
            >
              {(["comfortable", "compact"] as BoardDensity[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  aria-pressed={density === d}
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                    density === d ? "bg-primary text-white" : "text-muted hover:bg-primary/5"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="cursor-pointer rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-navy outline-none transition-colors hover:bg-primary/5"
              aria-label="Sort leads"
            >
              {BOARD_SORTS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted">
        <span>
          {shownIds.length} lead{shownIds.length === 1 ? "" : "s"} on the board
        </span>
        {hidden > 0 && <span>· {hidden} closed (lost / invalid) not shown</span>}
        {!readOnly && <span>· Drag a card to another column to change its stage</span>}
      </div>

      {loading ? (
        <div className={`flex gap-3 ${columnHeights}`}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 animate-pulse rounded-2xl border border-border bg-gray-50" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <p className="text-sm font-semibold text-navy">No leads found</p>
          <p className="mt-1 text-xs text-muted">Try changing the filters, or create a new lead.</p>
        </div>
      ) : (
        <div className="flex items-stretch gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          {LEAD_FUNNEL_STAGES.map((stage) => (
            <BoardColumn
              key={stage.key}
              stage={stage}
              cards={byStage[stage.key]}
              selected={selected}
              density={density}
              swimlanes={swimlanes}
              collapsed={collapsed.has(stage.key)}
              readOnly={readOnly}
              draggingId={draggingId}
              overStage={overStage}
              pendingId={pendingId}
              onToggleCollapse={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(stage.key)) next.delete(stage.key);
                  else next.add(stage.key);
                  return next;
                })
              }
              onToggleSelect={toggleSelect}
              onSelectColumn={() => toggleColumn(stage.key)}
              onDragStart={(e, id) => {
                e.dataTransfer.setData("text/plain", String(id));
                e.dataTransfer.effectAllowed = "move";
                setDraggingId(id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setOverStage(null);
              }}
              onDragOverColumn={() => setOverStage(stage.key)}
              onDragLeaveColumn={() =>
                setOverStage((s) => (s === stage.key ? null : s))
              }
              onDrop={(id) => {
                setOverStage(null);
                setDraggingId(null);
                const lead = leads.find((l) => l.id === id);
                if (lead) void moveLead(lead, stage.status);
              }}
              onOpen={(id) => router.push(`/crm/leads/${id}${hrefQuery}`)}
            />
          ))}
        </div>
      )}

      {selectedCount > 0 && !readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-navy">{selectedCount} selected</span>
              {selectedCount < shownIds.length && (
                <button
                  onClick={selectAllVisible}
                  className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-navy hover:bg-primary/5"
                >
                  Select all {shownIds.length}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => setBulkAction("assign_sm")}
                  disabled={busy}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Assign to SM
                </button>
              )}
              <button
                onClick={() => setBulkAction("status")}
                disabled={busy}
                className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-primary/5 disabled:opacity-50"
              >
                Change Status
              </button>
              <button
                onClick={exportCsv}
                disabled={busy}
                className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-primary/5 disabled:opacity-50"
              >
                Export CSV
              </button>
              {isAdmin && (
                <button
                  onClick={() => setBulkAction("delete")}
                  disabled={busy}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {bulkAction && !readOnly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            {bulkAction === "delete" && (
              <>
                <h3 className="text-sm font-bold text-navy">Delete {selectedCount} lead(s)?</h3>
                <p className="mt-1 text-xs text-muted">
                  Leads will be soft-deleted and hidden from all views. This can be reversed by an admin.
                </p>
              </>
            )}
            {bulkAction === "assign_sm" && (
              <>
                <h3 className="text-sm font-bold text-navy">Assign {selectedCount} lead(s) to SM</h3>
                <select
                  value={bulkSmId}
                  onChange={(e) => setBulkSmId(e.target.value ? Number(e.target.value) : "")}
                  className="mt-3 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-primary"
                >
                  <option value="">Auto (least loaded)</option>
                  {sms.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </>
            )}
            {bulkAction === "status" && (
              <>
                <h3 className="text-sm font-bold text-navy">Change status of {selectedCount} lead(s)</h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectableStatuses.map(([s, label]) => (
                    <button
                      key={s}
                      onClick={() => setBulkStatus(s)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        bulkStatus === s
                          ? "bg-primary text-white"
                          : "border border-border bg-white text-muted hover:bg-primary/5"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => { setBulkAction(""); setBulkSmId(""); setBulkStatus(""); }}
                disabled={busy}
                className="rounded-lg border border-border bg-white px-4 py-2 text-xs font-semibold text-navy"
              >
                Cancel
              </button>
              <button
                onClick={runBulk}
                disabled={
                  busy ||
                  (bulkAction === "assign_sm" && sms.length === 0) ||
                  (bulkAction === "status" && !bulkStatus)
                }
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${
                  bulkAction === "delete" ? "bg-red-600" : "bg-primary"
                }`}
              >
                {busy ? "Working..." : bulkAction === "delete" ? "Delete" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  stage,
  cards,
  selected,
  density,
  swimlanes,
  collapsed,
  readOnly,
  draggingId,
  overStage,
  pendingId,
  onToggleCollapse,
  onToggleSelect,
  onSelectColumn,
  onDragStart,
  onDragEnd,
  onDragOverColumn,
  onDragLeaveColumn,
  onDrop,
  onOpen,
}: {
  stage: FunnelStage;
  cards: BoardLead[];
  selected: Set<number>;
  density: BoardDensity;
  swimlanes: boolean;
  collapsed: boolean;
  readOnly?: boolean;
  draggingId: number | null;
  overStage: string | null;
  pendingId: number | null;
  onToggleCollapse: () => void;
  onToggleSelect: (id: number) => void;
  onSelectColumn: () => void;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  onDragOverColumn: () => void;
  onDragLeaveColumn: () => void;
  onDrop: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  const accent = STAGE_ACCENTS[stage.key] || FALLBACK_ACCENT;
  const isOver = overStage === stage.key;
  const selectedHere = cards.filter((l) => selected.has(l.id)).length;

  const groups = useMemo(() => {
    if (!swimlanes) return null;
    const map = new Map<string, BoardLead[]>();
    for (const lead of cards) {
      const key = lead.assignedSmName || "Unassigned";
      const arr = map.get(key);
      if (arr) arr.push(lead);
      else map.set(key, [lead]);
    }
    return [...map.entries()].sort(([a], [b]) => {
      // Unassigned first: those are the leads most likely to need an owner.
      if (a === "Unassigned") return -1;
      if (b === "Unassigned") return 1;
      return a.localeCompare(b);
    });
  }, [cards, swimlanes]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={`Expand ${stage.label} column`}
        className={`flex w-11 shrink-0 flex-col items-center gap-2 rounded-2xl border py-3 transition-colors ${
          isOver ? "border-primary bg-primary/5" : "border-border bg-background/60 hover:bg-primary/5"
        }`}
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent.bar}`} />
        <span className={`text-[10px] font-bold ${accent.text} [writing-mode:vertical-rl] rotate-180`}>
          {stage.label}
        </span>
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-muted">
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
      aria-label={`${stage.label} — ${cards.length} lead${cards.length === 1 ? "" : "s"}`}
      className={`flex w-[17rem] shrink-0 flex-col overflow-hidden rounded-2xl border bg-background/60 transition-colors lg:w-auto lg:min-w-[13.5rem] lg:flex-1 ${
        isOver ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      <div className={`h-1.5 w-full shrink-0 ${accent.bar}`} />
      <header className="flex shrink-0 items-center gap-1.5 px-2.5 pb-2 pt-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={`Collapse ${stage.label} column`}
          className="text-soft transition-colors hover:text-navy"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h3 className={`min-w-0 flex-1 truncate text-xs font-bold ${accent.text}`}>{stage.label}</h3>
        {!readOnly && cards.length > 0 && (
          <button
            type="button"
            onClick={onSelectColumn}
            aria-label={`Select all ${cards.length} leads in ${stage.label}`}
            title="Select all in this column"
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
              selectedHere === cards.length
                ? `${accent.soft} ${accent.text}`
                : "bg-white text-muted hover:bg-primary/5"
            }`}
          >
            {selectedHere === cards.length ? `${selectedHere}✓` : selectedHere || cards.length}
          </button>
        )}
        {readOnly && (
          <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-muted">
            {cards.length}
          </span>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cards.length === 0 ? (
          <p className="px-1 py-6 text-center text-[11px] text-soft">{isOver ? "Drop here" : "No leads"}</p>
        ) : groups ? (
          groups.map(([name, groupCards]) => (
            <div key={name} className="flex flex-col gap-1.5">
              <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-background/95 py-0.5 backdrop-blur">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[8px] font-bold text-primary">
                  {initials(name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-muted">{name}</span>
                <span className="text-[10px] font-bold text-soft">{groupCards.length}</span>
              </div>
              {groupCards.map((lead) => (
                <BoardCard
                  key={lead.id}
                  lead={lead}
                  density={density}
                  selected={selected.has(lead.id)}
                  dragging={draggingId === lead.id}
                  pending={pendingId === lead.id}
                  readOnly={readOnly}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onToggleSelect={onToggleSelect}
                  onOpen={onOpen}
                />
              ))}
            </div>
          ))
        ) : (
          cards.map((lead) => (
            <BoardCard
              key={lead.id}
              lead={lead}
              density={density}
              selected={selected.has(lead.id)}
              dragging={draggingId === lead.id}
              pending={pendingId === lead.id}
              readOnly={readOnly}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onToggleSelect={onToggleSelect}
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
  density,
  selected,
  dragging,
  pending,
  readOnly,
  onDragStart,
  onDragEnd,
  onToggleSelect,
  onOpen,
}: {
  lead: BoardLead;
  density: BoardDensity;
  selected: boolean;
  dragging: boolean;
  pending: boolean;
  readOnly?: boolean;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  onToggleSelect: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  const aging = agingTone(lead.daysInStage);
  const hot = (lead.leadScore ?? 0) >= 75;
  const stripe = leadAccentCls({
    status: lead.status,
    slaStatus: lead.slaStatus,
    hasOverdueFollowUp: lead.hasOverdueFollowUp,
  });
  const selectable = !readOnly && !pending;

  const checkbox = selectable ? (
    <span
      role="checkbox"
      aria-checked={selected}
      aria-label={`Select ${lead.name}`}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelect(lead.id);
      }}
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
        selected ? "border-primary bg-primary text-white" : "border-border bg-white hover:border-primary"
      }`}
    >
      {selected && (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  ) : null;

  const body = (
    <>
      <span className={`absolute inset-y-0 left-0 w-1 ${stripe}`} aria-hidden="true" />
      {density === "compact" ? (
        <div className="flex items-center gap-1.5 pl-2">
          {checkbox}
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-navy">
            {lead.name}
          </span>
          {lead.assignedSmName && (
            <span
              title={`SM: ${lead.assignedSmName}`}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[8px] font-bold text-primary"
            >
              {initials(lead.assignedSmName)}
            </span>
          )}
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${aging.cls}`}>
            {aging.label}
          </span>
        </div>
      ) : (
        <div className="pl-2">
          <div className="flex items-start gap-1.5">
            {checkbox}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-1.5">
                <span className="truncate text-xs font-bold text-navy">{lead.name}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${aging.cls}`}
                  title="Days in this stage"
                >
                  {aging.label}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {lead.bhk && (
                  <span className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    {bhkLabel(lead.bhk)}
                  </span>
                )}
                {lead.budget && (
                  <span className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    {lead.budget}
                  </span>
                )}
                {hot && (
                  <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                    Hot
                  </span>
                )}
                {lead.hasOverdueFollowUp && (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                    Overdue
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between gap-1.5 text-[10px] text-soft">
                <span className="truncate">{lead.phone || "—"}</span>
                {lead.assignedSmName && (
                  <span
                    title={`SM: ${lead.assignedSmName}`}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[8px] font-bold text-primary"
                  >
                    {initials(lead.assignedSmName)}
                  </span>
                )}
              </div>
              {lead.nextFollowUpDisplay && (
                <div className="mt-0.5 truncate text-[10px] text-soft">
                  Next: {lead.nextFollowUpDisplay}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <article
      draggable={selectable}
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
      className={`relative cursor-pointer overflow-hidden rounded-xl border bg-white transition-shadow ${
        dragging
          ? "border-primary opacity-40"
          : selected
            ? "border-primary shadow-sm ring-1 ring-primary/30"
            : "border-border hover:border-primary/40 hover:shadow-sm"
      } ${density === "compact" ? "px-2 py-1.5" : "p-2.5"} ${pending ? "animate-pulse" : ""}`}
    >
      {body}
    </article>
  );
}
