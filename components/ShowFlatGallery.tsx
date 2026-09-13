"use client";

import { useState } from "react";
import Image from "next/image";
import type { ShowFlatImage } from "@/lib/projects";

const WHATSAPP_NUMBER = "919657447246";

export default function ShowFlatGallery({
  images,
  projectTitle,
}: {
  images: ShowFlatImage[];
  projectTitle: string;
}) {
  const actual = images.filter((i) => i.type === "actual");
  const render = images.filter((i) => i.type === "render");
  const [tab, setTab] = useState<"actual" | "render">(
    actual.length ? "actual" : "render"
  );
  const current = tab === "actual" ? actual : render;

  const enquireUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Hi, I'd like to see the 3D renders and show flat photos of ${projectTitle}.`
  )}`;

  return (
    <div>
      <div className="inline-flex rounded-xl border border-ink/10 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("actual")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            tab === "actual"
              ? "bg-primary text-white"
              : "text-muted hover:text-primary"
          }`}
        >
          Actual Photos ({actual.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("render")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            tab === "render"
              ? "bg-primary text-white"
              : "text-muted hover:text-primary"
          }`}
        >
          3D Renders ({render.length})
        </button>
      </div>

      {tab === "actual" && actual.length === 0 ? (
        <div className="mt-5 flex items-center justify-center rounded-2xl border border-dashed border-ink/20 bg-white px-6 py-16 text-center">
          <div>
            <p className="font-bold text-primary">
              Actual photos coming soon
            </p>
            <p className="mt-1.5 text-sm text-muted">
              We&apos;ll share the real on-site photos of the flat as soon as
              they&apos;re ready.
            </p>
          </div>
        </div>
      ) : tab === "render" && render.length === 0 ? (
        <div className="mt-5 flex items-center justify-center rounded-2xl border border-dashed border-ink/20 bg-white px-6 py-16 text-center">
          <div>
            <p className="font-bold text-primary">
              Render walkthrough coming soon
            </p>
            <p className="mt-1.5 text-sm text-muted">
              Ask us on WhatsApp and we&apos;ll share the 3D renders and floor
              plans for this flat.
            </p>
            <a
              href={enquireUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-secondary"
            >
              Get the renders on WhatsApp
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {current.map((img) => (
            <figure
              key={img.src}
              className="group relative aspect-[10/9] overflow-hidden rounded-xl border border-ink/10 bg-white"
            >
              <Image
                src={img.src}
                alt={`${img.title} — ${projectTitle} ${tab === "render" ? "3D render" : "show flat photo"}`}
                fill
                className="object-cover transition-transform duration-400 ease-out group-hover:scale-105"
                sizes="(min-width: 1024px) 33vw, 50vw"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-3 pb-2.5 pt-10 text-xs font-semibold text-white">
                {img.title}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}