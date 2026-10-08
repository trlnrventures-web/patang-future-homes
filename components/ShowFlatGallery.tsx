"use client";

import Image from "next/image";
import type { ShowFlatImage } from "@/lib/projects";

const WHATSAPP_NUMBER = "917249138197";

function GalleryGrid({
  images,
  projectTitle,
  kind,
}: {
  images: ShowFlatImage[];
  projectTitle: string;
  kind: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {images.map((img) => (
        <figure
          key={img.src}
          className="group relative aspect-[10/9] overflow-hidden rounded-xl border border-ink/10 bg-white"
        >
          <Image
            src={img.src}
            alt={`${img.title}, ${projectTitle} ${kind}`}
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
  );
}

export default function ShowFlatGallery({
  images,
  projectTitle,
}: {
  images: ShowFlatImage[];
  projectTitle: string;
}) {
  const actual = images.filter((i) => i.type === "actual");
  const render = images.filter((i) => i.type === "render");

  const enquireUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Hi, I'd like to see the 3D renders and show flat photos of ${projectTitle}.`
  )}`;

  if (actual.length === 0 && render.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-ink/20 bg-white px-6 py-16 text-center">
        <div>
          <p className="font-bold text-primary">Show flat photos coming soon</p>
          <p className="mt-1.5 text-sm text-muted">
            We&apos;ll share the real on-site photos of the flat as soon as
            they&apos;re ready.
          </p>
          <a
            href={enquireUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-secondary"
          >
            Get the photos on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-9">
      {actual.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-ink">
            Actual Show Flat Photos
          </h3>
          <p className="mt-1 text-sm text-muted">
            Real photographs of the sample flat as it stands on site.
          </p>
          <div className="mt-4">
            <GalleryGrid
              images={actual}
              projectTitle={projectTitle}
              kind="show flat photo"
            />
          </div>
        </div>
      )}

      {render.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-ink">Show Flat &amp; 3D Renders</h3>
          <p className="mt-1 text-sm text-muted">
            Artist impressions and walkthrough renders of the show flat layout.
          </p>
          <div className="mt-4">
            <GalleryGrid
              images={render}
              projectTitle={projectTitle}
              kind="3D render"
            />
          </div>
        </div>
      )}
    </div>
  );
}
