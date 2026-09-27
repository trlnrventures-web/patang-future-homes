import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/crm/data";
import { redirect } from "next/navigation";
import LeadsPageContent from "@/components/crm/LeadsPageContent";
import { LEAD_STATUS_LABELS } from "@/lib/crm/leads";
import { QUICK_FILTERS } from "@/lib/crm/lead-query";
import { BOARD_SORT_KEYS, BOARD_STATUS_FILTERS } from "@/lib/crm/board-shared";
import { INBOX_SORTS, INBOX_TABS } from "@/lib/crm/inbox-shared";

export const metadata: Metadata = {
  title: { absolute: "Leads | Patang CRM" },
  robots: { index: false, follow: false },
};

function first(v: string | string[] | undefined): string {
  const raw = Array.isArray(v) ? v[0] : v;
  return typeof raw === "string" ? raw : "";
}

/**
 * Lead links carry the board's filters/sort so lead detail can offer
 * Previous/Next Lead and a Back link that returns to the same view. These
 * values are whitelisted here so the board cannot be driven into a bad state.
 */
export type LeadsViewContext = {
  status: string;
  quick: string;
  sort: string;
  q: string;
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
  const fromInbox = first(sp.inbox) === "1";

  const context: LeadsViewContext = {
    // A caller coming back from a lead carries the inbox tab in `status`; the two
    // inboxes name their buckets differently, so accept either vocabulary.
    status:
      status && (status in LEAD_STATUS_LABELS || (fromInbox && (INBOX_TABS as readonly string[]).includes(status)))
        ? status
        : "all",
    quick: (QUICK_FILTERS as readonly string[]).includes(quick) ? quick : "",
    // The board and the caller inbox order differently, so each gets its own
    // default: the board surfaces the leads most stuck in their column, the
    // inbox wants the newest work first.
    sort: fromInbox
      ? (INBOX_SORTS as readonly string[]).includes(sort)
        ? sort
        : "newest"
      : BOARD_SORT_KEYS.includes(sort)
        ? sort
        : "longest_in_stage",
    q: first(sp.q).slice(0, 100),
  };

  // The board is the only Leads view, so a status outside its filter row is
  // meaningless here — but the caller inbox has its own tab vocabulary.
  if (!fromInbox && !(BOARD_STATUS_FILTERS as readonly string[]).includes(status)) {
    context.status = "all";
  }

  return <LeadsPageContent role={user.role} listContext={context} inbox={fromInbox} />;
}
