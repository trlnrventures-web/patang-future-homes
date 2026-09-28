"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_PRIMARY_ITEMS, canSeeMore, moreItemsFor } from "@/lib/crm/nav-shared";

const GRID_ICON =
  "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z";

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d={d} />
    </svg>
  );
}

export default function MobileNav({ userRole }: { userRole?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const showMore = canSeeMore(userRole);
  const visibleMore = moreItemsFor(userRole);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = showMore && visibleMore.some((m) => isActive(m.href));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-white md:hidden">
        {NAV_PRIMARY_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium ${
              isActive(item.href) ? "text-primary" : "text-muted"
            }`}
          >
            <Icon d={item.icon} />
            {item.shortLabel || item.label}
          </Link>
        ))}
        {showMore && (
          <button
            onClick={() => setOpen((s) => !s)}
            aria-expanded={open}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium ${
              moreActive || open ? "text-primary" : "text-muted"
            }`}
          >
            <Icon d={GRID_ICON} />
            More
          </button>
        )}
      </nav>

      {open && showMore && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-8">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <p className="mb-2 text-sm font-bold uppercase tracking-wide text-soft">
              More
            </p>
            <div className="grid grid-cols-2 gap-2">
              {visibleMore.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                    isActive(item.href)
                      ? "border-primary/30 bg-primary/5 text-primary"
                      : "border-border bg-white text-navy hover:bg-primary/5"
                  }`}
                >
                  <Icon d={item.icon} />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}