"use client";

import { useState } from "react";
import CallerInbox from "./CallerInbox";
import LeadsList from "./LeadsList";
import NewLeadForm from "./NewLeadForm";

export type LeadsListContext = {
  status: string;
  quick: string;
  sort: string;
  q: string;
  page: number;
  view: "list" | "board";
};

const EMPTY_CONTEXT: LeadsListContext = {
  status: "all",
  quick: "",
  sort: "newest",
  q: "",
  page: 1,
  view: "list",
};

export default function LeadsPageContent({
  role = "caller",
  listContext,
  inbox = true,
}: {
  role?: string;
  listContext?: LeadsListContext;
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
            {isCaller ? "Caller Inbox" : "Lead Inbox"}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {isCaller
              ? "Handle new leads quickly. Prioritize what is overdue."
              : "Leads assigned to you"}
          </p>
        </div>
        <button
          onClick={() => setShowNewLead(true)}
          className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-secondary"
        >
          + New Lead
        </button>
      </div>
      {isCaller ? <CallerInbox listContext={ctx} /> : <LeadsList listContext={ctx} />}
      <NewLeadForm isOpen={showNewLead} onClose={() => setShowNewLead(false)} />
    </>
  );
}