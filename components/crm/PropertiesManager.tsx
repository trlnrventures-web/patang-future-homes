"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import { amenityLabel } from "@/lib/amenities";

type ConfigRow = {
  type: string;
  carpetArea: string;
  saleableArea: string;
  price: string;
  allInclusive: boolean;
  parkingIncluded: boolean;
  floorPlanImage: string;
};

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
  category?: string;
  bhkOptions: string[];
  configurations: ConfigRow[];
  amenities: string[];
};

const BHK_OPTIONS = ["1", "2", "3", "4", "5"];

function areaLabel(area: string): string {
  if (area === "east") return "Vasai East";
  if (area === "west") return "Vasai West";
  return area || "-";
}

export default function PropertiesManager() {
  const router = useRouter();
  const [projects, setProjects] = useState<PropRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [category, setCategory] = useState<"all" | "primary" | "resale">("all");
  const [status, setStatus] = useState<"all" | "draft" | "published">("all");
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
          if (active) setProjects(data.projects || []);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of projects) {
      const label = areaLabel(r.area);
      if (label !== "-") set.add(label);
    }
    return [...set].sort();
  }, [projects]);

  const subLocationOptions = useMemo(() => {
    const present = new Set(projects.map((r) => r.subLocation).filter(Boolean));
    return [...present].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const visible = useMemo(() => {
    return projects.filter((p) => {
      if (!showArchived && !p.isActive) return false;
      if (category !== "all" && (p.category || "primary") !== category) return false;
      if (status !== "all") {
        const isDraft = p.status === "draft";
        if (status === "draft" && !isDraft) return false;
        if (status === "published" && isDraft) return false;
      }
      if (bhk !== "all" && !p.bhkOptions.includes(bhk)) return false;
      if (location !== "all" && areaLabel(p.area) !== location) return false;
      if (subLocation !== "all" && p.subLocation !== subLocation) return false;
      return true;
    });
  }, [projects, showArchived, category, status, bhk, location, subLocation]);

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
        </div>
        <Link href="/crm/properties/new">
          <Button size="sm">+ Add Property</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-white p-3">
        <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value as "all" | "primary" | "resale")}>
          <option value="all">Category: All</option>
          <option value="primary">New Project</option>
          <option value="resale">Resale</option>
        </select>
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as "all" | "draft" | "published")}>
          <option value="all">Status: All</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <div
              key={p.slug}
              className={`flex flex-col rounded-2xl border border-border bg-white p-4 shadow-sm ${
                !p.isActive ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{p.title}</p>
                  <p className="text-xs text-muted">
                    {areaLabel(p.area)}
                    {p.subLocation ? ` · ${p.subLocation}` : ""} · {p.type}
                    {p.category === "resale" ? " · Resale" : ""}
                  </p>
                </div>
                {p.status === "draft" ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                    Draft
                  </span>
                ) : !p.isActive ? (
                  <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
                    Archived
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                    Live
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.configurations.length > 0 ? (
                  p.configurations.map((c, i) => (
                    <span
                      key={i}
                      className="rounded-lg border border-border/70 bg-background/60 px-2 py-1 text-[11px] font-medium text-navy"
                    >
                      {c.type || "Configuration"}
                      {c.carpetArea ? ` · ${c.carpetArea}` : ""}
                      {c.price ? ` · ${c.price}` : ""}
                      {c.allInclusive ? " · All-inclusive" : ""}
                      {c.parkingIncluded ? " · Parking" : ""}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-soft">No configurations listed</span>
                )}
              </div>
              {p.amenities.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.amenities.map((a) => (
                    <span key={a} className="rounded-full bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {amenityLabel(a)}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-background/50 px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">Status</p>
                  <p className="text-navy">{p.status || "—"}</p>
                </div>
                <div className="rounded-lg bg-background/50 px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">Tier</p>
                  <p className="text-navy">{p.tier || "—"}</p>
                </div>
              </div>

              {p.shortDescription ? (
                <p className="mt-2 line-clamp-2 text-xs text-soft">{p.shortDescription}</p>
              ) : p.possessionDate ? (
                <p className="mt-2 text-[11px] text-soft">Possession {p.possessionDate}</p>
              ) : null}

              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}