import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { listSyncRuns } from "@/lib/crm/meta-store";

export const dynamic = "force-dynamic";

/**
 * The sync activity log, so an admin can confirm the integration is working
 * without asking anyone to read the server's stdout.
 */
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limitParam = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) ? Math.min(200, Math.max(1, limitParam)) : 40;

  return NextResponse.json({ runs: listSyncRuns(limit) });
}
