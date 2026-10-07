import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { authorizeUrl, isAppConfigured, REQUIRED_SCOPES } from "@/lib/crm/meta-graph";
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_SECONDS, signOAuthState } from "@/lib/crm/meta-secret";
import { connectionHealth, listConnections, listMappings, usesDedicatedTokenSecret } from "@/lib/crm/meta-store";
import { getUserName } from "@/lib/crm/audit";

export const dynamic = "force-dynamic";

async function isAdminRequest(): Promise<boolean> {
  const user = await getAuthUser();
  return !!user && isAdmin(user);
}

/**
 * Everything the integration page needs in one request: whether the App is
 * configured on the server, which Pages are connected and how healthy they are,
 * and the saved form configuration.
 *
 * The status of each connection is computed here rather than stored, so a token
 * that has quietly expired shows up as a warning on the page instead of as a run
 * of empty syncs the admin has to notice and interpret.
 */
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connections = listConnections().map((row) => {
    const health = connectionHealth(row);
    return {
      pageId: row.pageId,
      pageName: row.pageName,
      status: health.status,
      needsAttention: health.needsAttention,
      reason: health.reason,
      connectedBy: getUserName(row.connectedByUserId),
      connectedAt: row.createdAt,
      lastVerifiedAt: row.lastVerifiedAt,
      tokenExpiresAt: row.userTokenExpiresAt,
      // Deliberately absent: any form of the access token itself.
    };
  });

  return NextResponse.json({
    appConfigured: isAppConfigured(),
    requiredScopes: [...REQUIRED_SCOPES],
    usesDedicatedTokenSecret: usesDedicatedTokenSecret(),
    connections,
    mappings: listMappings().map((m) => ({
      formId: m.formId,
      pageId: m.pageId,
      formName: m.formName,
      project: m.project,
      callerId: m.callerId,
      smId: m.smId,
      fieldMap: m.fieldMap ?? {},
      syncEnabled: m.syncEnabled,
      lastSyncedAt: m.lastSyncedAt,
      lastError: m.lastError,
    })),
  });
}

/**
 * Starts the OAuth handshake by handing back the Facebook authorization URL and
 * stashing a signed `state` in an HttpOnly cookie.
 *
 * The state cookie - not the CRM session - is what validates the callback. The
 * redirect comes back from facebook.com, which makes it cross-site, and the
 * session cookie is `SameSite=Strict`, so it is not sent on that navigation.
 * The state cookie must therefore be `SameSite=Lax`: `Strict` would withhold it
 * on exactly that cross-site top-level GET, which is the hop we need it for,
 * while `Lax` still keeps it off cross-site subrequests and POSTs. What stops a
 * leaked or replayed callback URL from binding somebody else's Facebook account
 * to this CRM is the state itself - HMAC'd over the admin's id and an expiry,
 * single-use, and burned by the callback however it turns out.
 */
export async function POST() {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isAppConfigured()) {
    return NextResponse.json(
      {
        error:
          "META_APP_ID and META_APP_SECRET are not set on the server, so Facebook login cannot start.",
      },
      { status: 503 }
    );
  }

  const state = signOAuthState({ userId: user.id, issuedAt: Date.now() });

  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, state, {
    path: "/crm/api/meta",
    httpOnly: true,
    sameSite: "lax",
    maxAge: OAUTH_STATE_TTL_SECONDS,
    secure: process.env.NODE_ENV !== "development",
  });

  return NextResponse.json({ authorizeUrl: authorizeUrl(state) });
}
