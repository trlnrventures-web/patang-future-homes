import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { runMetaSync, runSingleFormSync, syncInProgress } from "@/lib/crm/meta-sync";

export const dynamic = "force-dynamic";

/**
 * Runs the lead poll. Two callers are allowed:
 *
 *  - an admin clicking "Sync now", authenticated by their CRM session, and
 *  - a cron on the server, which holds no session and proves itself with a bearer
 *    token.
 *
 * Both reach the same function, so what an admin tests by hand and what runs every
 * five minutes cannot drift apart.
 */
export async function POST(request: Request) {
  const admin = await adminFromSession();
  if (!admin && !bearerIsValid(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The cron is the reason this endpoint sits in the proxy's public list, so it
  // authenticates itself here. An unset secret accepts nothing rather than
  // defaulting to open.
  const secret = process.env.CRM_META_SYNC_SECRET?.trim();
  if (!admin && !secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  if (syncInProgress()) {
    return NextResponse.json({ skipped: true, reason: "A sync is already running." });
  }

  let formId: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as { formId?: string };
    formId = body.formId ? String(body.formId) : null;
  } catch {
    // A cron GET-style call with no body is fine; it just means "sync everything".
  }

  try {
    if (formId) {
      const result = await runSingleFormSync(formId);
      if (!result) {
        return NextResponse.json({ error: "That form is not enabled for syncing." }, { status: 400 });
      }
      return NextResponse.json({ ok: true, results: [result], created: result.created, duplicates: result.duplicates });
    }

    const summary = await runMetaSync();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[crm-meta] sync failed:", error);
    return NextResponse.json({ error: "The sync could not be completed." }, { status: 500 });
  }
}

async function adminFromSession() {
  const user = await getAuthUser();
  return user && isAdmin(user) ? user : null;
}

/**
 * Constant-time comparison, matching the call-event webhook. A plain `!==` on a
 * secret is enough to leak it one character at a time to anyone who can measure
 * response times.
 */
function bearerIsValid(request: Request): boolean {
  const secret = process.env.CRM_META_SYNC_SECRET?.trim();
  if (!secret) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expected = Buffer.from(secret, "utf8");
  const given = Buffer.from(provided, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
