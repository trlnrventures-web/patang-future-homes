"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Badge } from "./ui";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from "@/lib/crm/leads";

type Lead = {
  id: number;
  name: string;
  phone: string;
  originalProject: string | null;
  location: string | null;
  bhk: string | null;
  budget: string | null;
  status: string;
  assignedSmName: string;
  assignedCallerName: string;
  createdAt: string;
  nextFollowUp: string | null;
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (quick) params.set("quick", quick);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/crm/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setLeads(data.leads);
    } catch {
      setError("Leads load karne mein dikkat aayi. Dobara try karein.");
    } finally {
      setLoading(false);
    }
  }, [status, quick, query]);

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
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search naam, phone ya project..."
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy outline-none transition-colors focus:border-primary"
        />
        <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK_FILTERS.map((f) => (
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
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
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
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <p className="text-sm font-semibold text-navy">Koi lead nahi mila</p>
          <p className="mt-1 text-xs text-muted">
            Filter change karke try karein, ya naya lead create karein.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => (
            <Link
              key={lead.id}
              href={`/crm/leads/${lead.id}`}
              className="block rounded-xl border border-border bg-white px-3.5 py-3 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-navy">
                      {lead.name}
                    </h3>
                    <Badge
                      color={
                        LEAD_STATUS_COLORS[lead.status] || "bg-gray-100 text-gray-700"
                      }
                    >
                      {LEAD_STATUS_LABELS[lead.status] || lead.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{lead.phone}</p>
                </div>
                <span className="shrink-0 text-[10px] text-soft">
                  {timeAgo(lead.createdAt)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                {lead.originalProject && (
                  <span className="rounded-md bg-background px-1.5 py-0.5">
                    📍 {lead.originalProject}
                  </span>
                )}
                {lead.bhk && (
                  <span className="rounded-md bg-background px-1.5 py-0.5">
                    {bhkLabel(lead.bhk)}
                  </span>
                )}
                {lead.budget && (
                  <span className="rounded-md bg-background px-1.5 py-0.5">
                    {lead.budget}
                  </span>
                )}
                {lead.assignedSmName && (
                  <span className="rounded-md bg-primary/5 px-1.5 py-0.5 font-semibold text-primary">
                    SM: {lead.assignedSmName}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function bhkLabel(bhk: string | null): string {
  if (!bhk) return "";
  return /BHK/i.test(bhk) ? bhk : `${bhk} BHK`;
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