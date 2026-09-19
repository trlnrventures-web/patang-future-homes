"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Badge } from "./ui";
import LeadCard from "./LeadCard";
import InboxSnapshot from "./InboxSnapshot";
import AccentLegend from "./AccentLegend";
import CallQueue from "./CallQueue";
import { LEAD_STATUS_LABELS } from "@/lib/crm/leads";
import { slaStatusMeta, type SlaStatus, leadAccentCls } from "@/lib/crm/sla";
type InboxLead = {
  id: number;
  name: string;
  phone: string;
  whatsappNumber: string | null;
  source: string;
  campaignName: string | null;
  originalProject: string | null;
  location: string | null;
  bhk: string | null;
  budget: string | null;
  status: string;
  concern: string | null;
  createdAt: string;
  nextFollowUp: string;
  nextAction: string;
  slaStatus: string;
  priority: string;
  leadAge: string;
  leadAgeMinutes: number;
  attemptCount: number;
  assignedCallerName: string;
  assignedSmName: string;
  nextFollowUpIso: string | null;
  hasOverdueFollowUp: boolean;
};

const TABS: { key: string; label: string }[] = [
  { key: "new", label: "New" },
  { key: "calling_now", label: "Calling Now" },
  { key: "today_calls", label: "Today's Calls" },
  { key: "overdue", label: "Overdue" },
  { key: "no_response", label: "No Response" },
  { key: "qualified", label: "Qualified" },
  { key: "ready_to_assign", label: "Ready to Assign" },
  { key: "recently_assigned", label: "Assigned" },
  { key: "follow_up", label: "Follow-ups" },
  { key: "lost", label: "Lost" },
  { key: "all", label: "All" },
];

const SORT_OPTIONS = [
  { key: "newest", label: "Newest First" },
  { key: "oldest", label: "Oldest First" },
  { key: "overdue", label: "Most Overdue First" },
];

function sortInboxLeads(list: InboxLead[], sort: string): InboxLead[] {
  const arr = [...list];
  const actionMs = (x: InboxLead) =>
    x.nextFollowUpIso ? new Date(x.nextFollowUpIso).getTime() : Infinity;
  if (sort === "oldest") {
    return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  if (sort === "overdue") {
    return arr.sort((a, b) => {
      if (!!a.hasOverdueFollowUp !== !!b.hasOverdueFollowUp) {
        return a.hasOverdueFollowUp ? -1 : 1;
      }
      return actionMs(a) - actionMs(b);
    });
  }
  return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const SOURCE_LABELS: Record<string, string> = {
  meta: "Meta Lead",
  website: "Website",
  walk_in: "Walk-in",
  referral: "Referral",
  other: "Lead",
};

export default function CallerInbox() {
  const [leads, setLeads] = useState<InboxLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("new");
  const [sort, setSort] = useState("newest");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const loadSeq = useRef(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runBulkStatus = async () => {
    if (!bulkStatus || selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/crm/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action: "status", status: bulkStatus }),
      });
      const data = await res.json();
      if (!res.ok) setNotice(data.error || "Bulk update failed");
      else {
        setNotice(`Updated ${data.updated} lead(s)`);
        setSelected(new Set());
        setBulkOpen(false);
        setBulkStatus("");
        load();
        setTimeout(() => setNotice(""), 4000);
      }
    } catch {
      setNotice("Bulk update failed");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/crm/api/leads/bulk?ids=${[...selected].join(",")}`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const rows = data.leads as Record<string, unknown>[];
      const headers = ["ID", "Name", "Phone", "WhatsApp", "Email", "Source", "Status", "Location", "Sub-location", "Budget", "BHK", "Project", "Preferred Project", "Assigned Caller", "Assigned SM", "Created At"];
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [headers.join(","), ...rows.map((r) => [r.id, r.name, r.phone, r.whatsappNumber, r.email, r.source, r.status, r.location, r.sublocation, r.budget, r.bhk, r.originalProject, r.preferredProject, r.assignedCaller, r.assignedSm, r.createdAt].map(esc).join(","))];
      const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setNotice("Export failed");
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const seq = ++loadSeq.current;
    try {
      const params = new URLSearchParams();
      params.set("tab", tab);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/crm/api/inbox?${params.toString()}`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      if (seq !== loadSeq.current) return;
      const seen = new Set<number>();
      setLeads(
        (data.leads as InboxLead[]).filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)))
      );
    } catch {
      if (seq === loadSeq.current) setError("Could not load the inbox. Please try again.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [tab, query]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const closeQueue = () => {
    setQueueOpen(false);
    load();
  };

  const sortedLeads = useMemo(() => sortInboxLeads(leads, sort), [leads, sort]);

  return (
    <div className="space-y-3 pb-24">
      {queueOpen && <CallQueue onExit={closeQueue} />}

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {notice}
        </div>
      )}

      {!loading && leads.length > 0 && (
        <InboxSnapshot leads={leads} onStartQueue={() => setQueueOpen(true)} />
      )}

      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, project, or campaign..."
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy outline-none transition-colors focus:border-primary"
        />
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Set())}
            className="shrink-0 rounded-xl border border-border bg-white px-3 py-3 text-xs font-semibold text-navy hover:bg-primary/5"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.key
                ? "bg-primary text-white"
                : "border border-border bg-white text-muted hover:bg-primary/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AccentLegend />
        <div className="ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="cursor-pointer rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy outline-none transition-colors hover:bg-primary/5"
            aria-label="Sort inbox leads"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-[9.5rem] animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-10 text-center">
          <p className="text-sm font-semibold text-navy">No leads in this queue</p>
          <p className="mt-1 text-xs text-muted">
            Check again later or switch to a different tab.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {sortedLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={{
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                whatsappNumber: lead.whatsappNumber,
                statusLabel: LEAD_STATUS_LABELS[lead.status] || lead.status,
                statusCls: statusColor(lead.status),
                slaLabel: slaStatusMeta(lead.slaStatus as SlaStatus).label,
                slaCls: slaStatusMeta(lead.slaStatus as SlaStatus).cls,
                nextAction: lead.nextAction,
                nextFollowUpDisplay: lead.nextFollowUp || null,
                hasOverdueFollowUp: lead.hasOverdueFollowUp,
              }}
              selected={selected.has(lead.id)}
              onToggleSelect={() => toggleSelect(lead.id)}
              accentCls={leadAccentCls({
                status: lead.status,
                slaStatus: lead.slaStatus,
                hasOverdueFollowUp: lead.hasOverdueFollowUp,
              })}
              badges={
                lead.assignedSmName ? (
                  <Badge color="bg-violet-50 text-violet-700">SM: {lead.assignedSmName}</Badge>
                ) : undefined
              }
              pills={
                <>
                  <span className="rounded-md bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {SOURCE_LABELS[lead.source] || lead.source}
                  </span>
                  {lead.originalProject && (
                    <span className="rounded-md bg-background px-2 py-0.5 text-[10px] text-muted">
                      {lead.originalProject}
                    </span>
                  )}
                  {lead.campaignName && (
                    <span className="rounded-md bg-background px-2 py-0.5 text-[10px] text-muted">
                      {lead.campaignName}
                    </span>
                  )}
                  {lead.concern && (
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      {lead.concern}
                    </span>
                  )}
                  <span className="text-[10px] text-soft">{lead.leadAge}</span>
                  {lead.attemptCount > 0 && (
                    <span className="text-[10px] text-soft">Attempts: {lead.attemptCount}</span>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-navy">{selected.size} selected</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setBulkOpen(true)}
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
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-bold text-navy">Change status of {selected.size} lead(s)</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(LEAD_STATUS_LABELS)
                .filter(([s]) => !["invalid", "dnc"].includes(s))
                .map(([s, label]) => (
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
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => { setBulkOpen(false); setBulkStatus(""); }}
                disabled={busy}
                className="rounded-lg border border-border bg-white px-4 py-2 text-xs font-semibold text-navy"
              >
                Cancel
              </button>
              <button
                onClick={runBulkStatus}
                disabled={busy || !bulkStatus}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Working..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "new":
      return "bg-red-50 text-red-700";
    case "calling":
    case "connected":
      return "bg-amber-50 text-amber-800";
    case "qualified":
      return "bg-emerald-50 text-emerald-800";
    case "assigned":
      return "bg-violet-50 text-violet-800";
    case "no_response":
      return "bg-slate-100 text-slate-700";
    case "booked":
      return "bg-green-100 text-green-800";
    case "invalid":
    case "lost":
    case "dnc":
      return "bg-red-50 text-red-600";
    default:
      return "bg-background text-muted";
  }
}