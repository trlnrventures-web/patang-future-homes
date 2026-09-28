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

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{isCaller ? "Caller Inbox" : "Leads"}</h1>
        <button
          onClick={() => setShowNewLead(true)}
          className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-secondary"
        >
          + New Lead
        </button>
      </div>
      {isCaller ? <CallerInbox listContext={ctx} /> : <LeadBoard listContext={ctx} />}
      <NewLeadForm isOpen={showNewLead} onClose={() => setShowNewLead(false)} />
    </>
  );
}
