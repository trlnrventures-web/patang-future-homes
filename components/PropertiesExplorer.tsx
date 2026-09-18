"use client";

import { useMemo, useState } from "react";
import PropertyCard from "@/components/PropertyCard";
import { projects, SUB_LOCATIONS, subLocationMatches } from "@/lib/projects";
import type { Project } from "@/lib/projects";

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "flat", label: "Flats" },
  { value: "bungalow", label: "Bungalows" },
  { value: "shop", label: "Shops" },
];

const CONFIG_OPTIONS = [
  { value: "all", label: "Any Config" },
  { value: "1", label: "1 BHK" },
  { value: "2", label: "2 BHK" },
  { value: "3", label: "3 BHK" },
];

const LISTING_OPTIONS = [
  { value: "buy", label: "Buy" },
  { value: "rent", label: "Rent" },
];

const LOCATION_OPTIONS = [
  { value: "all", label: "All Locations" },
  { value: "west", label: "Vasai West" },
  { value: "east", label: "Vasai East" },
];

const SUBLOCATION_OPTIONS = [
  { value: "all", label: "All Sub-locations" },
  ...SUB_LOCATIONS.map((s) => ({ value: s, label: s })),
];

const TIER_OPTIONS = [
  { value: "all", label: "All Tiers" },
  { value: "affordable", label: "Affordable" },
  { value: "luxury", label: "Luxury" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

const PRICE_MAX = 200;
const PAGE_SIZE = 9;

function minPriceLakhs(range: string): number | null {
  const match = range.match(
    /₹\s*([\d,]+(?:\.\d+)?)\s*(Lacs?|Lakh|L|Crores?|Cr)?/i
  );
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(num)) return null;
  const unit = (match[2] ?? "").toLowerCase();
  if (unit.startsWith("cr")) return num * 100;
  return num;
}

function hasConfig(project: Project, beds: number): boolean {
  return project.configurations.some((c) =>
    new RegExp(`^${beds}\\s*BHK`, "i").test(c.type)
  );
}

const selectClass =
  "w-full appearance-none rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-navy outline-none transition-colors focus:border-primary";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function PropertiesExplorer() {
  const [type, setType] = useState("all");
  const [config, setConfig] = useState("all");
  const [listing, setListing] = useState("buy");
  const [location, setLocation] = useState("all");
  const [sublocation, setSublocation] = useState("all");
  const [tier, setTier] = useState("all");
  const [maxPrice, setMaxPrice] = useState(PRICE_MAX);
  const [sort, setSort] = useState("newest");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  function updateFilters(apply: () => void) {
    apply();
    setVisible(PAGE_SIZE);
  }

  const filtered = useMemo(() => {
    let list = projects.filter((p) => {
      if (type !== "all" && p.type !== type) return false;
      if (config !== "all" && !hasConfig(p, parseInt(config, 10))) return false;
      if (location !== "all" && p.area !== location) return false;
      if (sublocation !== "all" && !subLocationMatches(p.subLocation, sublocation)) return false;
      if (tier !== "all" && p.tier !== tier) return false;
      if (listing === "rent") return false;
      const min = minPriceLakhs(p.priceRange);
      if (min !== null && min > maxPrice) return false;
      return true;
    });

    if (sort === "price-asc") {
      list = [...list].sort(
        (a, b) =>
          (minPriceLakhs(a.priceRange) ?? PRICE_MAX + 1) -
          (minPriceLakhs(b.priceRange) ?? PRICE_MAX + 1)
      );
    } else if (sort === "price-desc") {
      list = [...list].sort(
        (a, b) =>
          (minPriceLakhs(b.priceRange) ?? -1) -
          (minPriceLakhs(a.priceRange) ?? -1)
      );
    } else if (sort === "newest") {
      list = [...list].sort(
        (a, b) =>
          (a.status === "New Launch" ? 0 : 1) -
          (b.status === "New Launch" ? 0 : 1)
      );
    }

    return list;
  }, [type, config, listing, location, sublocation, tier, maxPrice, sort]);

  const shown = filtered.slice(0, visible);
  const allShown = visible >= filtered.length;

  const typeLabel =
    TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "All Types";
  const locationLabel =
    LOCATION_OPTIONS.find((o) => o.value === location)?.label ??
    "All Locations";
  const sublocationLabel =
    SUBLOCATION_OPTIONS.find((o) => o.value === sublocation)?.label ??
    "All Sub-locations";
  const tierLabel =
    TIER_OPTIONS.find((o) => o.value === tier)?.label ?? "All Tiers";
  const maxLabel =
    maxPrice >= 100
      ? `₹${maxPrice / 100} Cr`
      : `₹${maxPrice} Lakh`;

  function resetAll() {
    updateFilters(() => {
      setType("all");
      setConfig("all");
      setListing("buy");
      setLocation("all");
      setSublocation("all");
      setTier("all");
      setMaxPrice(PRICE_MAX);
      setSort("newest");
    });
  }

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (type !== "all")
    chips.push({
      key: "type",
      label: typeLabel,
      clear: () => updateFilters(() => setType("all")),
    });
  if (config !== "all")
    chips.push({
      key: "config",
      label: `${config} BHK`,
      clear: () => updateFilters(() => setConfig("all")),
    });
  if (listing !== "buy")
    chips.push({
      key: "listing",
      label: "Rent",
      clear: () => updateFilters(() => setListing("buy")),
    });
  if (location !== "all")
    chips.push({
      key: "location",
      label: locationLabel,
      clear: () => updateFilters(() => setLocation("all")),
    });
  if (sublocation !== "all")
    chips.push({
      key: "sublocation",
      label: sublocationLabel,
      clear: () => updateFilters(() => setSublocation("all")),
    });
  if (tier !== "all")
    chips.push({
      key: "tier",
      label: tierLabel,
      clear: () => updateFilters(() => setTier("all")),
    });
  if (maxPrice < PRICE_MAX)
    chips.push({
      key: "price",
      label: `Up to ${maxLabel}`,
      clear: () => updateFilters(() => setMaxPrice(PRICE_MAX)),
    });

  const controls = (
    <>
      <Field label="Property Type">
        <select
          value={type}
          onChange={(e) => updateFilters(() => setType(e.target.value))}
          className={selectClass}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Configuration">
        <select
          value={config}
          onChange={(e) => updateFilters(() => setConfig(e.target.value))}
          className={selectClass}
        >
          {CONFIG_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Listing Type">
        <select
          value={listing}
          onChange={(e) => updateFilters(() => setListing(e.target.value))}
          className={selectClass}
        >
          {LISTING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Location">
        <select
          value={location}
          onChange={(e) => updateFilters(() => setLocation(e.target.value))}
          className={selectClass}
        >
          {LOCATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Sub-location">
        <select
          value={sublocation}
          onChange={(e) => updateFilters(() => setSublocation(e.target.value))}
          className={selectClass}
        >
          {SUBLOCATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Tier">
        <select
          value={tier}
          onChange={(e) => updateFilters(() => setTier(e.target.value))}
          className={selectClass}
        >
          {TIER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Max Budget">
        <input
          type="range"
          min={20}
          max={PRICE_MAX}
          step={5}
          value={maxPrice}
          onChange={(e) =>
            updateFilters(() => setMaxPrice(parseInt(e.target.value, 10)))
          }
          className="w-full accent-primary"
          aria-label="Maximum budget in Lakhs"
        />
        <span className="text-xs font-medium text-muted">
          Up to {maxLabel}
        </span>
      </Field>
    </>
  );

  return (
    <div className="mx-auto max-w-7xl px-5 pb-16 pt-10 lg:px-8 lg:pb-24">
      {/* Filter bar */}
      <section
        aria-label="Property filters"
        className="rounded-2xl border border-border bg-white p-5 shadow-sm"
      >
        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-navy transition-colors hover:border-primary hover:text-primary lg:hidden"
          aria-expanded={filtersOpen}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M3 5h18v2H3V5zm3 6h12v2H6v-2zm3 6h6v2H9v-2z" />
          </svg>
          Filters
          <span className="ml-1 text-[10px] font-bold text-secondary">
            {chips.length}
          </span>
        </button>

        {/* Controls */}
        <div className="mt-4 hidden gap-4 lg:grid lg:grid-cols-3">
          {controls}
        </div>
        {filtersOpen && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:hidden">
            {controls}
          </div>
        )}

        {/* Active filter chips */}
        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="inline-flex items-center gap-1.5 rounded-full border border-secondary/25 bg-lavender px-3 py-1 text-xs font-medium text-secondary transition-colors hover:bg-secondary hover:text-white"
              >
                {chip.label}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3 w-3"
                >
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            ))}
            <button
              type="button"
              onClick={resetAll}
              className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </section>

      {/* Sort + count */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Showing {shown.length} of {filtered.length} properties
        </p>
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          Sort:
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-navy outline-none transition-colors focus:border-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Results grid */}
      {shown.length > 0 ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((project) => (
            <PropertyCard key={project.slug} project={project} />
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-white px-6 py-16 text-center">
          <p className="text-xl font-bold tracking-tight text-navy">
            No properties match your filters
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Try adjusting or clearing your filters, more listings from Vasai
            West &amp; East are added regularly.
          </p>
          <button
            type="button"
            onClick={resetAll}
            className="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-secondary"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Load more */}
      {shown.length > 0 && !allShown && (
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="rounded-full border border-primary px-8 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}