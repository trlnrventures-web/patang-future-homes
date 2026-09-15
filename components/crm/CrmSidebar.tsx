"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS: { href: string; label: string; icon: string; roles?: string[] }[] = [
  { href: "/crm/dashboard", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/crm/leads", label: "Leads", icon: "M17 20h5v-2a3 3 0 0 0-5-2.11M9 20H4v-2a3 3 0 0 1 5-2.11M16 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm5 16v-2a3 3 0 0 0-5-2.11M16 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" },
  { href: "/crm/marketing", label: "Marketing", icon: "M3 3v18M3 5h18M5 3v2M7 8l3 2M7 13l3 4 5-9M17 5l4 13M15 12h4", roles: ["admin", "sales_head", "marketing"] },
  { href: "/crm/reports", label: "Daily Report", icon: "M8 13v5M12 9v9M16 5v13M3 3v18h18M3 5h14M17 5l3 3V3.5" },
  { href: "/crm/messages", label: "Messages", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10ZM8 10h8M8 14h5" },
];

const SETTINGS_ITEMS = [
  { href: "/crm/settings/templates", label: "Message Templates", icon: "M4 6h16M4 12h16M4 18h10" },
];

export default function CrmSidebar({
  userName,
  userRole,
}: {
  userName: string;
  userRole: string;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const Item = ({
    href,
    label,
    icon,
  }: {
    href: string;
    label: string;
    icon: string;
  }) => (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive(href)
          ? "bg-primary/10 text-primary"
          : "text-muted hover:bg-primary/5 hover:text-primary"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[18px] w-[18px] shrink-0"
      >
        <path d={icon} />
      </svg>
      {label}
    </Link>
  );

  return (
    <div className="flex h-full flex-col border-r border-border bg-white">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-bold text-primary">Patang CRM</div>
          <div className="text-[11px] text-muted">Vasai West Sales</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(userRole)).map((item) => (
          <Item key={item.href} {...item} />
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="rounded-lg bg-background px-3 py-2.5">
          <div className="text-sm font-semibold text-navy">{userName}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted">
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
          <div className="mt-2 space-y-1">
            {SETTINGS_ITEMS.filter(() => userRole === "admin" || userRole === "sales_head").map(
              (s) => (
                <Item key={s.href} {...s} />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}