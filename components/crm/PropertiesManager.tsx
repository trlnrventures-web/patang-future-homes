"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import { SUB_LOCATIONS } from "@/lib/projects";

type PropSource = "primary" | "market";

type PropRow = {
  slug: string;
  title: string;
  location: string;
  area: string;
  type: string;
  status: string;
  tier: string;
  subLocation: string;
  priceRange: string;
  pricePerSqft: string;
  reraId: string;
  possessionDate: string;
  shortDescription: string;
  isActive: boolean;
  bhkOptions: string[];
  source: PropSource;
};

const BHK_OPTIONS = ["1", "2", "3", "4"];

function areaLabel(area: string): string {
  if (area === "east") return "Vasai East";
  if (area === "west") return "Vasai West";
  return area || "-";
}

export default function PropertiesManager() {
  const router = useRouter();
  const [projects, setProjects] = useState<PropRow[]>([]);
  const [partner, setPartner] = useState<PropRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [category, setCategory] = useState<"all" | PropSource>("all");
  const [bhk, setBhk] = useState("all");
  const [location, setLocation] = useState("all");
  const [subLocation, setSubLocation] = useState("all");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/crm/api/properties", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setProjects(data.projects || []);
            setPartner(data.partner || []);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const allRows = useMemo(() => [...projects, ...partner], [projects, partner]);

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      const label = areaLabel(r.area);
      if (label !== "-") set.add(label);
    }
    return [...set].sort();
  }, [allRows]);

  const subLocationOptions = useMemo(() => {
    const present = new Set(allRows.map((r) => r.subLocation).filter(Boolean));
    return SUB_LOCATIONS.filter((s) => present.has(s));
  }, [allRows]);

  const visible = useMemo(() => {
    return allRows.filter((p) => {
      if (!showArchived && p.source === "primary" && !p.isActive) return false;
      if (category !== "all" && p.source !== category) return false;
      if (bhk !== "all" && !p.bhkOptions.includes(bhk)) return false;
      if (location !== "all" && areaLabel(p.area) !== location) return false;
      if (subLocation !== "all" && p.subLocation !== subLocation) return false;
      return true;
    });
  }, [allRows, showArchived, category, bhk, location, subLocation]);

  const toggleArchived = async (p: PropRow) => {
    const res = await fetch(`/crm/api/properties/${p.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (res.ok) {
      setProjects((all) => all.map((x) => (x.slug === p.slug ? { ...x, isActive: !p.isActive } : x)));
      router.refresh();
    }
  };

  const deleteProperty = async (p: PropRow) => {
    if (!confirm(`Delete "${p.title}" permanently? This cannot be undone.`)) return;
    const res = await fetch(`/crm/api/properties/${p.slug}`, { method: "DELETE" });
    if (res.ok) {
      setProjects((all) => all.filter((x) => x.slug !== p.slug));
      router.refresh();
    }
  };

  const activeCount = projects.filter((p) => p.isActive).length;

  const selectCls =
    "rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-navy outline-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setShowArchived(false)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              !showArchived ? "bg-primary text-white" : "bg-background/50 text-muted"
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              showArchived ? "bg-primary text-white" : "bg-background/50 text-muted"
            }`}
          >
            All website ({projects.length})
          </button>
          <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            Partner network ({partner.length})
          </span>
        </div>
        <Link href="/crm/properties/new">
          <Button size="sm">+ Add Property</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-white p-3">
        <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value as "all" | PropSource)}>
          <option value="all">Category: All</option>
          <option value="primary">Website</option>
          <option value="market">Partner Network</option>
        </select>
        <select className={selectCls} value={bhk} onChange={(e) => setBhk(e.target.value)}>
          <option value="all">Configuration: All</option>
          {BHK_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {b} BHK
            </option>
          ))}
        </select>
        <select className={selectCls} value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="all">Location: All</option>
          {locationOptions.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select className={selectCls} value={subLocation} onChange={(e) => setSubLocation(e.target.value)}>
          <option value="all">Sub-Location: All</option>
          {subLocationOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-soft">{visible.length} shown</span>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Loading properties...</p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No properties found.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="hidden grid-cols-12 gap-2 border-b border-border bg-background/50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-soft md:grid">
            <div className="col-span-5">Property</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Tier</div>
            <div className="col-span-3">Actions</div>
          </div>
          {visible.map((p) => (
            <div
              key={`${p.source}-${p.slug}`}
              className={`grid grid-cols-1 gap-2 border-b border-border/60 px-4 py-3 text-sm md:grid-cols-12 md:items-center ${
                p.source === "primary" && !p.isActive ? "opacity-60" : ""
              } ${p.source === "market" ? "bg-blue-50/40" : ""}`}
            >
              <div className="col-span-5">
                <p className="font-semibold text-navy">
                  {p.title}
                  {p.source === "market" && (
                    <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                      Partner Network
                    </span>
                  )}
                  {p.source === "primary" && !p.isActive && (
                    <span className="ml-2 rounded bg-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
                      Archived
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {areaLabel(p.area)} · {p.type}
                  {p.subLocation ? ` · ${p.subLocation}` : ""}
                  {p.bhkOptions.length ? ` · ${p.bhkOptions.map((b) => `${b} BHK`).join(", ")}` : ""}
                </p>
                <p className="mt-0.5 truncate text-xs text-soft">
                  {p.source === "market" ? `${p.priceRange} · Possession ${p.possessionDate}` : p.shortDescription}
                </p>
              </div>
              <div className="col-span-2 text-xs text-soft md:text-sm">{p.status || "—"}</div>
              <div className="col-span-2 text-xs text-soft md:text-sm">{p.tier || "—"}</div>
              <div className="col-span-3 flex flex-wrap gap-1.5 md:justify-end">
                {p.source === "primary" ? (
                  <>
                    <Link href={`/crm/properties/${p.slug}/edit`}>
                      <Button size="sm" variant="secondary">Edit</Button>
                    </Link>
                    <Button
                      size="sm"
                      variant={p.isActive ? "secondary" : "whatsapp"}
                      onClick={() => toggleArchived(p)}
                    >
                      {p.isActive ? "Archive" : "Restore"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => deleteProperty(p)}>
                      Delete
                    </Button>
                  </>
                ) : (
                  <span className="text-[11px] font-semibold text-blue-600">Via partner network</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
