import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/crm/data";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, desc } from "drizzle-orm";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from "@/lib/crm/leads";
import { Badge } from "@/components/crm/ui";
import NegotiationWorkspace, { NegotiationData } from "@/components/crm/NegotiationWorkspace";
import { projects } from "@/lib/projects";

export const metadata: Metadata = {
  title: { absolute: "Negotiation | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function NegotiationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const { id } = await params;
  const leadId = Number(id);
  if (Number.isNaN(leadId)) notFound();

  const db = getDb();
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
  if (!lead) notFound();

  if (user.role === "caller") notFound();
  if (user.role === "sales_manager" && lead.assignedSmId !== user.id) notFound();

  const users = db.select().from(schema.users).all();
  const userMap = new Map(users.map((u) => [u.id, u]));

  const negotiation = db
    .select()
    .from(schema.negotiations)
    .where(eq(schema.negotiations.leadId, leadId))
    .orderBy(desc(schema.negotiations.createdAt))
    .all()
    .find((n) => !["booked", "negotiation_lost"].includes(n.status as never));

  const activities = db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.leadId, leadId))
    .orderBy(schema.activities.createdAt)
    .all()
    .reverse()
    .slice(0, 30)
    .map((a) => ({
      ...a,
      userName: userMap.get(a.userId)?.name || "",
    }));

  const visits = db
    .select()
    .from(schema.siteVisits)
    .where(eq(schema.siteVisits.leadId, leadId))
    .orderBy(schema.siteVisits.date)
    .all()
    .map((v) => ({
      ...v,
      smName: userMap.get(v.smId)?.name || "",
      feedback: db
        .select()
        .from(schema.postVisitFeedback)
        .where(eq(schema.postVisitFeedback.visitId, v.id))
        .get() || null,
    }));

  const bookings = db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.leadId, leadId))
    .orderBy(desc(schema.bookings.createdAt))
    .all()
    .map((b) => ({
      ...b,
      projectTitle: b.projectId ? projects.find((p) => p.slug === b.projectId)?.title || b.projectId : "",
      smName: userMap.get(b.smId)?.name || "",
    }));

  const projectMap = Object.fromEntries(projects.map((p) => [p.slug, p.title]));

  const leadData = {
    ...lead,
    assignedCallerName: lead.assignedCallerId
      ? userMap.get(lead.assignedCallerId)?.name || ""
      : "",
    assignedSmName: lead.assignedSmId
      ? userMap.get(lead.assignedSmId)?.name || ""
      : "",
  };

  const data: NegotiationData = {
    lead: leadData,
    negotiation: negotiation || null,
    activities,
    visits,
    bookings,
    projectMap,
  };

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/crm/leads/${leadId}`}
          className="text-xs font-semibold text-accent-ink hover:underline"
        >
          ← Back to Lead
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-primary">Negotiation</h1>
          <Badge color={LEAD_STATUS_COLORS[lead.status] || "bg-gray-100 text-gray-700"}>
            {LEAD_STATUS_LABELS[lead.status] || lead.status}
          </Badge>
        </div>
      </div>

      <NegotiationWorkspace data={data} currentUser={{ id: user.id, role: user.role }} />
    </div>
  );
}