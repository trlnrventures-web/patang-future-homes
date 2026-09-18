"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import { SUB_LOCATIONS } from "@/lib/projects";

type ProjectShape = {
  slug?: string;
  title?: string;
  location?: string;
  area?: string;
  type?: string;
  status?: string;
  tier?: string;
  subLocation?: string;
  priceRange?: string;
  pricePerSqft?: string;
  shortDescription?: string;
  description?: string;
  fullDescription?: string;
  reraId?: string;
  possessionDate?: string;
  totalTowers?: number;
  landParcel?: string;
  priceValidUntil?: string;
  metaTitle?: string;
  metaDescription?: string;
  usps?: { title: string; description: string }[];
  images?: string[];
  nearbyLandmarks?: { name: string; distance: string }[];
  [k: string]: unknown;
};

const LIST_AREAS = ["west", "east"];
const LIST_TYPES = ["flat", "shop", "bungalow"];
const LIST_STATUSES = ["New Launch", "Under Construction"];
const LIST_TIERS = ["affordable", "luxury"];

const inputCls =
  "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-navy outline-none focus:border-primary";

export default function PropertyForm({
  mode,
  initial,
}: {
  mode: "new" | "edit";
  initial?: ProjectShape;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ProjectShape>({
    slug: initial?.slug || "",
    title: initial?.title || "",
    location: initial?.location || "Vasai West",
    area: initial?.area || "west",
    type: initial?.type || "flat",
    status: initial?.status || "Under Construction",
    tier: initial?.tier || "affordable",
    subLocation: initial?.subLocation || "",
    priceRange: initial?.priceRange || "",
    pricePerSqft: initial?.pricePerSqft || "On request",
    shortDescription: initial?.shortDescription || "",
    description: initial?.description || "",
    fullDescription: initial?.fullDescription || "",
    reraId: initial?.reraId || "",
    possessionDate: initial?.possessionDate || "",
    totalTowers: initial?.totalTowers ?? 1,
    landParcel: initial?.landParcel || "",
    priceValidUntil: initial?.priceValidUntil || "",
    metaTitle: initial?.metaTitle || "",
    metaDescription: initial?.metaDescription || "",
    usps: initial?.usps || [],
    images: initial?.images || [],
    nearbyLandmarks: initial?.nearbyLandmarks || [],
  });

  const set = <K extends keyof ProjectShape>(key: K, value: ProjectShape[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setListItem = <K extends "usps" | "images" | "nearbyLandmarks">(
    key: K,
    idx: number,
    patch: Record<string, unknown>
  ) => {
    setForm((f) => {
      const arr = (f[key] || []) as Record<string, unknown>[];
      const next = arr.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      return { ...f, [key]: next } as ProjectShape;
    });
  };

  const addItem = <K extends "usps" | "images" | "nearbyLandmarks">(key: K) => {
    setForm((f) => {
      const arr = (f[key] || []) as Record<string, unknown>[];
      const blank: Record<string, unknown> =
        key === "usps"
          ? { title: "", description: "" }
          : key === "images"
            ? { src: "" }
            : { name: "", distance: "" };
      return { ...f, [key]: [...arr, blank] } as ProjectShape;
    });
  };

  const removeItem = <K extends "usps" | "images" | "nearbyLandmarks">(key: K, idx: number) => {
    setForm((f) => {
      const arr = (f[key] || []) as Record<string, unknown>[];
      return { ...f, [key]: arr.filter((_, i) => i !== idx) } as ProjectShape;
    });
  };

  const addImage = () => {
    setForm((f) => ({
      ...f,
      images: [...(f.images || []), ""] as string[],
    }));
  };

  const setImage = (idx: number, value: string) => {
    setForm((f) => {
      const arr = (f.images || []) as string[];
      const next = arr.map((it, i) => (i === idx ? value : it));
      return { ...f, images: next } as ProjectShape;
    });
  };

  const removeImage = (idx: number) => {
    setForm((f) => {
      const arr = (f.images || []) as string[];
      return { ...f, images: arr.filter((_, i) => i !== idx) } as ProjectShape;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const basePath = `/crm/api/properties${mode === "edit" && initial?.slug ? `/${initial.slug}` : ""}`;
      const res = await fetch(basePath, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      router.push(`/crm/properties`);
      router.refresh();
    } catch {
      setError("Could not save property");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <Section title="Identity">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title *">
            <input
              required
              className={inputCls}
              value={String(form.title || "")}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field label="Slug">
            <input
              className={inputCls}
              value={String(form.slug || "")}
              onChange={(e) => set("slug", e.target.value)}
              placeholder={mode === "new" ? "auto-generated from title" : undefined}
            />
          </Field>
          <Field label="Location">
            <select value={String(form.location || "")} onChange={(e) => set("location", e.target.value)} className={inputCls}>
              <option>Vasai West</option>
              <option>Vasai East</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Area">
            <select value={String(form.area || "west")} onChange={(e) => set("area", e.target.value)} className={inputCls}>
              {LIST_AREAS.map((a) => (
                <option key={a} value={a}>{a === "west" ? "West" : "East"}</option>
              ))}
            </select>
          </Field>
          <Field label="Sub-location">
            <select value={String(form.subLocation || "")} onChange={(e) => set("subLocation", e.target.value)} className={inputCls}>
              <option value="">None</option>
              {SUB_LOCATIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select value={String(form.type || "flat")} onChange={(e) => set("type", e.target.value)} className={inputCls}>
              {LIST_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={String(form.status || "Under Construction")} onChange={(e) => set("status", e.target.value)} className={inputCls}>
              {LIST_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Tier">
            <select value={String(form.tier || "affordable")} onChange={(e) => set("tier", e.target.value)} className={inputCls}>
              {LIST_TIERS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Pricing & Legal">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Price range">
            <input className={inputCls} value={String(form.priceRange || "")} onChange={(e) => set("priceRange", e.target.value)} placeholder="e.g. 2 BHK Starting ₹79.50 Lacs* onwards" />
          </Field>
          <Field label="Price per sq ft">
            <input className={inputCls} value={String(form.pricePerSqft || "")} onChange={(e) => set("pricePerSqft", e.target.value)} />
          </Field>
          <Field label="RERA ID">
            <input className={inputCls} value={String(form.reraId || "")} onChange={(e) => set("reraId", e.target.value)} />
          </Field>
          <Field label="Possession date">
            <input className={inputCls} value={String(form.possessionDate || "")} onChange={(e) => set("possessionDate", e.target.value)} placeholder="e.g. December 2027 (Target)" />
          </Field>
          <Field label="Total towers">
            <input type="number" className={inputCls} value={String(form.totalTowers ?? "")} onChange={(e) => set("totalTowers", Number(e.target.value))} />
          </Field>
          <Field label="Land parcel">
            <input className={inputCls} value={String(form.landParcel || "")} onChange={(e) => set("landParcel", e.target.value)} />
          </Field>
          <Field label="Price valid until (YYYY-MM-DD)">
            <input type="date" className={inputCls} value={String(form.priceValidUntil || "")} onChange={(e) => set("priceValidUntil", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Copy">
        <Field label="Short description">
          <textarea rows={2} className={inputCls} value={String(form.shortDescription || "")} onChange={(e) => set("shortDescription", e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea rows={3} className={inputCls} value={String(form.description || "")} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Full description">
          <textarea rows={4} className={inputCls} value={String(form.fullDescription || "")} onChange={(e) => set("fullDescription", e.target.value)} />
        </Field>
      </Section>

      <Section title="USPs">
        {(form.usps || []).map((u, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row">
            <input className={inputCls} value={String((u as { title?: string }).title || "")} onChange={(e) => setListItem("usps", i, { title: e.target.value })} placeholder="Title" />
            <div className="flex-1">
              <input className={inputCls} value={String((u as { description?: string }).description || "")} onChange={(e) => setListItem("usps", i, { description: e.target.value })} placeholder="Description" />
            </div>
            <button type="button" onClick={() => removeItem("usps", i)} className="shrink-0 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50">
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={() => addItem("usps")} className="rounded-lg border border-dashed border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5">
          + Add USP
        </button>
      </Section>

      <Section title="Images (/projects/{slug}/… or full URLs)">
        {(form.images || []).map((img, i) => (
          <div key={i} className="flex gap-2">
            <input className={inputCls} value={String(img)} onChange={(e) => setImage(i, e.target.value)} />
            <button type="button" onClick={() => removeImage(i)} className="shrink-0 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50">
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={addImage} className="rounded-lg border border-dashed border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5">
          + Add image
        </button>
      </Section>

      <Section title="Nearby Landmarks">
        {(form.nearbyLandmarks || []).map((lm, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row">
            <input className={inputCls} value={String((lm as { name?: string }).name || "")} onChange={(e) => setListItem("nearbyLandmarks", i, { name: e.target.value })} placeholder="Name" />
            <input className={inputCls} value={String((lm as { distance?: string }).distance || "")} onChange={(e) => setListItem("nearbyLandmarks", i, { distance: e.target.value })} placeholder="Distance" />
            <button type="button" onClick={() => removeItem("nearbyLandmarks", i)} className="shrink-0 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50">
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={() => addItem("nearbyLandmarks")} className="rounded-lg border border-dashed border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5">
          + Add landmark
        </button>
      </Section>

      <Section title="SEO">
        <Field label="Meta title">
          <input className={inputCls} value={String(form.metaTitle || "")} onChange={(e) => set("metaTitle", e.target.value)} />
        </Field>
        <Field label="Meta description">
          <textarea rows={2} className={inputCls} value={String(form.metaDescription || "")} onChange={(e) => set("metaDescription", e.target.value)} />
        </Field>
      </Section>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : mode === "new" ? "Create Property" : "Save Changes"}
        </Button>
        <Button variant="ghost" type="button" onClick={() => router.push("/crm/properties")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-primary">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}