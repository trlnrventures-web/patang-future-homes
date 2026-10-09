import { NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import { getAuthUser } from "@/lib/crm/auth";
import { listUnacknowledgedAlerts } from "@/lib/crm/lead-alerts";

/**
 * The caller's unread new-lead alerts. Polled by `LeadAlertWatcher`, so it must
 * stay cheap: one indexed read scoped to the signed-in user.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const alerts = listUnacknowledgedAlerts(db, user.id);
  return NextResponse.json({ alerts });
}
