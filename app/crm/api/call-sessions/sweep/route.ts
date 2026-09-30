import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/crm/db";
import { closeStaleCallSessions } from "@/lib/crm/call-sessions";

/**
 * The sweep endpoint exists so a cron or a Cloudflare Cron Trigger can close
 * forgotten attempts on a schedule. The same sweep already runs lazily when
 * the caller dashboard loads, so this is the belt-and-braces path, not the only
 * one — a caller who never opens the dashboard still gets their call logged.
 *
 * Authenticated by the shared call-event secret, since that is the credential
 * an external scheduler already holds.
 */
export async function POST(request: Request) {
  const secret = process.env.CRM_CALL_EVENTS_SECRET || "";
  if (!secret) {
    return Response.json({ error: "Not configured" }, { status: 503 });
  }
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  // Constant-time compare, matching the webhook route: a plain `!==` on a
  // secret is enough to leak it one character at a time.
  const expected = Buffer.from(secret, "utf8");
  const given = Buffer.from(provided, "utf8");
  const ok = expected.length === given.length && timingSafeEqual(expected, given);
  if (!ok) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const closed = closeStaleCallSessions(getDb());
  return Response.json({ ok: true, closed });
}
