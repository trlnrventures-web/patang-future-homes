"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Badge } from "./ui";

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month" | "last_month" | "custom";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "custom", label: "Custom" },
];

const SOURCE_LABELS: Record<string, string> = {
  meta: "Meta",
  facebook: "Facebook",
  google: "Google",
  organic: "Organic",
  website: "Website",
  walk_in: "Walk-in",
  referral: "Referral",
  other: "Other",
};

type RangeInfo = { key: string; from: string; to: string; label: string };

type Overview = {
  range: RangeInfo;
  canViewFinance: boolean;
  totalSpend: number | null;
  totalLeads: number;
  cpl: number | null;
  totalQualified: number;
  cpql: number | null;
  totalVisitsBooked: number;
  totalVisitsCompleted: number;
  costPerVisit: number | null;
  totalBookings: number;
  costPerBooking: number | null;
  totalBookingValue: number | null;
};

type Campaign = {
  id: number;
  name: string;
  platform: string;
  project: string | null;
  objective: string | null;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  status: string;
  notes: string | null;
  leads: number;
  contacted: number;
  qualified: number;
  visitsBooked: number;
  visitsCompleted: number;
  negotiations: number;
  bookings: number;
  bookingValue: number | null;
  totalSpend: number | null;
  cpl: number | null;
  cpql: number | null;
  costPerVisit: number | null;
  costPerBooking: number | null;
};

type SourceRow = {
  source: string;
  leads: number;
  contacted: number;
  qualified: number;
  visitsBooked: number;
  visitsCompleted: number;
  negotiations: number;
  bookings: number;
  spend: number | null;
  cpl: number | null;
  cpql: number | null;
  costPerBooking: number | null;
};

type ProjectRow = {
  project: string;
  leads: number;
  qualified: number;
  visitsBooked: number;
  visitsCompleted: number;
  negotiations: number;
  bookings: number;
  bookingValue: number | null;
};

type CrossProjectRow = { originalProject: string; bookedProject: string; count: number };

type IntegrationRow = {
  platform: string;
  connected: boolean;
  lastSynced: string | null;
  syncError: string | null;
};

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-IN");

const fmtMoney = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : `₹${Number(n).toLocaleString("en-IN")}`;

const pct = (a: number, b: number): string =>
  b > 0 ? `${Math.round((a / b) * 100)}%` : "—";

export default function MarketingCenter({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tab, setTab] = useState<"overview" | "campaigns" | "sources" | "projects">("campaigns");

  const query = useMemo(() => {
    const p = new URLSearchParams({ range: rangeKey });
    if (rangeKey === "custom" && customFrom) p.set("from", customFrom);
    if (rangeKey === "custom" && customTo) p.set("to", customTo);
    return p.toString();
  }, [rangeKey, customFrom, customTo]);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [projects, setProjects] = useState<{ byProject: ProjectRow[]; crossProject: CrossProjectRow[] } | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, cp, sc, pj, ig] = await Promise.all([
        fetch(`/crm/api/marketing/overview?${query}`).then((r) => r.json()),
        fetch(`/crm/api/marketing/campaigns?${query}`).then((r) => r.json()),
        fetch(`/crm/api/marketing/sources?${query}`).then((r) => r.json()),
        fetch(`/crm/api/marketing/projects?${query}`).then((r) => r.json()),
        fetch(`/crm/api/marketing/integrations`).then((r) => r.json()),
      ]);
      if (ov.error) throw new Error(ov.error);
      setOverview(ov);
      setCampaigns(cp.campaigns || []);
      setSources(sc.sources || []);
      setProjects(pj);
      setIntegrations(ig.platforms || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load marketing data");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const finance = overview?.canViewFinance ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary sm:text-2xl">Marketing</h1>
          <p className="mt-1 text-sm text-muted">
            Campaign → Lead → Qualified → Visit → Booking
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as RangeKey)}
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {RANGE_OPTIONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          {rangeKey === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy focus:outline-none"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy focus:outline-none"
              />
            </>
          )}
          {role === "admin" || role === "sales_head" ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              + New Campaign
            </Button>
          ) : null}
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </Card>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["campaigns", "Campaigns"],
            ["overview", "Overview"],
            ["sources", "Lead Sources"],
            ["projects", "Project Demand"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? "bg-primary text-white shadow-sm shadow-primary/20"
                : "bg-white text-muted border border-border hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="p-8 text-center text-sm text-muted">Loading…</Card>
      ) : tab === "campaigns" ? (
        <CampaignsTab
          campaigns={campaigns}
          finance={finance}
          rangeLabel={overview?.range.label || ""}
          role={role}
          onChanged={() => loadAll()}
        />
      ) : tab === "overview" ? (
        <OverviewTab
          overview={overview}
          crossProject={projects?.crossProject || []}
          integrations={integrations}
          finance={finance}
        />
      ) : tab === "sources" ? (
        <SourcesTab sources={sources} finance={finance} />
      ) : (
        <ProjectsTab projects={projects?.byProject || []} crossProject={projects?.crossProject || []} finance={finance} />
      )}

      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

function CampaignsTab({
  campaigns,
  finance,
  rangeLabel,
  role,
  onChanged,
}: {
  campaigns: Campaign[];
  finance: boolean;
  rangeLabel: string;
  role: string;
  onChanged: () => void;
}) {
  const [sortKey, setSortKey] = useState<"leads" | "qualified" | "visitsBooked" | "bookings" | "spend" | "cpl" | "cpql">("leads");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterProject, setFilterProject] = useState("all");

  const projects = useMemo(() => {
    const all = campaigns.map((c) => c.project).filter(Boolean) as string[];
    return [...new Set(all)];
  }, [campaigns]);

  const sortValue = (c: Campaign): number => {
    switch (sortKey) {
      case "spend":
        return c.totalSpend ?? 0;
      case "cpl":
        return c.cpl ?? 0;
      case "cpql":
        return c.cpql ?? 0;
      default:
        return c[sortKey] ?? 0;
    }
  };

  const sorted = useMemo(() => {
    const rows = campaigns.filter(
      (c) =>
        (filterPlatform === "all" || c.platform === filterPlatform) &&
        (filterProject === "all" || c.project === filterProject),
    );
    return [...rows].sort((a, b) => sortValue(b) - sortValue(a));
  }, [campaigns, sortKey, filterPlatform, filterProject, sortValue]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="rounded-lg border border-border bg-white px-2.5 py-1.5 font-semibold text-navy"
        >
          <option value="all">All platforms</option>
          {Object.keys(SOURCE_LABELS).map((p) => (
            <option key={p} value={p}>
              {SOURCE_LABELS[p]}
            </option>
          ))}
        </select>
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="rounded-lg border border-border bg-white px-2.5 py-1.5 font-semibold text-navy"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="text-muted">Period: {rangeLabel}</span>
        <span className="text-muted">| Sort by: </span>
        {(["leads", "qualified", "visitsBooked", "bookings", "spend", "cpl"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`rounded-lg px-2.5 py-1.5 font-semibold ${
              sortKey === k ? "bg-primary text-white" : "bg-white border border-border text-muted"
            }`}
          >
            {k === "visitsBooked" ? "visits" : k === "cpl" ? "CPL" : k === "spend" ? "Spend" : k}
          </button>
        ))}
      </div>

      <TableWrap>
        <table className="min-w-[860px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5 font-semibold">Campaign</th>
              <th className="px-3 py-2.5 font-semibold">Source</th>
              <th className="px-3 py-2.5 font-semibold">Project</th>
              <th className="px-3 py-2.5 text-center font-semibold">Leads</th>
              <th className="px-3 py-2.5 text-center font-semibold">Qualified</th>
              <th className="px-3 py-2.5 text-center font-semibold">Visits</th>
              <th className="px-3 py-2.5 text-center font-semibold">Bookings</th>
              {finance && <th className="px-3 py-2.5 text-right font-semibold">Spend</th>}
              {finance && <th className="px-3 py-2.5 text-right font-semibold">CPL</th>}
              {finance && <th className="px-3 py-2.5 text-right font-semibold">CPQL</th>}
              <th className="px-3 py-2.5 text-center font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted">
                  No campaigns found. Create one to start tracking.
                </td>
              </tr>
            )}
            {sorted.map((c) => (
              <tr key={c.id} className="border-b border-border/60 hover:bg-primary/5">
                <td className="px-3 py-2.5">
                  <Link href={`/crm/marketing/campaigns/${c.id}`} className="font-bold text-navy hover:text-primary hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-muted">{SOURCE_LABELS[c.platform] || c.platform}</td>
                <td className="px-3 py-2.5 text-muted">{c.project || "—"}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-navy">{fmt(c.leads)}</td>
                <td className="px-3 py-2.5 text-center text-muted">{fmt(c.qualified)}</td>
                <td className="px-3 py-2.5 text-center text-muted">{fmt(c.visitsBooked)}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-green-700">{fmt(c.bookings)}</td>
                {finance && <td className="px-3 py-2.5 text-right text-muted">{fmtMoney(c.totalSpend)}</td>}
                {finance && <td className="px-3 py-2.5 text-right text-muted">{fmtMoney(c.cpl)}</td>}
                {finance && <td className="px-3 py-2.5 text-right text-muted">{fmtMoney(c.cpql)}</td>}
                <td className="px-3 py-2.5 text-center">
                  <Badge
                    color={
                      c.status === "active"
                        ? "bg-green-100 text-green-700"
                        : c.status === "paused"
                          ? "bg-amber-100 text-amber-700"
                          : c.status === "completed"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                    }
                  >
                    {c.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      {role === "admin" || role === "sales_head" ? (
        <SpendSection
          campaigns={campaigns}
          onChanged={onChanged}
          finance={finance}
        />
      ) : null}
    </div>
  );
}

function SpendSection({
  campaigns,
  onChanged,
  finance,
}: {
  campaigns: Campaign[];
  onChanged: () => void;
  finance: boolean;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-bold text-navy">Manual Spend Entry</h3>
      <p className="mt-0.5 text-xs text-muted">
        Spend data is manually entered. No external Meta/Google integration is connected.
      </p>
      {campaigns.map((c) => (
        <SpendRow key={c.id} campaignId={c.id} campaignName={c.name} finance={finance} onSaved={onChanged} />
      ))}
    </Card>
  );
}

function SpendRow({
  campaignId,
  campaignName,
  finance,
  onSaved,
}: {
  campaignId: number;
  campaignName: string;
  finance: boolean;
  onSaved: () => void;
}) {
  const [date, setDate] = useState("");

  const save = async (formData: FormData) => {
    const spend = Number(formData.get("spend"));
    if (!date || !Number.isFinite(spend) || spend <= 0) return;
    const res = await fetch(`/crm/api/marketing/campaigns/${campaignId}/spend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        spend,
        clicks: formData.get("clicks") ? Number(formData.get("clicks")) : undefined,
        leads: formData.get("leads") ? Number(formData.get("leads")) : undefined,
        impressions: formData.get("impressions") ? Number(formData.get("impressions")) : undefined,
        externalAdSetName: formData.get("adSet") ? String(formData.get("adSet")) : undefined,
        externalAdName: formData.get("adName") ? String(formData.get("adName")) : undefined,
      }),
    });
    if (res.ok) {
      onSaved();
      setDate("");
    }
  };

  return (
    <form
      key={campaignId}
      action={save}
      className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3 text-sm"
    >
      <span className="min-w-[140px] font-semibold text-navy">{campaignName}</span>
      <input type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)} required className="rounded-lg border border-border px-2.5 py-1.5 text-navy" />
      <input type="number" name="spend" placeholder="Spend ₹" min={0} step="any" required className="w-28 rounded-lg border border-border px-2.5 py-1.5 text-navy" />
      {finance && <input type="number" name="impressions" placeholder="Impr." min={0} className="w-20 rounded-lg border border-border px-2.5 py-1.5 text-navy" />}
      <input type="number" name="clicks" placeholder="Clicks" min={0} className="w-20 rounded-lg border border-border px-2.5 py-1.5 text-navy" />
      <input type="number" name="leads" placeholder="Leads" min={0} className="w-20 rounded-lg border border-border px-2.5 py-1.5 text-navy" />
      <input type="text" name="adSet" placeholder="Ad set (optional)" className="rounded-lg border border-border px-2.5 py-1.5 text-navy" />
      <input type="text" name="adName" placeholder="Ad (optional)" className="rounded-lg border border-border px-2.5 py-1.5 text-navy" />
      <Button size="sm" type="submit">Add Spend</Button>
    </form>
  );
}

function OverviewTab({
  overview,
  crossProject,
  integrations,
  finance,
}: {
  overview: Overview | null;
  crossProject: CrossProjectRow[];
  integrations: IntegrationRow[];
  finance: boolean;
}) {
  if (!overview) return <Card className="p-8 text-center text-sm text-muted">No overview data.</Card>;

  const funnel = [
    { label: "LEADS", count: overview.totalLeads },
    { label: "CONTACTED", count: overview.totalLeads, note: "—" },
    { label: "QUALIFIED", count: overview.totalQualified, note: pct(overview.totalQualified, overview.totalLeads) },
    { label: "VISITS", count: overview.totalVisitsBooked, note: pct(overview.totalVisitsBooked, overview.totalQualified) },
    { label: "BOOKINGS", count: overview.totalBookings, note: pct(overview.totalBookings, overview.totalVisitsBooked) },
  ];

  return (
    <div className="space-y-4">
      <KpiRow overview={overview} finance={finance} />

      {/* Funnel */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-navy">Sales Funnel</h3>
        <div className="flex flex-wrap items-center gap-2">
          {funnel.map((f, i) => (
            <div key={f.label} className="flex items-center gap-2">
              <div className="rounded-xl bg-primary/5 px-4 py-2.5 text-center">
                <div className="text-lg font-bold text-primary">{fmt(f.count)}</div>
                <div className="text-[10px] font-semibold text-muted">{f.label}</div>
              </div>
              {f.note && f.note !== "—" && (
                <div className="text-[11px] font-semibold text-muted">{f.note}</div>
              )}
              {i < funnel.length - 1 && <div className="text-sm text-muted">↓</div>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Conversion % shown where the underlying data allows; contacted count requires first-call tracking.
        </p>
      </Card>

      {/* Cross-project */}
      {crossProject.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold text-navy">Cross-Project Conversion</h3>
          <p className="mb-2 text-xs text-muted">
            Customers who enquired about one project but booked another.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {crossProject.map((row, i) => (
              <div key={i} className="rounded-xl bg-background px-3 py-2.5 text-sm">
                <span className="font-semibold text-navy">{row.originalProject}</span>
                <span className="mx-1 text-muted">→</span>
                <span className="font-bold text-primary">{row.bookedProject}</span>
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Integration status */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-navy">Integration Status</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {integrations.map((row) => (
            <div key={row.platform} className="rounded-xl border border-border px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold capitalize text-navy">{row.platform}</span>
                <Badge
                  color={
                    row.connected
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }
                >
                  {row.connected ? "Connected" : "Not Connected"}
                </Badge>
              </div>
              {row.syncError && <p className="mt-1 text-[11px] text-muted">{row.syncError}</p>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function KpiRow({ overview, finance }: { overview: Overview; finance: boolean }) {
  const cells: { label: string; value: string; accent?: boolean }[] = [
    { label: "LEADS", value: fmt(overview.totalLeads) },
    { label: "QUALIFIED", value: fmt(overview.totalQualified) },
    { label: "VISITS", value: fmt(overview.totalVisitsBooked) },
    { label: "BOOKINGS", value: fmt(overview.totalBookings) },
  ];
  if (finance) {
    cells.unshift({ label: "SPEND", value: fmtMoney(overview.totalSpend), accent: true });
    cells.push({ label: "CPL", value: fmtMoney(overview.cpl) });
    cells.push({ label: "CPQL", value: fmtMoney(overview.cpql) });
    cells.push({ label: "COST / VISIT", value: fmtMoney(overview.costPerVisit) });
    cells.push({ label: "COST / BOOKING", value: fmtMoney(overview.costPerBooking) });
    cells.push({ label: "BOOKING VALUE", value: fmtMoney(overview.totalBookingValue) });
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((c) => (
        <Card key={c.label} className={`p-3 ${c.accent ? "bg-primary text-white" : ""}`}>
          <div className={`text-lg font-bold ${c.accent ? "text-white" : "text-navy"}`}>{c.value}</div>
          <div className={`text-[10px] font-semibold ${c.accent ? "text-white/70" : "text-muted"}`}>{c.label}</div>
        </Card>
      ))}
    </div>
  );
}

function SourcesTab({
  sources,
  finance,
}: {
  sources: SourceRow[];
  finance: boolean;
}) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">Lead Source Performance</h3>
      <TableWrap>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5 font-semibold">Source</th>
              <th className="px-3 py-2.5 text-center font-semibold">Leads</th>
              <th className="px-3 py-2.5 text-center font-semibold">Contacted</th>
              <th className="px-3 py-2.5 text-center font-semibold">Qualified</th>
              <th className="px-3 py-2.5 text-center font-semibold">Visits</th>
              <th className="px-3 py-2.5 text-center font-semibold">Bookings</th>
              <th className="px-3 py-2.5 text-center font-semibold">Qual %</th>
              <th className="px-3 py-2.5 text-center font-semibold">L→B %</th>
              {finance && <th className="px-3 py-2.5 text-right font-semibold">Spend</th>}
              {finance && <th className="px-3 py-2.5 text-right font-semibold">CPL</th>}
              {finance && <th className="px-3 py-2.5 text-right font-semibold">CPQL</th>}
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.source} className="border-b border-border/60 hover:bg-primary/5">
                <td className="px-3 py-2.5 font-bold text-navy">{SOURCE_LABELS[s.source] || s.source}</td>
                <td className="px-3 py-2.5 text-center font-semibold">{fmt(s.leads)}</td>
                <td className="px-3 py-2.5 text-center text-muted">{fmt(s.contacted)}</td>
                <td className="px-3 py-2.5 text-center text-muted">{fmt(s.qualified)}</td>
                <td className="px-3 py-2.5 text-center text-muted">{fmt(s.visitsBooked)}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-green-700">{fmt(s.bookings)}</td>
                <td className="px-3 py-2.5 text-center text-muted">{pct(s.qualified, s.leads)}</td>
                <td className="px-3 py-2.5 text-center text-muted">{pct(s.bookings, s.leads)}</td>
                {finance && <td className="px-3 py-2.5 text-right text-muted">{fmtMoney(s.spend)}</td>}
                {finance && <td className="px-3 py-2.5 text-right text-muted">{fmtMoney(s.cpl)}</td>}
                {finance && <td className="px-3 py-2.5 text-right text-muted">{fmtMoney(s.cpql)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {finance && (
        <p className="mt-2 text-[11px] text-muted">
          Spend per source is attributed via campaign platform mapping (Meta, Google, Organic, Website, Referral).
        </p>
      )}
    </Card>
  );
}

function ProjectsTab({
  projects,
  crossProject,
  finance,
}: {
  projects: ProjectRow[];
  crossProject: CrossProjectRow[];
  finance: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-navy">Demand by Project</h3>
        <p className="mb-2 text-xs text-muted">
          Enquiry attribution uses the <span className="font-semibold">original enquiry project</span> preserved on each lead.
        </p>
        <TableWrap>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2.5 font-semibold">Project</th>
                <th className="px-3 py-2.5 text-center font-semibold">Enquiries</th>
                <th className="px-3 py-2.5 text-center font-semibold">Qualified</th>
                <th className="px-3 py-2.5 text-center font-semibold">Visits</th>
                <th className="px-3 py-2.5 text-center font-semibold">Negotiations</th>
                <th className="px-3 py-2.5 text-center font-semibold">Bookings</th>
                {finance && <th className="px-3 py-2.5 text-right font-semibold">Booking Value</th>}
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr>
                  <td colSpan={finance ? 7 : 6} className="px-3 py-8 text-center text-muted">
                    No enquiries in this period.
                  </td>
                </tr>
              )}
              {projects.map((p) => (
                <tr key={p.project} className="border-b border-border/60 hover:bg-primary/5">
                  <td className="px-3 py-2.5 font-bold text-navy">{p.project}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmt(p.leads)}</td>
                  <td className="px-3 py-2.5 text-center text-muted">{fmt(p.qualified)}</td>
                  <td className="px-3 py-2.5 text-center text-muted">{fmt(p.visitsBooked)}</td>
                  <td className="px-3 py-2.5 text-center text-muted">{fmt(p.negotiations)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-green-700">{fmt(p.bookings)}</td>
                  {finance && <td className="px-3 py-2.5 text-right text-muted">{fmtMoney(p.bookingValue)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      {crossProject.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold text-navy">Cross-Project Conversion</h3>
          <p className="mb-2 text-xs text-muted">
            Original Enquiry → Final Booked Project (a booking is reported against the actual booked project while the lead keeps its original enquiry project).
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {crossProject.map((row, i) => (
              <div key={i} className="rounded-xl bg-background px-3 py-2.5 text-sm">
                <span className="font-semibold text-navy">{row.originalProject}</span>
                <span className="mx-1 text-muted">→</span>
                <span className="font-bold text-primary">{row.bookedProject}</span>
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function CreateCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const save = async (formData: FormData) => {
    setError(null);
    const body: Record<string, unknown> = {
      name: String(formData.get("name") || ""),
      platform: String(formData.get("platform") || "other"),
      project: String(formData.get("project") || ""),
      objective: String(formData.get("objective") || ""),
      startDate: String(formData.get("startDate") || ""),
      endDate: String(formData.get("endDate") || ""),
      status: String(formData.get("status") || "draft"),
      notes: String(formData.get("notes") || ""),
      budget: formData.get("budget") ? Number(formData.get("budget")) : undefined,
    };
    const res = await fetch("/crm/api/marketing/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create campaign");
      return;
    }
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-5" >
        <div onClick={(e) => e.stopPropagation()}>
          <h3 className="text-base font-bold text-navy">New Campaign</h3>
          <form action={save} className="mt-4 space-y-3 text-sm">
            <FormField label="Campaign Name *">
              <input name="name" required className="w-full rounded-lg border border-border px-3 py-2 text-navy" />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Platform">
                <select name="platform" className="w-full rounded-lg border border-border px-3 py-2 text-navy">
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Status">
                <select name="status" className="w-full rounded-lg border border-border px-3 py-2 text-navy">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Project">
                <input name="project" placeholder="e.g. Pearl Gardens" className="w-full rounded-lg border border-border px-3 py-2 text-navy" />
              </FormField>
              <FormField label="Objective">
                <input name="objective" placeholder="e.g. Lead generation 2BHK" className="w-full rounded-lg border border-border px-3 py-2 text-navy" />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Start date">
                <input name="startDate" type="date" className="w-full rounded-lg border border-border px-3 py-2 text-navy" />
              </FormField>
              <FormField label="End date">
                <input name="endDate" type="date" className="w-full rounded-lg border border-border px-3 py-2 text-navy" />
              </FormField>
              <FormField label="Budget ₹">
                <input name="budget" type="number" min={0} className="w-full rounded-lg border border-border px-3 py-2 text-navy" />
              </FormField>
            </div>
            <FormField label="Notes">
              <input name="notes" className="w-full rounded-lg border border-border px-3 py-2 text-navy" />
            </FormField>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit">Create Campaign</Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-xl">{children}</div>;
}