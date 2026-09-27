/**
 * Client-safe pieces of the caller inbox.
 *
 * These are imported by `CallerInbox`, so this module must never reach for the
 * database — `better-sqlite3` is a native Node module and cannot be bundled for
 * the browser. The querying half lives in `inbox-query.ts`.
 */

export const INBOX_TABS = [
  "new",
  "calling_now",
  "today_calls",
  "overdue",
  "no_response",
  "qualified",
  "ready_to_assign",
  "recently_assigned",
  "follow_up",
  "lost",
  "all",
] as const;

export const INBOX_SORTS = ["newest", "oldest", "overdue"] as const;

export type InboxTab = (typeof INBOX_TABS)[number];
export type InboxSort = (typeof INBOX_SORTS)[number];

export type InboxLead = {
  id: number;
  name: string;
  phone: string;
  whatsappNumber: string | null;
  source: string;
  campaignName: string | null;
  originalProject: string | null;
  location: string | null;
  bhk: string | null;
  budget: string | null;
  status: string;
  concern: string | null;
  createdAt: string;
  nextFollowUp: string;
  nextAction: string;
  slaStatus: string;
  priority: string;
  leadAge: string;
  leadAgeMinutes: number;
  attemptCount: number;
  assignedCallerName: string;
  assignedSmName: string;
  assignedSmId: number | null;
  assignedAt: string | null;
  nextFollowUpIso: string | null;
  hasOverdueFollowUp: boolean;
};

export function isInboxTab(value: string | undefined): value is InboxTab {
  return !!value && (INBOX_TABS as readonly string[]).includes(value);
}

export function isInboxSort(value: string | undefined): value is InboxSort {
  return !!value && (INBOX_SORTS as readonly string[]).includes(value);
}
