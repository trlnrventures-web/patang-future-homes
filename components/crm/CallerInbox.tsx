"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Badge, PhoneIcon, WhatsAppIcon } from "./ui";
import { LEAD_STATUS_LABELS } from "@/lib/crm/leads";
import { slaStatusMeta, type SlaStatus } from "@/lib/crm/sla";
import { formatPhoneForWhatsApp } from "@/lib/crm/messages";

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

const PRIORITY_DOT: Record<string, string> = {
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
      setError("Inbox load nahi ho paya. Dobara try karein.");
    } finally {
      setLoading(false);
    }
  }, [tab, query]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Naam, phone, project, campaign search..."
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
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-10 text-center">
          <p className="text-sm font-semibold text-navy">Is queue mein koi lead nahi hai</p>
          <p className="mt-1 text-xs text-muted">
            Dobara check karein ya kisi aur tab pe dekhen.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {leads.map((lead) => (
            <div
              key={lead.id}
              className="overflow-hidden rounded-2xl border border-border bg-white"
            >
              <div className="flex">
                <div className={`w-1 shrink-0 ${PRIORITY_DOT[lead.priority] || "bg-gray-200"}`} />
                <div className="min-w-0 flex-1 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate text-sm font-bold text-navy">{lead.name}</h3>
                        <Badge color={slaStatusMeta(lead.slaStatus as SlaStatus).cls}>
                          {slaStatusMeta(lead.slaStatus as SlaStatus).label}
                        </Badge>
                      </div>
                      <a
                        href={`tel:+${lead.phone.replace(/\D/g, "")}`}
                        className="mt-0.5 block text-xs font-semibold text-primary"
                      >
                        {lead.phone}
                      </a>
                    </div>
                    <span className="shrink-0 text-[10px] text-soft">{lead.leadAge}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <Badge color="bg-primary/5 text-primary">
                      {SOURCE_LABELS[lead.source] || lead.source}
                    </Badge>
                    <Badge color={statusColor(lead.status)}>
                      {LEAD_STATUS_LABELS[lead.status] || lead.status}
                    </Badge>
                    {lead.originalProject && (
                      <span className="rounded-md bg-background px-2 py-1">
                        {lead.originalProject}
                      </span>
                    )}
                    {lead.campaignName && (
                      <span className="rounded-md bg-background px-2 py-1">
                        {lead.campaignName}
                      </span>
                    )}
                    {lead.assignedSmName && (
                      <span className="rounded-md bg-violet-50 px-2 py-1 font-semibold text-violet-700">
                        SM: {lead.assignedSmName}
                      </span>
                    )}
                  </div>

                  {lead.concern && (
                    <div className="mt-1.5 text-[11px] font-semibold text-amber-700">
                      Concern: {lead.concern}
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-3 border-t border-border pt-2 text-[11px]">
                    <span className="font-semibold text-navy">
                      Next: <span className="text-primary">{lead.nextAction}</span>
                    </span>
                    {lead.nextFollowUp && (
                      <span className={lead.hasOverdueFollowUp ? "font-semibold text-red-600" : "text-soft"}>
                        {lead.hasOverdueFollowUp ? "Overdue: " : "Due: "}
                        {lead.nextFollowUp}
                      </span>
                    )}
                    {lead.attemptCount > 0 && (
                      <span className="ml-auto text-soft">Attempts: {lead.attemptCount}</span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <a
                      href={`tel:+${lead.phone.replace(/\D/g, "")}`}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-white"
                    >
                      <PhoneIcon />
                      CALL
                    </a>
                    <a
                      href={`https://wa.me/${formatPhoneForWhatsApp(lead.whatsappNumber || lead.phone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2.5 text-xs font-bold text-white"
                    >
                      <WhatsAppIcon />
                      WHATSAPP
                    </a>
                    <Link
                      href={`/crm/leads/${lead.id}`}
                      className="flex items-center justify-center rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs font-bold text-primary"
                    >
                      OPEN →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
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