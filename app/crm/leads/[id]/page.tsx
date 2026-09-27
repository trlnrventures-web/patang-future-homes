import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/crm/data";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { and, eq, isNull } from "drizzle-orm";
import { suggestCategory, buildLeadContext } from "@/lib/crm/messages";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, findLikelyDuplicates } from "@/lib/crm/leads";
import { queryLeadList, QUICK_FILTERS } from "@/lib/crm/lead-query";
import { queryInboxLeads } from "@/lib/crm/inbox-query";
import { INBOX_SORTS, isInboxTab } from "@/lib/crm/inbox-shared";
import { BOARD_SORT_KEYS } from "@/lib/crm/board-shared";
import { readProjectsFile } from "@/lib/crm/projects-store";
import { Badge } from "@/components/crm/ui";
import LeadDetail, { LeadDetailData } from "@/components/crm/LeadDetail";
import MessageCenter, { MCTemplate, MCLog, MCLead } from "@/components/crm/MessageCenter";

export const metadata: Metadata = {
  title: { absolute: "Lead Details | Patang CRM" },
  robots: { index: false, follow: false },
};

const LIST_SORTS = [
  ...INBOX_SORTS,
  ...BOARD_SORT_KEYS,
].filter((s, i, all) => all.indexOf(s) === i) as string[];

/** `searchParams` values may be arrays and are untrusted, so take one and whitelist it. */
function firstValue(v: string | string[] | undefined): string {
  const raw = Array.isArray(v) ? v[0] : v;
  return typeof raw === "string" ? raw : "";
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const query = await searchParams;
  const initialVisitOpen = query.visit === "1";
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
    propertyOptions: (readProjectsFile()
      .map((p) => String(p.title || ""))
      .filter(Boolean) as string[])
      .sort((a, b) => a.localeCompare(b)),
  };

  // Rebuild the exact list the user drilled in from, so Previous/Next Lead walks
  // the same sequence with the same filters and sort. Unknown values are dropped
  // rather than trusted.
  const rawStatus = firstValue(query.status);
  const rawQuick = firstValue(query.quick);
  const rawSort = firstValue(query.sort);
  const rawQ = firstValue(query.q);
  // Callers arrive from the Caller Inbox, whose tabs and ordering differ from the
  // Leads list, so it carries its own context flag and is rebuilt separately.
  const fromInbox = firstValue(query.inbox) === "1";
  const navStatus = rawStatus && rawStatus in LEAD_STATUS_LABELS ? rawStatus : undefined;
  const navQuick =
    rawQuick && (QUICK_FILTERS as readonly string[]).includes(rawQuick) ? rawQuick : undefined;
  const navSort = rawSort && (LIST_SORTS as readonly string[]).includes(rawSort) ? rawSort : undefined;
  const navQuery = {
    status: fromInbox ? undefined : navStatus,
    quick: fromInbox ? undefined : navQuick,
    sort: navSort,
    q: rawQ ? rawQ.slice(0, 100) : undefined,
  };

  const navParams = new URLSearchParams();
  if (fromInbox) navParams.set("inbox", "1");
  for (const [key, value] of Object.entries(navQuery)) {
    if (value) navParams.set(key, value);
  }
  if (fromInbox && rawStatus && isInboxTab(rawStatus)) navParams.set("status", rawStatus);
  const navQs = navParams.toString();
  const leadHref = (targetId: number) => `/crm/leads/${targetId}${navQs ? `?${navQs}` : ""}`;
  const backHref = `/crm/leads${navQs ? `?${navQs}` : ""}`;

  const queue = fromInbox
    ? queryInboxLeads(db, user, { tab: rawStatus, sort: navSort, q: navQuery.q })
    : queryLeadList(db, user, navQuery);
  const currentIndex = queue.findIndex((l) => l.id === leadId);
  const prevLead = currentIndex > 0 ? queue[currentIndex - 1] : null;
  const nextLead = currentIndex >= 0 ? (queue[currentIndex + 1] ?? null) : null;
  const inQueue = currentIndex >= 0 && queue.length > 1;

  const navLinkCls =
    "rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5";
  const navDisabledCls =
    "cursor-not-allowed rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-bold text-soft opacity-50";

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={backHref} className="text-xs font-semibold text-accent-ink hover:underline">
            ← {fromInbox ? "Back to Inbox" : "Back to Leads"}
          </Link>
          <div className="flex items-center gap-2">
            {inQueue && (
              <span className="hidden text-[11px] font-semibold text-soft sm:inline">
                Lead {currentIndex + 1} of {queue.length}
              </span>
            )}
            {prevLead ? (
              <Link
                href={leadHref(prevLead.id)}
                className={navLinkCls}
                title={prevLead.name}
              >
                ← Previous
              </Link>
            ) : (
              <span aria-disabled="true" className={navDisabledCls}>
                ← Previous
              </span>
            )}
            {nextLead ? (
              <Link
                href={leadHref(nextLead.id)}
                className={navLinkCls}
                title={nextLead.name}
              >
                Next →
              </Link>
            ) : (
              <span aria-disabled="true" className={navDisabledCls}>
                Next →
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">{lead.name}</h1>
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

      <LeadDetail
        data={leadData}
        currentUser={user}
        initialVisitOpen={initialVisitOpen}
        messageCenter={
          <div className="scroll-mt-24" id="message-center">
            <h2 className="mb-3 text-base font-bold text-primary">
              Message Center
            </h2>
            <MessageCenter
              lead={lead as unknown as MCLead}
              sharedTemplates={sharedTemplates as MCTemplate[]}
              personalTemplates={personalTemplates as MCTemplate[]}
              initialLogs={messageLogs as MCLog[]}
              suggestedCategory={suggestedCategory}
            />
          </div>
        }
      />
    </div>
  );
}

