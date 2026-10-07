import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { mappingIsUsable, setSyncEnabled, upsertMapping } from "@/lib/crm/meta-store";
import { writeAuditLog } from "@/lib/crm/audit";
import { getUserName } from "@/lib/crm/audit";

export const dynamic = "force-dynamic";

/**
 * Saves one form's configuration: project, assignment, and the question-to-field
 * map. This is the write behind the mapping screen.
 */
export async function PATCH(request: Request) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const formId = String(body.formId || "").trim();
  const pageId = String(body.pageId || "").trim();
  const formName = String(body.formName || "").trim();

  if (!formId || !pageId || !formName) {
    return NextResponse.json({ error: "formId, pageId and formName are required." }, { status: 400 });
  }

  // Only these three are coerced from arbitrary input; everything else in the
  // request is ignored so a hand-crafted body cannot set a cursor or a token.
  const project = body.project == null ? null : String(body.project).slice(0, 120);
  const callerId = toId(body.callerId);
  const smId = toId(body.smId);
  const fieldMap =
    body.fieldMap && typeof body.fieldMap === "object" && !Array.isArray(body.fieldMap)
      ? (body.fieldMap as Record<string, string>)
      : {};
  const syncEnabled = body.syncEnabled === true;

  const { mapping, warning } = upsertMapping({
    formId,
    pageId,
    formName,
    project,
    callerId,
    smId,
    fieldMap,
    syncEnabled,
  });

  const usable = mappingIsUsable(mapping);

  // Enabling sync on a form that cannot produce a usable lead is the one mistake
  // worth blocking, because it imports half-empty records the team has to clean
  // up. Saving a half-finished mapping for later is always allowed.
  if (syncEnabled && !usable.ok) {
    setSyncEnabled(formId, false);
    return NextResponse.json(
      {
        error: `Saved, but sync was not turned on: ${usable.reason}`,
        saved: true,
        syncEnabled: false,
        warning,
      },
      { status: 400 }
    );
  }

  writeAuditLog({
    category: "settings",
    action: "meta_form_mapping_saved",
    actorUserId: user.id,
    targetUserId: callerId ?? undefined,
    entityType: "meta_form",
    entityId: formId,
    summary: `${user.name} saved the mapping for Facebook form "${formName}"${
      syncEnabled ? " and enabled sync" : ""
    }.`,
    details: {
      formId,
      pageId,
      project,
      callerId,
      callerName: getUserName(callerId),
      smId,
      smName: getUserName(smId),
      syncEnabled,
      mappedFields: fieldMap,
    },
  });

  return NextResponse.json({
    ok: true,
    syncEnabled: mapping.syncEnabled,
    warning,
    mapping: {
      formId: mapping.formId,
      pageId: mapping.pageId,
      formName: mapping.formName,
      project: mapping.project,
      callerId: mapping.callerId,
      smId: mapping.smId,
      fieldMap: mapping.fieldMap ?? {},
      syncEnabled: mapping.syncEnabled,
      lastSyncedAt: mapping.lastSyncedAt,
      lastError: mapping.lastError,
    },
  });
}

function toId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
