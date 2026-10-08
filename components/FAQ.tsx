"use client";

import { useState } from "react";
import { HOME_FAQS as FAQS } from "@/data/home-faqs";

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="bg-background py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-5 lg:px-8">
        <div className="text-center text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
          Have questions?
        </div>
        <h2 className="mt-2 text-center font-bold text-ink text-2xl sm:text-3xl">
          Frequently Asked Questions
        </h2>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted">
          Common questions buyers and renters ask us about Vasai property.
        </p>

        <div className="mt-10 flex flex-col gap-3">
          {FAQS.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={item.q}
                className="overflow-hidden rounded-2xl border border-ink/10 bg-white"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors ${
                    isOpen ? "text-primary" : "text-ink hover:bg-ink/[0.02]"
                  }`}
                >
                  <span className="text-sm font-bold sm:text-base">
                    {item.q}
                  </span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                      isOpen
                        ? "rotate-45 border-primary bg-primary/5 text-primary"
                        : "border-ink/20 text-muted"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                    >
                      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" />
                    </svg>
                  </span>
                </button>

                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    isOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}