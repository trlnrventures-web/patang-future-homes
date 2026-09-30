import { eq } from "drizzle-orm";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { notifyUser } from "@/lib/crm/push";

type Db = ReturnType<typeof getDb>;

/**
 * Pushes a call alert to whoever owns the lead. Called after the call row is
 * committed and deliberately not awaited by the caller, so a slow push cannot
 * hold up (or fail) the intake request.
 *
 * Never throws: the call is already logged by this point, and a notification
 * that fails to send must not turn into a provider retry that logs it twice.
 */
export async function notifyLeadOwnerOfCall(
  db: Db,
  args: { leadId: number | null; missed: boolean; number?: string | null }
): Promise<void> {
  if (args.leadId == null) return;
  try {
    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, args.leadId)).get();
    if (!lead) return;

    const recipient = lead.assignedCallerId ?? lead.assignedSmId;
    if (!recipient) return;

    const heading = args.missed ? "Missed call" : "Incoming call";
    // The number is included because the first thing the caller needs is who to
    // ring back, and the app may still be loading when the notification lands.
    const from = args.number ? ` from ${args.number}` : "";

    await notifyUser(recipient, {
      title: `${heading} · ${lead.name}`,
      body: `${lead.name}${from} — tap to open the lead.`,
      url: `/crm/leads/${lead.id}`,
      tag: `call-${lead.id}`,
    });
  } catch (error) {
    console.warn("[crm] call alert push failed:", error);
  }
}
