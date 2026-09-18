"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "./ui";
import LeadCard from "./LeadCard";
import InboxSnapshot from "./InboxSnapshot";
import CallQueue from "./CallQueue";
import { LEAD_STATUS_LABELS } from "@/lib/crm/leads";
import { slaStatusMeta, type SlaStatus } from "@/lib/crm/sla";

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
  { key: "all", label: "All" },
];

const PRIORITY_BAR: Record<string, string> = {
  p1_new: "bg-red-500",
  p2_approaching_sla: "bg-amber-500",
  p3_overdue_call: "bg-red-600",
  p4_callback: "bg-blue-500",
  p5_ready_to_assign: "bg-violet-500",
  p6_follow_up: "bg-sky-500",
  p7_no_response: "bg-slate-400",
  p8_idle: "bg-gray-300",
};

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
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("tab", tab);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/crm/api/inbox?${params.toString()}`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setLeads(data.leads);
    } catch {
      setError("Could not load the inbox. Please try again.");
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-3">
      {queueOpen && <CallQueue onExit={closeQueue} />}

      {!loading && leads.length > 0 && (
        <InboxSnapshot leads={leads} onStartQueue={() => setQueueOpen(true)} />
      )}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, phone, project, or campaign..."
        className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy outline-none transition-colors focus:border-primary"
      />
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
          {leads.map((lead) => (
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
              accentCls={PRIORITY_BAR[lead.priority] || "bg-gray-200"}
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