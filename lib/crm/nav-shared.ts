/**
 * Navigation shared by the desktop sidebar and the mobile tab bar so the two
 * can never drift apart.
 *
 * The rule: the destinations every salesperson needs stay visible to everyone,
 * plus My Pay / Incentives for the two roles that are actually paid and the
 * Daily Report for the roles that submit one. Everything else is reporting or
 * configuration, so it sits behind More.
 *
 * More is role-aware: a More item with no `roles` is administrator-only (the
 * default), while an item that names roles opens to those roles too. So opening
 * More up to staff never leaks the configuration pages - only the items that
 * explicitly list them.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Path to a filled SVG used as a monochrome masked icon, when provided. */
  iconSrc?: string;
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
  // The Daily Report is where staff COPY / SHARE their report (WhatsApp). It
  // used to be reachable only from a dashboard card, so a caller who was not on
  // the dashboard had no route to it at all. Owner/admin still reach it from
  // More; the roles below get the tab directly.
  { href: "/crm/reports", label: "Daily Report", shortLabel: "Report", icon: "M8 13v5M12 9v9M16 5v13M3 3v18h18M3 5h14M17 5l3 3V3.5", roles: ["caller", "sales_manager", "marketing"] },
];

export const NAV_MORE_ITEMS: NavItem[] = [
  { href: "/crm/properties", label: "Properties", icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h6M9 13h6M9 17h6", iconSrc: "/Icon/Properties.svg" },
  { href: "/crm/marketing", label: "Marketing", roles: ["admin", "sales_head", "marketing"], icon: "M3 3v18M3 5h18M5 3v2M7 8l3 2M7 13l3 4 5-9M17 5l4 13M15 12h4", iconSrc: "/Icon/Marketing.svg" },
  { href: "/crm/reports", label: "Daily Report", icon: "M8 13v5M12 9v9M16 5v13M3 3v18h18M3 5h14M17 5l3 3V3.5", iconSrc: "/Icon/Daily reports.svg" },
  // Marketing gets this so its More section is worth opening; caller/SM reach
  // the leaderboard from their dashboard card, and giving them a More entry too
  // would push the mobile bar to eight buttons.
  { href: "/crm/leaderboard", label: "Leaderboard", roles: ["admin", "sales_head", "marketing"], icon: "M8 21h8M12 17v4M17 3h4v4M7 7h10v4M17 11a5 5 0 0 1-10 0 5 5 0 0 1 10 0Z", iconSrc: "/Icon/Leaderboard.svg" },
  { href: "/crm/incentives", label: "Incentives", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", iconSrc: "/Icon/Incentives.svg" },
  { href: "/crm/salary", label: "Salary Reports", icon: "M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2m2 4h10a4 4 0 0 0 4-4V9a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v6a4 4 0 0 0 4 4Z", iconSrc: "/Icon/Salary report.svg" },
  { href: "/crm/attendance/report", label: "Attendance Report", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z", iconSrc: "/Icon/Attendence Report.svg" },
  { href: "/crm/attendance/audit", label: "Attendance Audit", icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h4", iconSrc: "/Icon/Attendence Audit.svg" },
  { href: "/crm/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.1-1.2l2-1.5-2-3.5-2.3 1a8 8 0 0 0-2-1.2L15.1 2h-4l-.4 2.4a8 8 0 0 0-2 1.2l-2.3-1-2 3.5 2 1.5a8 8 0 0 0 0 2.4l-2 1.5 2 3.5 2.3-1a8 8 0 0 0 2 1.2l.4 2.4h4l.4-2.4a8 8 0 0 0 2-1.2l2.3 1 2-3.5-2-1.5c.06-.4.1-.8.1-1.2Z" },
  { href: "/crm/audit", label: "Audit Log", icon: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { href: "/crm/settings/data", label: "Data Tools", icon: "M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3Zm9 6c0 1.66-4.03 3-9 3s-9-1.34-9-3m18 6c0 1.66-4.03 3-9 3s-9-1.34-9-3M3 6v12c0 1.66 4.03 3 9 3s9-1.34 9-3V6" },
  { href: "/crm/settings/templates", label: "Message Templates", icon: "M4 6h16M4 12h16M4 18h10", iconSrc: "/Icon/Message templates.svg" },
  { href: "/crm/settings/office-hours", label: "Office Hours", icon: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", iconSrc: "/Icon/Office Hours.svg" },
  { href: "/crm/settings/incentives", label: "Incentive Rates", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", iconSrc: "/Icon/Incentive Rates.svg" },
  { href: "/crm/settings/team", label: "Team Members", icon: "M17 20h5v-2a3 3 0 0 0-5-2.11M9 20H4v-2a3 3 0 0 1 5-2.11M16 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm5 16v-2a3 3 0 0 0-5-2.11M16 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z", iconSrc: "/Icon/Team Members.svg" },
  // Holds Facebook Page tokens that can read the pages' whole lead history, so it
  // sits with the other admin-only configuration in More rather than in the core
  // tabs a caller sees.
  { href: "/crm/settings/meta", label: "Meta Integration", icon: "M18 2h-3a5 5 0 0 0-5 5v3H7m4 4H5a2 2 0 0 1-2-2V7m16 9v3a5 5 0 0 1-5 5h-3v-3M14 9h4a2 2 0 0 1 2 2v5" },
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

/**
 * A More item without explicit roles is configuration and stays administrator-
 * only. Items that name roles (Marketing, Leaderboard) open to those roles too,
 * which is what gives a marketing user a route to their own page.
 */
const MORE_DEFAULT_ROLES = ["admin", "sales_head"];

export function moreItemsFor(userRole?: string): NavItem[] {
  return NAV_MORE_ITEMS.filter((item) => {
    const roles = item.roles ?? MORE_DEFAULT_ROLES;
    return userRole ? roles.includes(userRole) : false;
  });
}

/** Anyone with at least one More entry gets the More section. */
export function canSeeMore(userRole?: string): boolean {
  return moreItemsFor(userRole).length > 0;
}
