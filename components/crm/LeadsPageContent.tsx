"use client";

import { useState } from "react";
import CallerInbox from "./CallerInbox";
import LeadsList from "./LeadsList";
import NewLeadForm from "./NewLeadForm";

export default function LeadsPageContent({ role = "caller" }: { role?: string }) {
  const [showNewLead, setShowNewLead] = useState(false);
  const isCaller = role === "caller";

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
      {isCaller ? <CallerInbox /> : <LeadsList />}
      <NewLeadForm isOpen={showNewLead} onClose={() => setShowNewLead(false)} />
    </>
  );
}