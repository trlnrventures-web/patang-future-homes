"use client";

import { useCallback, useRef, useState, type TouchEvent } from "react";
import Image from "next/image";

export default function ImageCarousel({
  images,
  title,
  location,
  status,
}: {
  images: string[];
  title: string;
  location: string;
  status: string;
}) {
  const count = images.length;
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const go = useCallback(
    (dir: number) => setIndex((i) => (i + dir + count) % count),
    [count]
  );

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) go(delta < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  if (count === 0) {
    return (
      <div className="relative flex aspect-[4/3] w-full select-none items-center justify-center overflow-hidden bg-gradient-to-br from-lavender via-primary/25 to-accent-ink/60 sm:aspect-[16/9] lg:aspect-[16/10]">
        <span className="text-4xl font-extrabold uppercase tracking-tight text-white/90">
          PFH
        </span>
      </div>
    );
  }

  const statusClass =
    status === "New Launch"
      ? "bg-accent text-primary"
      : "bg-background/90 text-primary";

  return (
    <div>
      <div
        className="relative aspect-[4/3] w-full select-none overflow-hidden bg-ink sm:aspect-[16/9] lg:aspect-[16/10] lg:max-h-[480px]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Image
          key={index}
          src={images[index]}
          alt={`${title} in ${location} — photo ${index + 1}`}
          fill
          priority={index === 0}
          className="animate-fade-in object-cover"
          sizes="(min-width: 1024px) 55vw, 100vw"
        />

        <span
          className={`absolute left-4 top-4 z-20 inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide shadow-lg ${statusClass}`}
        >
          {status}
        </span>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => go(-1)}
              className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-lg transition-colors hover:bg-white"
            >
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
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => go(1)}
              className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-lg transition-colors hover:bg-white"
            >
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
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>

            <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
              {images.map((img, i) => (
                <button
                  key={img}
                  type="button"
                  aria-label={`Go to photo ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === index
                      ? "w-6 bg-accent"
                      : "w-2 bg-white/70 hover:bg-white"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {count > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          {images.map((img, i) => (
            <button
              key={img}
              type="button"
              aria-label={`View photo ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                i === index
                  ? "border-accent"
                  : "border-transparent hover:border-primary/40"
              }`}
            >
              <Image
                src={img}
                alt={`${title} in ${location} — thumbnail ${i + 1}`}
                fill
                className="object-cover"
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}