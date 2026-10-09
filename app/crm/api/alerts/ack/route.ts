import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import { getAuthUser } from "@/lib/crm/auth";
import { acknowledgeAlerts, acknowledgeAllAlerts } from "@/lib/crm/lead-alerts";

/** Acknowledge one, several, or every unread alert for the signed-in user. */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { ids?: unknown; all?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getDb();
  if (body.all === true) {
    return NextResponse.json({ ok: true, changed: acknowledgeAllAlerts(db, user.id) });
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((i) => Number.isFinite(Number(i))).map((i) => Number(i)))]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No alerts selected" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, changed: acknowledgeAlerts(db, user.id, ids) });
}
