import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import { readProjectsFile } from "@/lib/crm/projects-store";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { and, eq } from "drizzle-orm";
import MetaIntegrationPanel from "@/components/crm/MetaIntegrationPanel";

export const metadata: Metadata = {
  title: { absolute: "Meta Integration | Patang CRM" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MetaIntegrationSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  // Facebook tokens grant read access to the Page's lead history, so this is the
  // same guard Team Members and Office Hours use: admin/owner only.
  const isAdmin = user.role === "admin" || user.role === "sales_head";
  if (!isAdmin) redirect("/crm/dashboard");

  // The two assignment dropdowns are populated here rather than in the client, so
  // the panel opens with real names in it and the list of who can be assigned is
  // decided by the server.
  const db = getDb();
  const staff = db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.active, true),
        eq(schema.users.role, "caller")
      )
    )
    .all();

  const salesManagers = db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.active, true),
        eq(schema.users.role, "sales_manager")
      )
    )
    .all();

  // Projects come from the shared catalogue so a form's project is chosen from the
  // same list the properties pages use, rather than a free-text field that would
  // drift ("PAM" vs "PAM Residency" vs a typo).
  let projects: string[] = [];
  try {
    projects = readProjectsFile()
      .map((p) => String(p.title ?? p.name ?? p.slug ?? "").trim())
      .filter(Boolean);
  } catch {
    // The catalogue file is absent on a fresh checkout. An empty list just means
    // the admin types the project name instead.
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Meta Integration</h1>
        <p className="mt-0.5 text-sm text-muted">
          Connect the Patang Facebook pages to pull Lead Ad submissions straight
          into the CRM, without a middle service in between. Leads are fetched on a
          schedule and matched against existing numbers before a new lead is made.
        </p>
      </div>

      <MetaIntegrationPanel
        callers={staff.map((s) => ({ id: s.id, name: s.name }))}
        salesManagers={salesManagers.map((s) => ({ id: s.id, name: s.name }))}
        projects={projects}
      />
    </div>
  );
}
