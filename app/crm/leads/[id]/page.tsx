import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/crm/data";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { and, eq, isNull } from "drizzle-orm";
import { suggestCategory, buildLeadContext } from "@/lib/crm/messages";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, findLikelyDuplicates } from "@/lib/crm/leads";
import { Badge } from "@/components/crm/ui";
import LeadDetail, { LeadDetailData } from "@/components/crm/LeadDetail";
import MessageCenter, { MCTemplate, MCLog, MCLead } from "@/components/crm/MessageCenter";

export const metadata: Metadata = {
  title: { absolute: "Lead Details | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function LeadDetailPage({
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
const lead = db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), isNull(schema.leads.deletedAt)))
    .get();

  if (!lead) notFound();

// Role access check: callers may open any lead (handed-off ones stay
  // searchable). Sales managers only their own.
  if (user.role === "sales_manager" && lead.assignedSmId !== user.id) notFound();

  const users = db.select().from(schema.users).all();
  const userMap = new Map(users.map((u) => [u.id, u]));

  const activities = db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.leadId, lead.id))
    .orderBy(schema.activities.createdAt)
    .all()
    .reverse()
    .map((a) => ({
      ...a,
      userName: userMap.get(a.userId)?.name || "",
    }));

  const followUps = db
    .select()
    .from(schema.followUps)
    .where(eq(schema.followUps.leadId, lead.id))
    .orderBy(schema.followUps.scheduledFor)
    .all();

const visits = db
    .select()
    .from(schema.siteVisits)
    .where(eq(schema.siteVisits.leadId, lead.id))
    .orderBy(schema.siteVisits.date)
    .all()
    .map((v) => ({
      ...v,
      smName: userMap.get(v.smId)?.name || "",
    }));

  const latestFeedback = db
    .select()
    .from(schema.postVisitFeedback)
    .where(eq(schema.postVisitFeedback.leadId, lead.id))
    .orderBy(schema.postVisitFeedback.createdAt)
    .all()
    .pop() ?? null;

  const sharedTemplates = db
    .select()
    .from(schema.messageTemplates)
    .where(eq(schema.messageTemplates.isPersonal, false as never))
    .all()
    .filter((t) => t.active);

  const personalTemplates = db
    .select()
    .from(schema.messageTemplates)
    .where(eq(schema.messageTemplates.isPersonal, true as never))
    .all()
    .filter((t) => t.createdBy === user.id && t.active);

  const messageLogs = db
    .select()
    .from(schema.messageLogs)
    .where(eq(schema.messageLogs.leadId, lead.id))
    .orderBy(schema.messageLogs.createdAt)
    .all()
    .reverse()
    .map((l) => ({
      ...l,
      userName: userMap.get(l.userId)?.name || "",
    }));

  const suggestedCategory = suggestCategory(lead);

  const context = buildLeadContext(lead, {
    sm_name: lead.assignedSmId ? userMap.get(lead.assignedSmId)?.name || "" : "",
  });

  const leadData: LeadDetailData = {
    lead: {
      ...lead,
      assignedCallerName: lead.assignedCallerId
        ? userMap.get(lead.assignedCallerId)?.name || ""
        : "",
      assignedSmName: lead.assignedSmId
        ? userMap.get(lead.assignedSmId)?.name || ""
        : "",
    },
activities,
    followUps,
    visits,
    users: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    latestFeedback,
    duplicates: user.role === "admin" || user.role === "sales_head"
      ? findLikelyDuplicates(db, lead)
      : [],
  };

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/crm/leads"
          className="text-xs font-semibold text-accent-ink hover:underline"
        >
          ← Back to Leads
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-primary">{lead.name}</h1>
          <Badge
            color={LEAD_STATUS_COLORS[lead.status] || "bg-gray-100 text-gray-700"}
          >
            {LEAD_STATUS_LABELS[lead.status] || lead.status}
          </Badge>
          {context.original_project && (
            <span className="text-xs text-soft">
              Enquired: {context.original_project}
            </span>
          )}
        </div>
      </div>

      <LeadDetail data={leadData} currentUser={user} />

      <div className="mt-8 scroll-mt-24" id="message-center">
        <h2 className="mb-3 text-base font-bold text-primary">
          Hinglish Message Center
        </h2>
        <MessageCenter
          lead={lead as unknown as MCLead}
          sharedTemplates={sharedTemplates as MCTemplate[]}
          personalTemplates={personalTemplates as MCTemplate[]}
          initialLogs={messageLogs as MCLog[]}
          suggestedCategory={suggestedCategory}
        />
      </div>
    </div>
  );
}

