"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_PRIMARY_ITEMS, canSeeMore, moreItemsFor, NavItem } from "@/lib/crm/nav-shared";
import LogoutButton from "./LogoutButton";

const CHEVRON_ICON = "M9 6l6 6-6 6";

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

export default function CrmSidebar({
  userName,
  userRole,
}: {
  userName: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Owner/admin are the only roles that own a "More" section at all.
  const showMore = canSeeMore(userRole);
  const moreItems = moreItemsFor(userRole);
  const moreActive = showMore && moreItems.some((m) => isActive(m.href));

  const Item = ({ href, label, icon }: NavItem) => (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive(href)
          ? "bg-primary/10 text-primary"
          : "text-muted hover:bg-primary/5 hover:text-primary"
      }`}
    >
      <Icon d={icon} />
      {label}
    </Link>
  );

  return (
    <div className="flex h-full flex-col border-r border-border bg-white">
      <div className="px-4 py-4">
        <div className="inline-block rounded-xl bg-navy p-2.5">
          <img
            src="/brand/PFH_512_white_nobg_horizontal.png"
            alt="Patang CRM"
            className="h-8 w-auto"
          />
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_PRIMARY_ITEMS.map((item) => (
          <Item key={item.href} {...item} />
        ))}

        {showMore && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                moreActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted hover:bg-primary/5 hover:text-primary"
              }`}
            >
              <Icon d={CHEVRON_ICON} />
              More
            </button>
            {moreOpen && (
              <div className="mt-1 space-y-1 border-l border-border pl-2">
                {moreItems.map((item) => (
                  <Item key={item.href} {...item} />
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="rounded-lg bg-background px-3 py-2.5">
          <div className="text-sm font-semibold text-navy">{userName}</div>
          <div className="text-sm text-muted">
            {userRole === "admin"
              ? "Owner / Admin"
              : userRole === "sales_head"
                ? "Sales Head"
                : userRole === "sales_manager"
                  ? "Sales Manager"
                  : userRole === "marketing"
                    ? "Marketing"
                    : "Caller"}
          </div>
          <div className="mt-2">
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  );
}
