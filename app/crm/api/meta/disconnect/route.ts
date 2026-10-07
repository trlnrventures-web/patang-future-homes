import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { disconnectConnection, getConnectionByPage } from "@/lib/crm/meta-store";
import { writeAuditLog } from "@/lib/crm/audit";

export const dynamic = "force-dynamic";

/**
 * Disconnects a Page. The stored tokens are destroyed and every form on that Page
 * stops syncing, because a form with no token would otherwise fail on every
 * scheduled run and fill the activity log with noise.
 */
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { pageId?: string };
  try {
    body = (await request.json()) as { pageId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const pageId = String(body.pageId || "").trim();
  if (!pageId) {
    return NextResponse.json({ error: "pageId is required." }, { status: 400 });
  }

  const connection = getConnectionByPage(pageId);
  if (!connection) {
    return NextResponse.json({ error: "That page is not connected." }, { status: 404 });
  }

  disconnectConnection(pageId);

  writeAuditLog({
    category: "settings",
    action: "meta_disconnected",
    actorUserId: user.id,
    entityType: "meta_connection",
    entityId: pageId,
    summary: `${user.name} disconnected the Facebook page "${connection.pageName}". Stored tokens were destroyed and its forms stopped syncing.`,
    details: { pageId, pageName: connection.pageName },
  });

  return NextResponse.json({ ok: true });
}
