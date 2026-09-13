"use client";

import { useRef } from "react";
import Image from "next/image";

const TESTIMONIALS = [
  {
    name: "Ramesh Patil",
    location: "Bought a 2BHK in Vasai West",
    quote:
      "The team walked us through every project personally and never pushed us toward a higher budget. We bought our 2BHK at Patang Heights and the process was completely transparent.",
    photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80",
  },
  {
    name: "Priya Nair",
    location: "Rented a 1BHK in Vasai East",
    quote:
      "Found them through Google and was surprised by how quickly they shortlisted options within my rent budget. The brokerage was fair and everything was documented properly.",
    photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80",
  },
  {
    name: "Amit Sharma",
    location: "Bought a shop in Vasai West",
    quote:
      "As a first-time commercial buyer, I had a lot of doubts about paperwork. They handled the RERA verification and legal checks so well that I didn't have to worry about a thing.",
    photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80",
  },
  {
    name: "Sunita Deshmukh",
    location: "Sold 1BHK flat in Vasai East",
    quote:
      "They got me a genuine buyer within three weeks and negotiated a price above my expectation. The entire sale was completed without any last-minute surprises.",
    photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80",
  },
];

function Stars() {
  return (
    <div className="flex items-center gap-0.5 text-accent-ink" aria-label="5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
            clipRule="evenodd"
          />
        </svg>
      ))}
    </div>
  );
}

export default function Testimonials() {
  const trackRef = useRef<HTMLDivElement>(null);

  function scrollBy(direction: 1 | -1) {
    trackRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  }

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
              Client stories
            </div>
            <h2 className="mt-2 font-bold text-ink text-2xl sm:text-3xl">
              Real Stories from Real Buyers
            </h2>
            <p className="mt-2 text-sm text-muted">
              What our clients across Vasai say about working with us.
            </p>
          </div>

          {/* Scroll arrows */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label="Scroll testimonials left"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/20 text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label="Scroll testimonials right"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/20 text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable row */}
        <div className="mt-10 -mx-5 px-5 lg:-mx-8 lg:px-8">
          <div
            ref={trackRef}
            className="flex gap-5 overflow-x-auto scroll-smooth pb-2"
          >
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className="flex w-[300px] shrink-0 flex-col rounded-2xl border border-ink/10 bg-background p-6 sm:w-[340px]"
              >
                <Stars />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-muted">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-ink/10 pt-4">
                  <Image
                    src={t.photo}
                    alt={`${t.name} photo`}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <div>
                    <div className="text-sm font-bold text-ink">
                      {t.name}
                    </div>
                    <div className="text-xs text-soft">{t.location}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}