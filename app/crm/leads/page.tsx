import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/crm/data";
import { redirect } from "next/navigation";
import LeadsPageContent from "@/components/crm/LeadsPageContent";
import { LEAD_STATUS_LABELS } from "@/lib/crm/leads";
import { QUICK_FILTERS } from "@/lib/crm/lead-query";
import { INBOX_TABS } from "@/lib/crm/inbox-shared";

export const metadata: Metadata = {
  title: { absolute: "Leads | Patang CRM" },
  robots: { index: false, follow: false },
};

const LIST_SORTS = ["newest", "oldest", "overdue"] as const;

function first(v: string | string[] | undefined): string {
  const raw = Array.isArray(v) ? v[0] : v;
  return typeof raw === "string" ? raw : "";
}

/**
 * Lead links carry the list's filters/sort so lead detail can offer
 * Previous/Next Lead and a Back link that returns to the same view. These
 * values are whitelisted here so the list cannot be driven into a bad state.
 */
export type LeadsListContext = {
  status: string;
  quick: string;
  sort: string;
  q: string;
  page: number;
  view: "list" | "board";
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const sp = await searchParams;
  const status = first(sp.status);
  const quick = first(sp.quick);
  const sort = first(sp.sort);
  const page = Number.parseInt(first(sp.page), 10);
  const view = first(sp.view);
  const fromInbox = first(sp.inbox) === "1";

  const context: LeadsListContext = {
    // A caller coming back from a lead carries the inbox tab in `status`; the two
    // inboxes name their buckets differently, so accept either vocabulary.
    status:
      status && (status in LEAD_STATUS_LABELS || (fromInbox && (INBOX_TABS as readonly string[]).includes(status)))
        ? status
        : "all",
    quick: (QUICK_FILTERS as readonly string[]).includes(quick) ? quick : "",
    sort: (LIST_SORTS as readonly string[]).includes(sort) ? sort : "newest",
    q: first(sp.q).slice(0, 100),
    page: Number.isFinite(page) && page > 1 ? page : 1,
    view: view === "board" ? "board" : "list",
  };

  return <LeadsPageContent role={user.role} listContext={context} inbox={fromInbox} />;
}
