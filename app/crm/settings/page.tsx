import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import { Card } from "@/components/crm/ui";

export const metadata: Metadata = {
  title: { absolute: "Settings | Patang CRM" },
  robots: { index: false, follow: false },
};

const SECTIONS: { href: string; title: string; description: string }[] = [
  {
    href: "/crm/settings/general",
    title: "Lead Rules",
    description: "First-response SLA, matching weights, no-response ladder and budget chips.",
  },
  {
    href: "/crm/settings/office-hours",
    title: "Office Hours",
    description: "When staff may see lead contact details, and the office week-off.",
  },
  {
    href: "/crm/settings/incentives",
    title: "Incentive Rates",
    description: "Payout rates applied to bookings and closures.",
  },
  {
    href: "/crm/settings/team",
    title: "Team Members",
    description: "Users, roles and lead-access permissions.",
  },
  {
    href: "/crm/settings/templates",
    title: "Message Templates",
    description: "Shared WhatsApp and SMS templates for the team.",
  },
  {
    href: "/crm/settings/meta",
    title: "Meta Integration",
    description: "Facebook Lead Ad forms, mapping and sync status.",
  },
  {
    href: "/crm/audit",
    title: "Audit Log",
    description: "Every configuration change, contact reveal and payroll event.",
  },
  {
    href: "/crm/settings/data",
    title: "Data Tools",
    description: "Recover archived leads and review data operations.",
  },
];

export default async function SettingsHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const isAdmin = user.role === "admin" || user.role === "sales_head";
  if (!isAdmin) redirect("/crm/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">
          Configuration and data tools, all in one place.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <Card className="h-full p-4 transition-colors group-hover:border-primary/40">
              <h2 className="text-sm font-bold text-navy group-hover:text-primary">{s.title}</h2>
              <p className="mt-1 text-xs text-muted">{s.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
