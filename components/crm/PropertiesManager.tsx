"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

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
};

export default function PropertiesManager() {
  const router = useRouter();
  const [projects, setProjects] = useState<PropRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

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

  const visible = showArchived ? projects : projects.filter((p) => p.isActive);

  const toggleArchived = async (p: PropRow) => {
    const res = await fetch(`/crm/api/properties/${p.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (res.ok) {
      setProjects((all) =>
        all.map((x) => (x.slug === p.slug ? { ...x, isActive: !p.isActive } : x))
      );
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setShowArchived(false)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              !showArchived ? "bg-primary text-white" : "bg-background/50 text-muted"
            }`}
          >
            Active ({projects.filter((p) => p.isActive).length})
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              showArchived ? "bg-primary text-white" : "bg-background/50 text-muted"
            }`}
          >
            All ({projects.length})
          </button>
        </div>
        <Link href="/crm/properties/new">
          <Button size="sm">+ Add Property</Button>
        </Link>
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
              key={p.slug}
              className={`grid grid-cols-1 gap-2 border-b border-border/60 px-4 py-3 text-sm md:grid-cols-12 md:items-center ${
                !p.isActive ? "opacity-60" : ""
              }`}
            >
              <div className="col-span-5">
                <p className="font-semibold text-navy">
                  {p.title}
                  {!p.isActive && (
                    <span className="ml-2 rounded bg-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
                      Archived
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {p.location} · {p.type} · {p.subLocation || "no sub-location"}
                </p>
                <p className="mt-0.5 truncate text-xs text-soft">{p.shortDescription}</p>
              </div>
              <div className="col-span-2 text-xs text-soft md:text-sm">{p.status}</div>
              <div className="col-span-2 text-xs text-soft md:text-sm">{p.tier}</div>
              <div className="col-span-3 flex flex-wrap gap-1.5 md:justify-end">
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