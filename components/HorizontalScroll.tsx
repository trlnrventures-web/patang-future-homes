"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";

interface HorizontalScrollProps {
  children: ReactNode;
  className?: string;
  gap?: string;
  showArrows?: boolean;
  fadeColor?: string;
}

export default function HorizontalScroll({
  children,
  className = "",
  gap = "gap-5",
  showArrows = true,
  fadeColor = "var(--color-background)",
}: HorizontalScrollProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    function update() {
      const eps = 2;
      setCanScrollLeft(el!.scrollLeft > eps);
      setCanScrollRight(
        el!.scrollLeft + el!.clientWidth < el!.scrollWidth - eps
      );
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("resize", update, { passive: true });
    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("resize", update);
    };
  }, [children]);

  function scrollBy(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(":scope > *");
    const step = card ? card.offsetWidth + 20 : 320;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={trackRef}
        className={`flex ${gap} overflow-x-auto scroll-smooth pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        style={{ scrollSnapType: "x mandatory" }}
      >
        {children}
      </div>

      {/* Fade gradient on right edge */}
      {canScrollRight && (
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 lg:w-16"
          style={{
            background: `linear-gradient(to right, transparent, ${fadeColor})`,
          }}
        />
      )}

      {/* Scroll arrows: desktop only */}
      {showArrows && canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Scroll left"
          className="absolute left-0 top-1/2 z-10 hidden -translate-x-2 -translate-y-1/2 lg:flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-ink/5 transition-all hover:shadow-xl"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 text-primary"
          >
            <path
              fillRule="evenodd"
              d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}

      {showArrows && canScrollRight && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Scroll right"
          className="absolute right-0 top-1/2 z-10 hidden translate-x-2 -translate-y-1/2 lg:flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-ink/5 transition-all hover:shadow-xl"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 text-primary"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
