"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "What is the price of new projects in Vasai West?",
    a: "New projects in Vasai West typically start from around ₹38-42 lakh for a 1 BHK flat, with 2 BHK units ranging between ₹55-80 lakh depending on the builder, location, and floor. Commercial shops are priced from roughly ₹28-35 lakh onwards. Prices in prime pockets near Evershine Global City and the railway station edge higher, so early-stage launches usually offer the best value.",
  },
  {
    q: "Are there new residential projects launching in Vasai East?",
    a: "Yes, Vasai East is seeing a steady wave of new residential launches, particularly around Manickpur Naka and Rajendra Nagar, where land availability is better than most of Vasai West. Several RERA-registered projects are now offering 1 and 2 BHK apartments in the ₹35-70 lakh bracket. These areas are expected to benefit further once the planned Eastern Express corridor and metro extensions are completed.",
  },
  {
    q: "Is Vasai West a good area to invest in property?",
    a: "Vasai West is widely considered one of the more promising investment corridors in the Mumbai metropolitan region because of its relatively affordable entry prices and strong rental demand from those working along the Western line. The area benefits from the railway station, schools, hospitals, and a large residential catchment, which supports both resale and rental returns. As with any investment, the specific project and its proximity to transport matter more than the general area outlook.",
  },
  {
    q: "What is the price range for a 1 BHK flat in Vasai West?",
    a: "A 1 BHK flat in Vasai West generally falls in the ₹35-50 lakh range for a ready-to-move or nearly complete unit, depending on carpet area and specification. New launches with promotional pricing can begin around ₹32-38 lakh, while high-floor or sea-facing units in premium projects may cross ₹55 lakh.",
  },
  {
    q: "What is the price range for a 2 BHK flat in Vasai East?",
    a: "2 BHK flats in Vasai East typically range between ₹45-80 lakh, with budget-friendly new launches starting near ₹42-48 lakh. Larger 3-bedroom variants and units in gated communities can go higher. The price spread is wide because of differences in carpet area, floor rise, and how close the project sits to the station or the upcoming expressway corridor.",
  },
  {
    q: "Are there properties near Vasai station?",
    a: "Yes, there is a range of properties within walking distance of Vasai Road station, including both resale flats and a few new developments. Units closer to the station command a premium and rent out faster, though they tend to face more crowd and parking constraints. Most buyers find good value in projects that are a 10-15 minute drive from the station, balancing price with convenience.",
  },
  {
    q: "Do you help with property rentals as well as sales?",
    a: "Yes, we assist with rentals across Vasai West and Vasai East — from 1 BHK apartments for small families to independent homes and commercial spaces. We handle tenant vetting, agreement drafting, and negotiation on the landlord's side, while tenants get verified listings and assistance with paperwork at a fair brokerage.",
  },
  {
    q: "Which builders/developers are active in Vasai right now?",
    a: "Vasai currently sees activity from both established regional developers and newer local builders, with several RERA-registered launches underway across Vasai West and Vasai East. Patang Future Homes is your contact point for these projects — we represent multiple verified developers and can arrange site visits, share legal documents, and compare options side by side. Do ask us for the RERA registration number of any project before booking.",
  },
];

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