"use client";

import { useState } from "react";
import Image from "next/image";

export default function ProjectGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const [active, setActive] = useState(0);

  return (
    <div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-xl">
        <Image
          src={images[active]}
          alt={`${title} photo ${active + 1}`}
          fill
          priority={active === 0}
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 80vw"
        />
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View photo ${i + 1}`}
              aria-pressed={active === i}
              className={`relative aspect-[16/10] w-28 shrink-0 overflow-hidden rounded-lg transition-all ${
                active === i
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-background"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <Image
                src={img}
                alt=""
                fill
                className="object-cover"
                sizes="112px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}