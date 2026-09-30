/**
 * Client-safe board constants.
 *
 * `LeadBoard` is a client component, so the funnel map and the board's own
 * filter/sort vocabulary live here instead of in `leads.ts`, which reaches for
 * the database and `better-sqlite3` (a native module the browser cannot
 * bundle). `leads.ts` re-exports the funnel map from here, so there is still a
 * single definition shared by the server and the board.
 */

export type FunnelStage = {
  key: string;
  label: string;
  status: string;
  matches: string[];
};

/**
 * The primary sales funnel. Every other status folds into exactly one column, so
 * this is the canonical map used by the lead-detail stepper, the status picker
 * and the Kanban board columns.
 */
export const LEAD_FUNNEL_STAGES: FunnelStage[] = [
  { key: "new", label: "New", status: "new", matches: ["new", "calling", "connected", "no_response"] },
  { key: "initial_contact", label: "Initial Contact", status: "initial_contact", matches: ["initial_contact"] },
  { key: "qualified", label: "Qualified", status: "qualified", matches: ["qualified"] },
  { key: "follow_up", label: "Follow-up", status: "follow_up", matches: ["assigned", "follow_up", "nurture"] },
  { key: "plan_hold", label: "Plan Hold", status: "plan_hold", matches: ["plan_hold"] },
  { key: "visit_booked", label: "Visit Booked", status: "visit_booked", matches: ["visit_proposed", "visit_booked"] },
  { key: "visit_confirmed", label: "Visit Confirmed", status: "visit_confirmed", matches: ["visit_confirmed"] },
  { key: "visit_done", label: "Visit Done", status: "visit_done", matches: ["visit_done"] },
  { key: "negotiation", label: "Negotiation", status: "negotiation", matches: ["negotiation"] },
  { key: "booked", label: "Booked", status: "booked", matches: ["booked"] },
];

/** Which funnel column a status belongs to, or null for exited leads. */
export function funnelStageForStatus(status: string): FunnelStage | null {
  return LEAD_FUNNEL_STAGES.find((s) => s.matches.includes(status)) || null;
}

export type LeadColumn = {
  key: string;
  label: string;
  /** The status a card is set to when it is dropped into this column. */
  dropStatus: string;
  /** Every status that belongs to this column. */
  matches: string[];
  /** Closed columns start collapsed at the far right of the board. */
  closed?: boolean;
};

/**
 * The eleven board columns. The funnel above has ten stages because it treats
 * "Visit Booked" and "Visit Confirmed" as separate steps; the board folds them
 * into a single Site Visit column, and splits the top of the funnel so a caller
 * can see at a glance which leads they have actually spoken to.
 *
 * `dropStatus` is the first stage of the group, so dropping a card into a
 * grouped column always lands the lead on that group's entry status.
 */
export const LEAD_COLUMNS: LeadColumn[] = [
  { key: "new", label: "New", dropStatus: "new", matches: ["new", "calling", "no_response"] },
  { key: "contacted", label: "Contacted", dropStatus: "connected", matches: ["connected"] },
  { key: "initial_contact", label: "Initial Contact", dropStatus: "initial_contact", matches: ["initial_contact"] },
  { key: "qualified", label: "Qualified", dropStatus: "qualified", matches: ["qualified"] },
  { key: "follow_up", label: "Follow-up", dropStatus: "follow_up", matches: ["assigned", "follow_up", "nurture"] },
  { key: "plan_hold", label: "Plan Hold", dropStatus: "plan_hold", matches: ["plan_hold"] },
  { key: "site_visit", label: "Site Visit", dropStatus: "visit_proposed", matches: ["visit_proposed", "visit_booked", "visit_confirmed"] },
  { key: "visit_done", label: "Visit Done", dropStatus: "visit_done", matches: ["visit_done"] },
  { key: "negotiation", label: "Negotiation", dropStatus: "negotiation", matches: ["negotiation"] },
  { key: "booked", label: "Booked", dropStatus: "booked", matches: ["booked"] },
  { key: "lost", label: "Lost", dropStatus: "lost", matches: ["lost", "invalid", "dnc"], closed: true },
];

/** Which board column a status belongs to, or null for a status past the funnel. */
export function columnForStatus(status: string): LeadColumn | null {
  return LEAD_COLUMNS.find((c) => c.matches.includes(status)) || null;
}

/** Readable acquisition-source names, so a card never shows a raw slug. */
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  meta: "Meta",
  facebook: "Facebook",
  google: "Google",
  website: "Website",
  walk_in: "Walk-in",
  referral: "Referral",
  instagram: "Instagram",
  youtube: "YouTube",
  other: "Other",
};

export function sourceLabel(value: string | null | undefined): string {
  if (!value) return "";
  return LEAD_SOURCE_LABELS[value] || value;
}

/** Per-column accent colour, so the eleven columns read apart at a glance. */
export const STAGE_ACCENTS: Record<
  string,
  { bar: string; text: string; soft: string; ring: string }
> = {
  new: { bar: "bg-sky-500", text: "text-sky-700", soft: "bg-sky-50", ring: "ring-sky-300" },
  initial_contact: { bar: "bg-blue-500", text: "text-blue-700", soft: "bg-blue-50", ring: "ring-blue-300" },
  qualified: { bar: "bg-emerald-500", text: "text-emerald-700", soft: "bg-emerald-50", ring: "ring-emerald-300" },
  follow_up: { bar: "bg-amber-500", text: "text-amber-700", soft: "bg-amber-50", ring: "ring-amber-300" },
  plan_hold: { bar: "bg-stone-500", text: "text-stone-700", soft: "bg-stone-50", ring: "ring-stone-300" },
  visit_booked: { bar: "bg-cyan-500", text: "text-cyan-700", soft: "bg-cyan-50", ring: "ring-cyan-300" },
  visit_confirmed: { bar: "bg-teal-500", text: "text-teal-700", soft: "bg-teal-50", ring: "ring-teal-300" },
  visit_done: { bar: "bg-indigo-500", text: "text-indigo-700", soft: "bg-indigo-50", ring: "ring-indigo-300" },
  negotiation: { bar: "bg-fuchsia-500", text: "text-fuchsia-700", soft: "bg-fuchsia-50", ring: "ring-fuchsia-300" },
  booked: { bar: "bg-green-600", text: "text-green-700", soft: "bg-green-50", ring: "ring-green-300" },
};

export const FALLBACK_ACCENT = {
  bar: "bg-gray-400",
  text: "text-gray-700",
  soft: "bg-gray-50",
  ring: "ring-gray-300",
};

/**
 * Board quick filters. `my_leads` is resolved on the client from the signed-in
 * user, so it is deliberately absent from the server's QUICK_FILTERS.
 */
export const BOARD_QUICK_FILTERS = [
  { key: "", label: "All" },
  { key: "my_leads", label: "My Leads" },
  { key: "overdue", label: "Overdue" },
  { key: "hot", label: "Hot" },
] as const;

/** Quick filter keys the board sends to the server (everything but `my_leads`). */
export const BOARD_SERVER_QUICK_KEYS = BOARD_QUICK_FILTERS.map((o) => o.key as string).filter(
  (k) => k !== "" && k !== "my_leads"
);

/**
 * The board has no sort control: it always walks the server default (newest
 * first). `longest_in_stage` is kept here only so older links carrying it still
 * normalise to a valid sort on the server page.
 */
export const BOARD_SORTS = [
  { key: "newest", label: "Newest First" },
  { key: "oldest", label: "Oldest First" },
  { key: "overdue", label: "Most Overdue First" },
  { key: "longest_in_stage", label: "Longest In Stage" },
] as const;

export const BOARD_SORT_KEYS = BOARD_SORTS.map((o) => o.key) as string[];

/** Raw statuses worth filtering on, including ones folded into a wider column. */
export const BOARD_STATUS_FILTERS = [
  "all",
  "new",
  "calling",
  "connected",
  "no_response",
  "initial_contact",
  "qualified",
  "assigned",
  "follow_up",
  "nurture",
  "plan_hold",
  "visit_proposed",
  "visit_booked",
  "visit_confirmed",
  "visit_done",
  "negotiation",
  "booked",
  "lost",
] as const;

export type BoardDensity = "comfortable" | "compact";

/** How long a lead has sat in its column, as a ramp from fresh to stuck. */
export function agingTone(daysInStage: number): { label: string; cls: string } {
  if (daysInStage >= 15)
    return { label: `${daysInStage}d`, cls: "bg-red-100 text-red-700 ring-1 ring-red-200" };
  if (daysInStage >= 8)
    return { label: `${daysInStage}d`, cls: "bg-orange-100 text-orange-700 ring-1 ring-orange-200" };
  if (daysInStage >= 4)
    return { label: `${daysInStage}d`, cls: "bg-amber-100 text-amber-800 ring-1 ring-amber-200" };
  if (daysInStage >= 2) return { label: `${daysInStage}d`, cls: "bg-sky-100 text-sky-700" };
  return { label: daysInStage === 0 ? "today" : `${daysInStage}d`, cls: "bg-emerald-50 text-emerald-700" };
}

/** The subset of a lead row the board draws. */
export type BoardLead = {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  assignedCallerId?: number | null;
  assignedSmId?: number | null;
  assignedCallerName?: string;
  bhk: string | null;
  budget: string | null;
  location?: string | null;
  source: string;
  originalProject: string | null;
  preferredProject?: string | null;
  status: string;
  createdAt: string;
  daysInStage: number;
  assignedSmName?: string;
  leadScore?: number | null;
  nextFollowUpDisplay?: string | null;
  hasOverdueFollowUp?: boolean;
  slaStatus?: string;
};
