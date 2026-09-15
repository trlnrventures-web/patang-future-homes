"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Badge, PhoneIcon, WhatsAppIcon } from "./ui";
import { LEAD_STATUS_LABELS } from "@/lib/crm/leads";
import { slaStatusMeta, type SlaStatus } from "@/lib/crm/sla";
import { formatPhoneForWhatsApp } from "@/lib/crm/messages";
import type { DailyMetrics } from "@/lib/crm/reports";
import { formatReportDate } from "@/lib/crm/report-text";

type Card = {
  id: number;
  name: string;
  phone: string;
  whatsappNumber: string | null;
  source: string;
  campaignName: string | null;
  originalProject: string | null;
  status: string;
  concern: string | null;
  nextAction: string;
  nextFollowUp: string;
  nextFollowUpIso: string | null;
  hasOverdueFollowUp: boolean;
  priority: string;
  leadAge: string;
  attemptCount: number;
  slaStatus: string;
  assignedSmName: string;
};

type Queues = {
  callNow: Card[];
  followUpsToday: Card[];
  overdue: Card[];
  newToday: Card[];
  noResponse: Card[];
};

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

const SECTIONS: { key: keyof Queues; title: string; accent?: boolean; empty: string }[] = [
  { key: "callNow", title: "CALL NOW", accent: true, empty: "Is waqt koi urgent call nahi hai" },
  { key: "followUpsToday", title: "FOLLOW-UPS TODAY", empty: "Aaj ka koi follow-up scheduled nahi hai" },
  { key: "overdue", title: "OVERDUE", empty: "Koi overdue follow-up nahi hai" },
  { key: "newToday", title: "NEW TODAY", empty: "Aaj koi naya lead nahi aaya" },
  { key: "noResponse", title: "NO RESPONSE", empty: "No-response list khali hai" },
];

export default function CallerDashboard({ name }: { name: string }) {
  const [queues, setQueues] = useState<Queues>({ callNow: [], followUpsToday: [], overdue: [], newToday: [], noResponse: [] });
  const [metrics, setMetrics] = useState<DailyMetrics | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [clock, setClock] = useState("");
  const [istDate, setIstDate] = useState("");
  const [greetingLabel, setGreetingLabel] = useState("Good Morning");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const ist = new Date(Date.now() + (5 * 60 + 30) * 60000);
      setClock(ist.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }));
      setIstDate(ist.toISOString().slice(0, 10));
      const h = ist.getUTCHours();
      setGreetingLabel(h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening");
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
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
        setMetrics(data.metrics);
        setCounts(data.counts);
      } catch {
        if (!cancelled) setError("Dashboard load nahi ho paya");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const match = useCallback(
    (c: Card) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone || "").includes(q) ||
        (c.originalProject || "").toLowerCase().includes(q) ||
        (c.campaignName || "").toLowerCase().includes(q)
      );
    },
    [query]
  );

  const scrollToSection = (key: string) => {
    setActiveSection(key);
    document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const greeting = greetingLabel;

  const totalActive = useMemo(
    () =>
      Object.values(queues).reduce(
        (sum, list) => sum + (query.trim() ? list.filter(match).length : list.length),
        0
      ),
    [queues, query, match]
  );

  const kpiItems = [
    { label: "CALL NOW", value: counts?.callNow ?? 0, key: "callNow", color: "bg-red-50 text-red-700" },
    { label: "Overdue", value: counts?.overdue ?? 0, key: "overdue", color: "bg-red-600 text-white" },
    { label: "Follow-ups Today", value: counts?.followUpsToday ?? 0, key: "followUpsToday", color: "bg-sky-50 text-sky-700" },
    { label: "New Today", value: counts?.newToday ?? 0, key: "newToday", color: "bg-amber-50 text-amber-800" },
    { label: "No Response", value: counts?.noResponse ?? 0, key: "noResponse", color: "bg-slate-50 text-slate-700" },
  ];

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Sticky compact header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-primary">{greeting}, {name.split(" ")[0]} ji</div>
          <div className="mt-0.5 text-sm font-bold text-navy">
            {istDate ? formatReportDate(istDate) : ""}
            <span className="ml-2 rounded-md bg-background px-2 py-0.5 text-[10px] font-semibold text-muted">
              {clock} IST
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/crm/reports" className="rounded-xl border border-border bg-white px-3 py-2 text-xs font-bold text-primary">
            MY REPORT
          </Link>
          <Link href="/crm/leads" className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white">
            FULL INBOX →
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {kpiItems.map((k) => (
          <button
            key={k.key}
            onClick={() => scrollToSection(k.key)}
            className={`rounded-2xl p-3 text-left transition-transform active:scale-95 ${k.color} ${activeSection === k.key ? "ring-2 ring-primary ring-offset-1" : ""}`}
          >
            <div className="text-xl font-bold">{k.value}</div>
            <div className="text-[10px] font-semibold opacity-80">{k.label}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Naam, phone, project, campaign search..."
        className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy outline-none transition-colors focus:border-primary"
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : totalActive === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-10 text-center">
          <p className="text-sm font-semibold text-navy">
            {query.trim() ? "Is search se koi lead nahi mila" : "Saare queues clear hain"}
          </p>
          <p className="mt-1 text-xs text-muted">Aaj ka kaam khatam ya abhi koi lead hai nahi.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {SECTIONS.map((s) => {
            const list = queues[s.key].filter(match);
            if (list.length === 0) return null;
            return (
              <section key={s.key} id={`section-${s.key}`} className="scroll-mt-20">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
                    <span className={`h-2 w-2 rounded-full ${s.accent ? "bg-red-600 animate-pulse" : "bg-primary"}`} />
                    {s.title}
                    <span className="rounded-md bg-background px-1.5 py-0.5 text-[10px] font-bold text-muted">
                      {list.length}
                    </span>
                  </h2>
                  <Link href="/crm/leads" className="text-[11px] font-semibold text-primary hover:underline">
                    View all →
                  </Link>
                </div>
                <div className="space-y-2.5">
                  {s.accent && list[0] && <LeadCard card={list[0]} primary />}
                  {list.slice(1).map((c) => (
                    <LeadCard key={c.id} card={c} />
                  ))}
                </div>
              </section>
            );
          })}

          {/* My Performance Today */}
          {metrics && (
            <section className="rounded-2xl border border-border bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-navy">MY PERFORMANCE TODAY</h2>
                <Link href="/crm/reports" className="text-[11px] font-semibold text-primary hover:underline">
                  Full report →
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                <MiniP label="New Leads" value={metrics.newLeads} />
                <MiniP label="Calls Made" value={metrics.calls} />
                <MiniP label="Connected" value={metrics.connected} />
                <MiniP label="Qualified" value={metrics.qualified} />
                <MiniP label="Assigned to SM" value={metrics.assigned} />
                <MiniP label="Follow-ups Done" value={metrics.followUpsCompleted} />
                <MiniP label="No Response" value={metrics.noResponse} />
                <MiniP label="Bookings" value={metrics.bookings} />
              </div>
            </section>
          )}
        </div>
      )}

      {/* Mobile sticky actions */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 p-2 backdrop-blur sm:hidden">
        <div className="flex gap-2">
          <button
            onClick={() => scrollToSection("callNow")}
            className="flex-1 rounded-xl bg-primary py-3 text-xs font-bold text-white"
          >
            📞 CALL NOW
          </button>
          <Link href="/crm/reports" className="flex-1 rounded-xl border border-border py-3 text-center text-xs font-bold text-primary">
            REPORT
          </Link>
          <Link href="/crm/leads" className="flex-1 rounded-xl border border-border py-3 text-center text-xs font-bold text-primary">
            INBOX
          </Link>
        </div>
      </div>
      <div className="h-12 sm:hidden" />
    </div>
  );
}

function MiniP({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-xl bg-background px-2 py-2 text-center">
      <div className="text-base font-bold text-primary">{value ?? 0}</div>
      <div className="text-[10px] font-semibold text-muted">{label}</div>
    </div>
  );
}

function LeadCard({ card, primary }: { card: Card; primary?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-2xl border ${primary ? "border-primary/30 bg-primary/5" : "border-border bg-white"}`}>
      <div className="flex">
        <div className={`w-1 shrink-0 ${PRIORITY_DOT[card.priority] || "bg-gray-200"}`} />
        <div className="min-w-0 flex-1 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-sm font-bold text-navy">{card.name}</h3>
                <Badge color={slaStatusMeta(card.slaStatus as SlaStatus).cls}>
                  {slaStatusMeta(card.slaStatus as SlaStatus).label}
                </Badge>
              </div>
              <a href={`tel:+${card.phone.replace(/\D/g, "")}`} className="mt-0.5 block text-xs font-semibold text-primary">
                {card.phone}
              </a>
            </div>
            <span className="shrink-0 text-[10px] text-soft">{card.leadAge}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <Badge color="bg-primary/5 text-primary">{SOURCE_LABELS[card.source] || card.source}</Badge>
            <Badge color={statusColor(card.status)}>{LEAD_STATUS_LABELS[card.status] || card.status}</Badge>
            {card.originalProject && <span className="rounded-md bg-background px-2 py-1">{card.originalProject}</span>}
            {card.campaignName && <span className="rounded-md bg-background px-2 py-1">{card.campaignName}</span>}
            {card.assignedSmName && (
              <span className="rounded-md bg-violet-50 px-2 py-1 font-semibold text-violet-700">SM: {card.assignedSmName}</span>
            )}
          </div>

          {card.concern && (
            <div className="mt-1.5 text-[11px] font-semibold text-amber-700">Concern: {card.concern}</div>
          )}

          <div className="mt-2 flex items-center gap-3 border-t border-border pt-2 text-[11px]">
            <span className="font-semibold text-navy">
              Next: <span className="text-primary">{card.nextAction}</span>
            </span>
            {card.nextFollowUp && (
              <span className={card.hasOverdueFollowUp ? "font-semibold text-red-600" : "text-soft"}>
                {card.hasOverdueFollowUp ? "Overdue: " : "Due: "}
                {card.nextFollowUp}
              </span>
            )}
            {card.attemptCount > 0 && <span className="ml-auto text-soft">Attempts: {card.attemptCount}</span>}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <a
              href={`tel:+${card.phone.replace(/\D/g, "")}`}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-white"
            >
              <PhoneIcon />
              CALL
            </a>
            <a
              href={`https://wa.me/${formatPhoneForWhatsApp(card.whatsappNumber || card.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2.5 text-xs font-bold text-white"
            >
              <WhatsAppIcon />
              WHATSAPP
            </a>
            <Link
              href={`/crm/leads/${card.id}`}
              className="flex items-center justify-center rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs font-bold text-primary"
            >
              OPEN →
            </Link>
          </div>
        </div>
      </div>
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