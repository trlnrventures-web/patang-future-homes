"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

const INTENTS = ["Buy", "Rent", "Sell"];

const AREAS = [
  { value: "both", label: "Vasai West / Vasai East" },
  { value: "west", label: "Vasai West" },
  { value: "east", label: "Vasai East" },
];

const PROPERTY_TYPES = [
  { value: "all", label: "All Property Types" },
  { value: "flat", label: "Flats / Apartments" },
  { value: "shop", label: "Shops / Commercial" },
  { value: "bungalow", label: "Bungalows / Villas" },
];

const BHK_OPTIONS = [
  { value: "any", label: "All BHKs" },
  { value: "1", label: "1 BHK" },
  { value: "2", label: "2 BHK" },
  { value: "3", label: "3 BHK" },
];

export default function Hero() {
  const router = useRouter();
  const [intent, setIntent] = useState("Buy");
  const [area, setArea] = useState("both");
  const [type, setType] = useState("all");
  const [bhk, setBhk] = useState("any");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (type === "flat" && bhk !== "any" && area !== "both") {
      const locationSlug = area === "west" ? "vasai-west" : "vasai-east";
      router.push(`/${locationSlug}/${bhk}-bhk`);
      return;
    }
    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (area !== "both") params.set("area", area);
    params.set("intent", intent.toLowerCase());
    const qs = params.toString();
    router.push(`/projects${qs ? `?${qs}` : ""}`);
  }

  return (
    <section className="relative overflow-hidden bg-background pt-28 pb-16 lg:pt-36 lg:pb-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[55fr_45fr]">
          {/* Left: text + lead capture */}
          <div className="animate-hero-enter">
            <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              <span className="block font-bold">Buy. Sell. Rent.</span>
              <span className="block font-normal">All in Vasai.</span>
            </h1>

            <p className="mt-5 max-w-md text-base leading-relaxed text-muted sm:text-lg">
              Trusted property partner for Shops, Flats &amp; Bungalows across
              Vasai West and Vasai East.
            </p>

            {/* Intent pill tabs */}
            <div
              className="mt-7 inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white p-1 shadow-sm"
              role="tablist"
              aria-label="Property intent"
            >
              {INTENTS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={intent === tab}
                  onClick={() => setIntent(tab)}
                  className={`relative rounded-full px-5 py-1.5 text-sm font-semibold transition-colors ${
                    intent === tab
                      ? "text-white"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {intent === tab && (
                    <span className="absolute inset-0 rounded-full bg-primary" />
                  )}
                  {intent === tab && (
                    <span className="absolute -bottom-[3px] left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent" />
                  )}
                  <span className="relative">{tab}</span>
                </button>
              ))}
            </div>

            {/* Search bar */}
            <form
              onSubmit={handleSearch}
              className="mt-5 flex flex-col gap-3 rounded-xl border border-ink/10 bg-white p-4 sm:flex-row sm:items-center"
            >
              <div className="relative flex-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soft"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
                    clipRule="evenodd"
                  />
                </svg>
                <select
                  aria-label="Location"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-ink/10 bg-transparent py-2.5 pl-9 pr-8 text-sm text-ink outline-none transition-colors focus:border-primary"
                >
                  {AREAS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-soft"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              <div className="relative flex-1">
                <select
                  aria-label="Property type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-ink/10 bg-transparent py-2.5 px-3 pr-8 text-sm text-ink outline-none transition-colors focus:border-primary"
                >
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-soft"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              <div className="relative flex-1">
                <select
                  aria-label="Configuration"
                  value={bhk}
                  onChange={(e) => setBhk(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-ink/10 bg-transparent py-2.5 px-3 pr-8 text-sm text-ink outline-none transition-colors focus:border-primary"
                >
                  {BHK_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-soft"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-secondary sm:shrink-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9z"
                    clipRule="evenodd"
                  />
                </svg>
                Search
              </button>
            </form>
          </div>

          {/* Right: image with soft gradient edges */}
          <div className="relative aspect-[4/3] animate-hero-enter lg:aspect-[5/4]">
            {/* Gradient masks: blend into background at edges */}
            <div className="absolute inset-0 z-10 rounded-2xl bg-gradient-to-r from-background via-transparent to-background" />
            <div className="absolute inset-0 z-10 rounded-2xl bg-gradient-to-b from-background via-transparent to-background" />
            <div className="absolute inset-0 z-10 rounded-2xl bg-gradient-to-t from-background via-transparent to-transparent" />

            <Image
              src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1000&q=80"
              alt="Modern skyline representing premium properties in Vasai"
              fill
              priority
              className="rounded-2xl object-cover"
              sizes="(max-width: 1024px) 100vw, 45vw"
            />
          </div>
        </div>
      </div>
    </section>
  );
}