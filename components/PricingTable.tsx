"use client";

import { useState } from "react";
import type { Configuration } from "@/lib/projects";
import Lightbox from "./Lightbox";

export default function PricingTable({
  configurations,
  title,
}: {
  configurations: Configuration[];
  title: string;
}) {
  const [activeConfig, setActiveConfig] = useState<Configuration | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="bg-primary text-white">
              <th className="px-5 py-3.5 font-semibold">Configuration</th>
              <th className="px-5 py-3.5 font-semibold">Carpet Area</th>
              <th className="px-5 py-3.5 font-semibold">Price</th>
              <th className="px-5 py-3.5 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {configurations.map((c, i) => (
              <tr
                key={`${c.type}-${i}`}
                className="transition-colors hover:bg-ink/[0.03]"
              >
                <td className="px-5 py-4">
                  <div className="font-semibold text-ink">{c.type}</div>
                </td>
                <td className="px-5 py-4 text-muted">
                  <div>{c.carpetArea}</div>
                  {c.saleableArea && (
                    <div className="mt-0.5 text-xs text-soft">
                      {c.saleableArea}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="font-semibold text-primary">{c.price}</div>
                  {c.allInclusive && (
                    <div className="mt-0.5 text-xs font-medium text-emerald-600">
                      All-inclusive
                    </div>
                  )}
                  {c.parkingIncluded && (
                    <div className="mt-0.5 text-xs font-medium text-soft">
                      Parking included
                    </div>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    {c.floorPlanImage && (
                      <button
                        type="button"
                        onClick={() => setActiveConfig(c)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-bold text-primary transition-colors hover:bg-secondary hover:text-white"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M15 3h6v6" />
                          <path d="M10 14 21 3" />
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        </svg>
                        Show Flat
                      </button>
                    )}
                    {c.floorPlanImage && (
                      <a
                        href={c.floorPlanImage}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-ink/20 px-3.5 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M12 3v12" />
                          <path d="m7 11 5 5 5-5" />
                          <path d="M4 21h16" />
                        </svg>
                        Download
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeConfig && (
        <Lightbox
          src={activeConfig.floorPlanImage}
          alt={`${activeConfig.type} floor plan, ${title}`}
          onClose={() => setActiveConfig(null)}
        />
      )}
    </>
  );
}