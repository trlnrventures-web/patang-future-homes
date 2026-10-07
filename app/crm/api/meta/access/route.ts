import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { checkLeadAccess, debugToken, REQUIRED_SCOPES } from "@/lib/crm/meta-graph";
import { getConnectionByPage, listConnections, pageTokenFor } from "@/lib/crm/meta-store";

export const dynamic = "force-dynamic";

/**
 * Asks Meta two questions that cannot be answered from inside this codebase:
 * which permissions did Facebook actually grant this token, and may the App read
 * leads for this Page.
 *
 * This exists because "does this need App Review?" is not a property of the code
 * or of the account - it depends on the App's current access level and on the
 * Business Manager's Leads Access Manager configuration, both of which live in
 * Meta's dashboard. Reading them back is the difference between telling the admin
 * what is true and telling them what is usually true.
 */
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pageId = new URL(request.url).searchParams.get("pageId") || "";
  const connections = listConnections().filter((c) => c.status === "connected");
  const target = pageId
    ? getConnectionByPage(pageId)
    : connections[0];

  if (!target) {
    return NextResponse.json({ error: "No Facebook page is connected." }, { status: 400 });
  }

  const token = pageTokenFor(target.pageId);
  if (!token) {
    return NextResponse.json(
      { error: "The Facebook connection needs to be refreshed before it can be checked." },
      { status: 409 }
    );
  }

  const [tokenInfo, leadAccess] = await Promise.all([
    debugToken(token),
    // `has_lead_access` needs a user id. Without one Meta cannot answer, and
    // passing a blank id produces a confusing error rather than a clear "no".
    target.metaUserId
      ? checkLeadAccess(target.pageId, target.metaUserId, token)
      : Promise.resolve({
          canAccess: null,
          appHasPermission: null,
          userHasPermission: null,
          isPageAdmin: null,
          leadAccessManagerEnabled: null,
          failureReason: null,
          failureResolution: null,
          note: "This connection has no recorded Facebook user id, so Meta cannot confirm lead access. Reconnect the page.",
        }),
  ]);

  // Turn the two answers into a single instruction, because "appHasPermission:
  // false" on its own does not tell an admin what to do next.
  let verdict: string;
  let checkFailed = false;
  if (leadAccess.canAccess === true) {
    verdict =
      "Meta confirms this App can read leads for this Page now. No App Review approval is needed for these forms.";
  } else if (tokenInfo.missingScopes.includes("leads_retrieval")) {
    verdict =
      "The App has not been granted leads_retrieval. Leads will not sync for anyone yet, including your own pages - submit the App for review to get it.";
    checkFailed = true;
  } else if (leadAccess.canAccess === false) {
    verdict = `Meta reports lead access is blocked: ${leadAccess.failureReason || "unknown reason"}. ${
      leadAccess.failureResolution || ""
    }`.trim();
  } else {
    verdict = leadAccess.note || "Meta did not return a clear verdict. Check the App's access level in the Meta App Dashboard.";
    checkFailed = true;
  }

  return NextResponse.json({
    pageId: target.pageId,
    pageName: target.pageName,
    requiredScopes: [...REQUIRED_SCOPES],
    token: tokenInfo,
    leadAccess,
    verdict,
    checkFailed,
  });
}
