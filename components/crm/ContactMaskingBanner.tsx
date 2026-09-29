"use client";

import { useEffect, useState } from "react";

type Masking = {
  active: boolean;
  withinOfficeHours: boolean;
  banner: string | null;
};

/**
 * "Contact details hidden outside office hours" banner.
 *
 * The decision is made by the API, not here: each lead response carries
 * `contactMasking`, and the server has already replaced the real numbers. This
 * component only explains why a number looks masked, so nobody reports it as a
 * bug. When no response has arrived yet, the shared /api/office-hours state is
 * used so the banner is correct even on a page that renders no leads.
 */
export default function ContactMaskingBanner({
  masking,
  className = "",
}: {
  masking?: Masking | null;
  className?: string;
}) {
  // Only fetched when the page has no masking payload of its own; the prop is
  // preferred outright rather than copied into state, so a new response cannot
  // lag behind the data it describes.
  const [fetched, setFetched] = useState<Masking | null>(null);
  const state = masking ?? fetched;

  useEffect(() => {
    let active = true;
    fetch("/crm/api/office-hours", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d) return;
        setFetched({
          active: !!d.maskActive,
          withinOfficeHours: !!d.withinOfficeHours,
          banner: d.banner ?? null,
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!state?.active) return null;

  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="mt-0.5 h-3.5 w-3.5 shrink-0"
      >
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <div>
        <span className="font-bold">
          {state.banner || "Contact details hidden outside office hours."}
        </span>{" "}
        <span className="mt-0.5 block text-amber-800">
          Call and WhatsApp are unavailable until office hours resume.
        </span>
      </div>
    </div>
  );
}
