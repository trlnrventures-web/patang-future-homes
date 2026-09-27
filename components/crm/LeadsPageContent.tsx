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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">
            {isCaller ? "Caller Inbox" : "Lead Board"}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {isCaller
              ? "Handle new leads quickly. Prioritize what is overdue."
              : "Drag a lead between columns to change its stage."}
          </p>
        </div>
        <button
          onClick={() => setShowNewLead(true)}
          className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-secondary"
        >
          + New Lead
        </button>
      </div>
      {isCaller ? <CallerInbox listContext={ctx} /> : <LeadBoard listContext={ctx} />}
      <NewLeadForm isOpen={showNewLead} onClose={() => setShowNewLead(false)} />
    </>
  );
}
