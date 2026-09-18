"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "./ui";
import LeadCard from "./LeadCard";
import InboxSnapshot from "./InboxSnapshot";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, bhkLabel } from "@/lib/crm/leads";
import { dealHealthFor } from "@/lib/crm/sales";

type Lead = {
  id: number;
  name: string;
  phone: string;
  whatsappNumber: string | null;
  source: string;
  originalProject: string | null;
  location: string | null;
  bhk: string | null;
  budget: string | null;
  status: string;
  assignedSmName: string;
  assignedCallerName: string;
  createdAt: string;
  nextFollowUp: string | null;
  nextFollowUpDisplay?: string | null;
  nextAction?: string | null;
  hasOverdueFollowUp?: boolean;
  negotiationLastActive?: string | null;
  slaStatus?: string;
};

type McUser = { id: number; name: string; role: string };

const STATUS_FILTERS = ["all", "new", "calling", "qualified", "follow_up", "visit_booked", "visit_done", "negotiation", "booked", "no_response", "nurture", "lost"];

const QUICK_FILTERS = [
  { key: "", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "hot", label: "Hot" },
  { key: "unassigned", label: "Unassigned" },
  { key: "visit_today", label: "Visit Today" },
];

export default function LeadsList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [quick, setQuick] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [role, setRole] = useState("");
  const [sms, setSms] = useState<McUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [bulkAction, setBulkAction] = useState<"" | "assign_sm" | "status" | "delete">("");
  const [bulkSmId, setBulkSmId] = useState<number | "">("");
  const [bulkStatus, setBulkStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (quick) params.set("quick", quick);
      if (query.trim()) params.set("q", query.trim());
      params.set("page", String(page));
      params.set("pageSize", "20");
      const res = await fetch(`/crm/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setLeads(data.leads);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setError("Could not load leads. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [status, quick, query, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    let active = true;
    fetch("/crm/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.user) {
          setRole(d.user.role as string);
          if (d.user.role === "admin" || d.user.role === "sales_head" || d.user.role === "sales_manager") {
            fetch("/crm/api/team/assignees")
              .then((r) => r.json())
              .then((team) => {
                if (active) setSms(team.sms || []);
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const selectedCount = selected.size;
  const isAdmin = role === "admin" || role === "sales_head";

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelected(new Set());

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

  return (
    <div className="space-y-3 pb-24">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search name, phone, or project..."
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy outline-none transition-colors focus:border-primary"
          />
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
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              onClick={() => { setQuick(f.key); setPage(1); }}
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
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                status === s
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-muted hover:bg-primary/5"
              }`}
            >
              {s === "all" ? "All" : LEAD_STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-[9.5rem] animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <p className="text-sm font-semibold text-navy">No leads found</p>
          <p className="mt-1 text-xs text-muted">
            Try changing the filters, or create a new lead.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-1 text-xs text-muted">
            <span>
              {selectedCount > 0 ? (
                <span className="font-semibold text-primary">{selectedCount} selected</span>
              ) : (
                "Tap a card to select for bulk actions"
              )}
            </span>
            <button
              onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setPage((p) => Math.max(1, p - 1)); }}
              disabled={page <= 1}
              className="rounded-lg border border-border bg-white px-3 py-1.5 font-semibold text-navy disabled:opacity-40"
            >
              ← Prev
            </button>
            <span>
              Page {page} / {totalPages} · {total} leads
            </span>
            <button
              onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setPage((p) => Math.min(totalPages, p + 1)); }}
              disabled={page >= totalPages}
              className="rounded-lg border border-border bg-white px-3 py-1.5 font-semibold text-navy disabled:opacity-40"
            >
              Next →
            </button>
          </div>
          <InboxSnapshot leads={leads} />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={{
                  id: lead.id,
                  name: lead.name,
                  phone: lead.phone,
                  whatsappNumber: lead.whatsappNumber,
                  statusLabel: LEAD_STATUS_LABELS[lead.status] || lead.status,
                  statusCls: LEAD_STATUS_COLORS[lead.status] || "bg-gray-100 text-gray-700",
                  nextAction: lead.nextAction || undefined,
                  nextFollowUpDisplay: lead.nextFollowUpDisplay || lead.nextFollowUp || null,
                  hasOverdueFollowUp: lead.hasOverdueFollowUp,
                }}
                selected={selected.has(lead.id)}
                onToggleSelect={() => toggleSelect(lead.id)}
                accentCls={accentFor(lead.status)}
                badges={
                  lead.status === "negotiation" && lead.negotiationLastActive ? (() => {
                    const h = dealHealthFor(lead.negotiationLastActive);
                    return (
                      <Badge color={h.cls}>
                        {h.label} · {h.days}d
                      </Badge>
                    );
                  })() : undefined
                }
                pills={
                  <>
                    {lead.originalProject && (
                      <span className="rounded-md bg-background px-2 py-0.5 text-[10px] text-muted">
                        {lead.originalProject}
                      </span>
                    )}
                    {lead.bhk && (
                      <span className="rounded-md bg-background px-2 py-0.5 text-[10px] text-muted">
                        {bhkLabel(lead.bhk)}
                      </span>
                    )}
                    {lead.budget && (
                      <span className="rounded-md bg-background px-2 py-0.5 text-[10px] text-muted">
                        {lead.budget}
                      </span>
                    )}
                    {lead.assignedSmName && (
                      <span className="rounded-md bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        SM: {lead.assignedSmName}
                      </span>
                    )}
                  </>
                }
                footerNote={
                  <span className="text-soft">{timeAgo(lead.createdAt)}</span>
                }
              />
            ))}
          </div>
          <div className="flex items-center justify-between px-1 text-xs text-muted">
            <button
              onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setPage((p) => Math.max(1, p - 1)); }}
              disabled={page <= 1}
              className="rounded-lg border border-border bg-white px-3 py-1.5 font-semibold text-navy disabled:opacity-40"
            >
              ← Prev
            </button>
            <span>
              Page {page} / {totalPages} · {total} leads
            </span>
            <button
              onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setPage((p) => Math.min(totalPages, p + 1)); }}
              disabled={page >= totalPages}
              className="rounded-lg border border-border bg-white px-3 py-1.5 font-semibold text-navy disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </>
      )}

      {selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-navy">{selectedCount} selected</span>
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

      {bulkAction && (
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

function accentFor(status: string): string {
  switch (status) {
    case "new":
      return "bg-red-500";
    case "calling":
    case "connected":
    case "follow_up":
      return "bg-amber-500";
    case "qualified":
    case "assigned":
      return "bg-violet-500";
    case "negotiation":
      return "bg-fuchsia-500";
    case "booked":
      return "bg-emerald-500";
    case "no_response":
      return "bg-slate-400";
    case "nurture":
      return "bg-indigo-500";
    default:
      return "bg-gray-300";
  }
}

function timeAgo(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "1d ago";
    return `${days}d ago`;
  } catch {
    return "";
  }
}