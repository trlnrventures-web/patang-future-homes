import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from "@/lib/crm/leads";
import { Badge } from "@/components/crm/ui";

export const metadata: Metadata = {
  title: { absolute: "Messages | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  const db = getDb();
  let leads = db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt)).all();

  if (user.role === "caller") {
    leads = leads.filter((l) => l.assignedCallerId === user.id);
  } else if (user.role === "sales_manager") {
    leads = leads.filter((l) => l.assignedSmId === user.id);
  }

  // Only leads actually worth messaging
  const candidates = leads.filter((l) => l.status !== "invalid" && l.status !== "dnc");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Message Center</h1>
        <p className="mt-0.5 text-sm text-muted">
          Ready-to-send Hinglish messages for aapke leads
        </p>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <p>
          Flow: Message generate karein → <b>Copy</b> → <b>WhatsApp</b> kholen → manually paste & send.
        </p>
        <p className="mt-1 text-xs text-emerald-700">
          CRM sirf generate/copy/wa-open track karta hai. Normal WhatsApp send confirmation CRM ko nahi milti.
        </p>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <p className="text-sm font-semibold text-navy">Koi lead nahi mila</p>
          <p className="mt-1 text-xs text-muted">
            Aapko assign leads yahan message center ke saath dikhenge.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((lead) => (
            <div
              key={lead.id}
              className="rounded-2xl border border-border bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-navy">
                      {lead.name}
                    </h3>
                    <Badge
                      color={LEAD_STATUS_COLORS[lead.status] || "bg-gray-100 text-gray-700"}
                    >
                      {LEAD_STATUS_LABELS[lead.status] || lead.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {lead.phone}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted">
                    {lead.bhk && <span>🏠 {lead.bhk} BHK</span>}
                    {(lead.budget || (lead.budgetMin && lead.budgetMax)) && (
                      <span>
                        💰 {lead.budget || `₹${lead.budgetMin}–${lead.budgetMax}L`}
                      </span>
                    )}
                    {lead.originalProject && (
                      <span>📍 {lead.originalProject}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/crm/leads/${lead.id}#message-center`}
                  className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-center text-xs font-bold text-white"
                >
                  Open Message Center →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

