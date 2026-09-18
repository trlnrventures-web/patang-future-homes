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

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          placeholder="Search name, phone, or project..."
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy outline-none transition-colors focus:border-primary"
        />
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
          <InboxSnapshot leads={leads} />
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