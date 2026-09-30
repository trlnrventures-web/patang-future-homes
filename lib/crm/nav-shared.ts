/**
 * Navigation shared by the desktop sidebar and the mobile tab bar so the two
 * can never drift apart.
 *
 * The rule: the destinations every salesperson needs stay visible to everyone,
 * plus My Pay for the two roles that are actually paid. Everything else is
 * reporting or configuration, so it sits behind More, which owner/admin only
 * get. A caller signing in sees the four core tabs plus My Pay.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Tighter label for the mobile tab bar, where space is scarce. */
  shortLabel?: string;
  roles?: string[];
};

export const NAV_PRIMARY_ITEMS: NavItem[] = [
  { href: "/crm/dashboard", label: "Dashboard", shortLabel: "Home", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/crm/leads", label: "Leads", shortLabel: "Leads", icon: "M17 20h5v-2a3 3 0 0 0-5-2.11M9 20H4v-2a3 3 0 0 1 5-2.11M16 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm5 16v-2a3 3 0 0 0-5-2.11M16 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" },
  { href: "/crm/site-visits", label: "Site Visits", shortLabel: "Visits", icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" },
  { href: "/crm/attendance", label: "Attendance", shortLabel: "Attendance", icon: "M12 7v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  // Own payslip, incentive and attendance history. Sales staff are the only
  // roles with a pay record, so this is hidden from admin/marketing, who use
  // the oversight pages under More instead.
  { href: "/crm/my-pay", label: "My Pay", shortLabel: "My Pay", icon: "M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2m2 4h10a4 4 0 0 0 4-4V9a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v6a4 4 0 0 0 4 4Zm5-4h2", roles: ["sales_manager", "caller"] },
  // The same incentives page admin uses, but the API pins staff to their own
  // rows. Without this the page sat under More, which owner/admin alone can
  // open, so a caller or SM had no route to their own incentives at all.
  { href: "/crm/incentives", label: "My Incentives", shortLabel: "Incentives", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", roles: ["sales_manager", "caller"] },
];

export const NAV_MORE_ITEMS: NavItem[] = [
  { href: "/crm/properties", label: "Properties", icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h6M9 13h6M9 17h6" },
  { href: "/crm/marketing", label: "Marketing", icon: "M3 3v18M3 5h18M5 3v2M7 8l3 2M7 13l3 4 5-9M17 5l4 13M15 12h4" },
  { href: "/crm/reports", label: "Daily Report", icon: "M8 13v5M12 9v9M16 5v13M3 3v18h18M3 5h14M17 5l3 3V3.5" },
  { href: "/crm/leaderboard", label: "Leaderboard", icon: "M8 21h8M12 17v4M17 3h4v4M7 7h10v4M17 11a5 5 0 0 1-10 0 5 5 0 0 1 10 0Z" },
  { href: "/crm/incentives", label: "Incentives", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { href: "/crm/salary", label: "Salary Reports", icon: "M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2m2 4h10a4 4 0 0 0 4-4V9a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v6a4 4 0 0 0 4 4Z" },
  { href: "/crm/attendance/report", label: "Attendance Report", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" },
  { href: "/crm/attendance/audit", label: "Attendance Audit", icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h4" },
  { href: "/crm/settings/templates", label: "Message Templates", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/crm/settings/office-hours", label: "Office Hours", icon: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { href: "/crm/settings/incentives", label: "Incentive Rates", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { href: "/crm/settings/team", label: "Team Members", icon: "M17 20h5v-2a3 3 0 0 0-5-2.11M9 20H4v-2a3 3 0 0 1 5-2.11M16 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm5 16v-2a3 3 0 0 0-5-2.11M16 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" },
];

/**
 * Primary items for a role. An item without `roles` is visible to everyone;
 * one with `roles` is filtered to the listed roles.
 */
export function primaryItemsFor(userRole?: string): NavItem[] {
  return NAV_PRIMARY_ITEMS.filter(
    (item) => !item.roles || (userRole ? item.roles.includes(userRole) : false)
  );
}

/** Owner/admin are the only roles that get a More section at all. */
export function canSeeMore(userRole?: string): boolean {
  return userRole === "admin" || userRole === "sales_head";
}

export function moreItemsFor(userRole?: string): NavItem[] {
  if (!canSeeMore(userRole)) return [];
  return NAV_MORE_ITEMS.filter((item) => !item.roles || (userRole ? item.roles.includes(userRole) : false));
}
