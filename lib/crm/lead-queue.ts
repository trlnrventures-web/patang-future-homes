/**
 * The frozen Previous/Next queue for lead detail.
 *
 * A lead opened from the board, the caller inbox or a filtered list is handed a
 * `queue` key in the URL. The ordered ids that were on screen are frozen into
 * sessionStorage under that key, so changing the open lead's stage does not
 * rebuild or reorder the queue and does not jump the user to another stage.
 * Direct links (notification, global search) carry no key and fall back to a
 * server-built queue for the lead's own stage.
 *
 * This module is imported by both a server component (types only) and client
 * components, so every runtime helper guards on `window`.
 */

export type LeadQueueKind = "board" | "inbox" | "list";

export type LeadQueue = {
  /** Frozen ordered lead ids, exactly the order the user was looking at. */
  ids: number[];
  /** Stage key (board column key or status) the queue is pinned to. */
  stage: string;
  /** Human label for the stage, e.g. "Follow-up". */
  stageLabel: string;
  kind: LeadQueueKind;
  /** Context the queue was built from, so the ids can be re-validated later. */
  column?: string;
  status?: string;
  tab?: string;
  quick?: string;
  q?: string;
  sort?: string;
};

const STORAGE_PREFIX = "pfh.leadQueue.";
export const QUEUE_PARAM = "queue";

export function newQueueKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the timestamp key */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function saveQueue(key: string, queue: LeadQueue): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(queue));
  } catch {
    /* private mode / quota - the queue simply is not frozen */
  }
}

export function loadQueue(key: string | null | undefined): LeadQueue | null {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LeadQueue>;
    if (!Array.isArray(parsed.ids) || typeof parsed.stage !== "string") return null;
    return {
      ids: parsed.ids.filter((n): n is number => typeof n === "number"),
      stage: parsed.stage,
      stageLabel: typeof parsed.stageLabel === "string" ? parsed.stageLabel : parsed.stage,
      kind: parsed.kind === "board" || parsed.kind === "inbox" ? parsed.kind : "list",
      column: parsed.column,
      status: parsed.status,
      tab: parsed.tab,
      quick: parsed.quick,
      q: parsed.q,
      sort: parsed.sort,
    };
  } catch {
    return null;
  }
}

/**
 * The ids endpoint URL that reproduces this queue's filter. Calling it re-runs
 * the same list/inbox comparator and permission scope, so the result is exactly
 * "which of these leads are still visible and still in this stage".
 */
export function queueIdsUrl(queue: LeadQueue): string {
  const p = new URLSearchParams();
  p.set("view", "ids");
  if (queue.kind === "inbox") {
    p.set("inbox", "1");
    if (queue.tab) p.set("tab", queue.tab);
    if (queue.q) p.set("q", queue.q);
    if (queue.sort) p.set("sort", queue.sort);
  } else {
    // `column` (board stages, and a direct link's own stage) and `status` are
    // both stage pins; include whichever the queue was built with, whichever
    // kind it came from.
    if (queue.column) p.set("column", queue.column);
    if (queue.status) p.set("status", queue.status);
    if (queue.quick) p.set("quick", queue.quick);
    if (queue.q) p.set("q", queue.q);
    if (queue.sort) p.set("sort", queue.sort);
  }
  return `/crm/api/leads?${p.toString()}`;
}

/** Lead-detail href that keeps the frozen queue key and the list context. */
export function leadQueueHref(leadId: number, queueKey: string, contextQs: string): string {
  const p = new URLSearchParams(contextQs.startsWith("?") ? contextQs.slice(1) : contextQs);
  p.set(QUEUE_PARAM, queueKey);
  return `/crm/leads/${leadId}?${p.toString()}`;
}
