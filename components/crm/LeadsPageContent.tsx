"use client";

import { useState } from "react";
import CallerInbox from "./CallerInbox";
import LeadBoard from "./LeadBoard";
import NewLeadForm from "./NewLeadForm";

/**
 * Filters carried in the URL so lead detail can offer Previous/Next Lead through
 * the exact queue on screen, and "Back to Leads" can restore it. The board is
 * the only Leads view, so there is no view or page to carry.
 */
export type LeadsViewContext = {
  status: string;
  quick: string;
  sort: string;
  q: string;
};

const EMPTY_CONTEXT: LeadsViewContext = {
  status: "all",
  quick: "",
  sort: "",
  q: "",
};

export default function LeadsPageContent({
  role = "caller",
  listContext,
  inbox = true,
}: {
  role?: string;
  listContext?: LeadsViewContext;
  inbox?: boolean;
}) {
  const [showNewLead, setShowNewLead] = useState(false);
  // The page defaults to the caller inbox, so only an explicit `inbox=0` opts out.
  const isCaller = inbox ? role === "caller" : false;
  const ctx = listContext ?? EMPTY_CONTEXT;

  // The board fills the viewport instead of growing with its tallest column, so
  // each stage scrolls inside itself and the page never scrolls vertically.
  // `calc(100dvh - 4rem)` is exactly `main`'s content box at md and up (p-6 top
  // plus pb-10 bottom); the heading is then `shrink-0` and the board takes the
  // rest, so banners and toolbars push the columns rather than the page.
  //
  // The caller inbox is a single flat list that is meant to scroll with the page,
  // so it keeps the ordinary flow and gets none of this.
  const boardFill = !isCaller;

  return (
    <div
      className={
        boardFill
          ? "md:flex md:h-[calc(100dvh-4rem)] md:min-h-0 md:flex-col md:overflow-hidden"
          : undefined
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{isCaller ? "Caller Inbox" : "Leads"}</h1>
        <button
          onClick={() => setShowNewLead(true)}
          className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-secondary"
        >
          + New Lead
        </button>
      </div>
      <div className={boardFill ? "md:min-h-0 md:flex-1" : undefined}>
        {isCaller ? <CallerInbox listContext={ctx} /> : <LeadBoard listContext={ctx} />}
      </div>
      <NewLeadForm isOpen={showNewLead} onClose={() => setShowNewLead(false)} />
    </div>
  );
}
