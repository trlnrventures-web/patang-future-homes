"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Lightbox from "./Lightbox";

export default function GalleryGrid({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const next = useCallback(() => {
    setActiveIndex((i) =>
      i === null ? null : (i + 1) % images.length
    );
  }, [images.length]);

  const prev = useCallback(() => {
    setActiveIndex((i) =>
      i === null ? null : (i - 1 + images.length) % images.length
    );
  }, [images.length]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((img, i) => (
          <button
            key={img}
            type="button"
            onClick={() => setActiveIndex(i)}
            className={`group relative overflow-hidden rounded-2xl ${
              i === 0
                ? "col-span-2 aspect-[16/9] sm:aspect-auto sm:row-span-2"
                : "aspect-[4/3]"
            }`}
          >
            <Image
              src={img}
              alt={`${title}, photo ${i + 1}`}
              fill
              sizes="(max-width: 768px) 66vw, 40vw"
              className="object-cover transition-transform duration-400 ease-out group-hover:scale-105"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-ink/0 opacity-0 transition-all group-hover:bg-ink/30 group-hover:opacity-100">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-primary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M15 3h6v6" />
                  <path d="M10 14 21 3" />
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
              </span>
            </span>
          </button>
        ))}
      </div>

      {activeIndex !== null && (
        <Lightbox
          src={images[activeIndex]}
          alt={`${title}, photo ${activeIndex + 1}`}
          onClose={() => setActiveIndex(null)}
          onPrev={prev}
          onNext={next}
        />
      )}
    </>
  );
}