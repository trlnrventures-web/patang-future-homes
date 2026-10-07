import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import {
  checkLeadAccess,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  GraphError,
  listManagedPages,
} from "@/lib/crm/meta-graph";
import { OAUTH_STATE_COOKIE, verifyOAuthState } from "@/lib/crm/meta-secret";
import { upsertConnection } from "@/lib/crm/meta-store";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { writeAuditLog, getUserName } from "@/lib/crm/audit";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect target. Facebook sends the browser here, so this has to work as
 * a plain page - it returns a tiny HTML document that tells the opener window the
 * connection is done and closes itself, rather than trying to render inside the
 * CRM layout with no session.
 *
 * It is reachable without a CRM session on purpose. The redirect is cross-site and
 * the session cookie is `SameSite=Strict`, so the browser does not send it, and
 * demanding one here would make the handshake impossible. The signed `state` -
 * issued by an authenticated admin, tied to their user id, and single-use - is
 * what authorises this instead.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_message") || url.searchParams.get("error");

  const jar = await cookies();
  const expected = jar.get(OAUTH_STATE_COOKIE)?.value;
  // Burn the cookie whatever the outcome, so a captured callback URL cannot be
  // replayed even if the first attempt failed for an unrelated reason.
  jar.delete(OAUTH_STATE_COOKIE);

  if (oauthError) {
    return popupPage(`Facebook did not grant access: ${oauthError}`, false);
  }

  if (!code || !state) {
    return popupPage("Facebook returned an incomplete response. Try connecting again.", false);
  }

  if (!expected || state !== expected) {
    return popupPage("This connection request could not be verified. Start again from the CRM.", false);
  }

  const userId = verifyOAuthState(state);
  if (userId == null) {
    return popupPage("That connection request has expired. Start again from the CRM.", false);
  }

  // The admin must still exist and still be allowed to do this: a session can be
  // revoked between starting the popup and returning from it.
  const db = getDb();
  const admin = db
    .select({ id: schema.users.id, role: schema.users.role, active: schema.users.active })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!admin || !admin.active || (admin.role !== "admin" && admin.role !== "sales_head")) {
    return popupPage("That account can no longer manage integrations.", false);
  }

  try {
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.accessToken);
    const { pages, metaUserId } = await listManagedPages(longLived.accessToken);

    if (pages.length === 0) {
      return popupPage(
        "That Facebook account does not administer any Page. Connect using the account that owns the Patang Pages.",
        false
      );
    }

    const expiresAt = longLived.expiresInSeconds
      ? new Date(Date.now() + longLived.expiresInSeconds * 1000).toISOString()
      : null;

    // Every Page the account administers is connected. An agency running several
    // property Pages does not want to hand-pick one at a time, and each gets its
    // own row so a single page can be disconnected without touching the rest.
    const connected: string[] = [];
    for (const page of pages) {
      upsertConnection({
        pageId: page.id,
        pageName: page.name,
        connectedByUserId: userId,
        metaUserId,
        userToken: longLived.accessToken,
        pageToken: page.accessToken,
        userTokenExpiresAt: expiresAt,
      });
      connected.push(page.name);
    }

    // Answers the App Review question with data rather than a guess, and is
    // recorded per page so the integration page can show it later.
    const access = await checkLeadAccess(pages[0].id, metaUserId || "", pages[0].accessToken);

    writeAuditLog({
      category: "settings",
      action: "meta_connected",
      actorUserId: userId,
      entityType: "meta_connection",
      entityId: pages.map((p) => p.id).join(","),
      summary: `${getUserName(userId) || "An admin"} connected ${pages.length} Facebook page(s): ${connected.join(", ")}.`,
      details: {
        pages: pages.map((p) => ({ id: p.id, name: p.name, tasks: p.tasks })),
        leadAccess: access,
      },
    });

    const verdict =
      access.canAccess === true
        ? "Meta confirms this App can read leads for the Page."
        : access.note ||
          (access.canAccess === false
            ? `Meta reports leads are not readable yet: ${access.failureReason || "permission not granted"}${
                access.failureResolution ? ` - ${access.failureResolution}` : ""
              }`
            : "Lead access could not be confirmed yet - use 'Check access' on the integration page.");

    return popupPage(
      `Connected ${connected.length === 1 ? connected[0] : `${connected.length} pages`}. ${verdict}`,
      true
    );
  } catch (error) {
    const message =
      error instanceof GraphError
        ? error.message
        : "Something went wrong completing the Facebook connection.";
    console.error("[crm-meta] oauth callback failed:", error);
    return popupPage(message, false);
  }
}

// Kept as a helper so the WHERE clause reads the same as the rest of the codebase.
function popupPage(message: string, ok: boolean): NextResponse {
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>Meta connection</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center">
<p style="font-weight:600;color:${ok ? "#1a7f37" : "#b42318"}">${escapeHtml(message)}</p>
<p style="color:#666;font-size:13px">You can close this window.</p>
<script>
  try { window.opener && window.opener.postMessage({ source: "crm-meta", ok: ${ok} }, window.location.origin); } catch (e) {}
  setTimeout(function () { window.close(); }, ${ok ? 900 : 4000});
</script>
</body></html>`;

  return new NextResponse(body, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
