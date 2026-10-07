import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./schema";
import { decryptSecret, encryptSecret, hasDedicatedTokenSecret } from "./meta-secret";
import { STANDARD_FIELD_SUGGESTIONS } from "./meta-graph";
import { normalizeEmail, normalizePhone } from "./identifiers";

/**
 * The CRM lead columns a Meta question can be mapped onto.
 *
 * Keyed by the `leads` column name, so the sync job can apply a map without a
 * second lookup table, and labelled the way the mapping screen shows them.
 * `ignore` is not a column: it is the escape hatch for a question the CRM has
 * nowhere to put.
 */
export const MAPPABLE_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "budget", label: "Budget" },
  { key: "bhk", label: "BHK" },
  { key: "location", label: "Location" },
  { key: "project", label: "Project" },
  { key: "sublocation", label: "Sub-location" },
  { key: "purpose", label: "Purpose" },
  { key: "timeline", label: "Timeline" },
  { key: "preferred_project", label: "Preferred project" },
  { key: "family_requirements", label: "Family requirements" },
  { key: "other_preferences", label: "Other preferences" },
  { key: "original_message", label: "Message" },
  { key: "campaign_name", label: "Campaign" },
  { key: "notes", label: "Notes" },
];

export const IGNORE = "ignore";

const FIELD_KEYS = new Set(MAPPABLE_FIELDS.map((f) => f.key));

/** True when the value names a real CRM column, i.e. not blank and not `ignore`. */
export function isRealField(value: string | null | undefined): boolean {
  return !!value && value !== IGNORE && FIELD_KEYS.has(value);
}

/**
 * Pre-fills a form's mapping from Meta's standard question keys, so an admin only
 * has to make decisions about the custom questions. Anything the API does not
 * recognise is left unmapped rather than guessed at.
 */
export function suggestFieldMap(questionKeys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of questionKeys) {
    const suggested = STANDARD_FIELD_SUGGESTIONS[key];
    if (suggested) out[key] = suggested;
  }
  return out;
}

// ---------------------------------------------------------------- connections

export type ConnectionRow = typeof schema.metaConnections.$inferSelect;

export function upsertConnection(input: {
  pageId: string;
  pageName: string;
  connectedByUserId: number;
  metaUserId: string | null;
  userToken: string;
  pageToken: string;
  userTokenExpiresAt: string | null;
}): ConnectionRow {
  const db = getDb();
  const now = new Date().toISOString();
  const encryptedUser = encryptSecret(input.userToken);
  const encryptedPage = encryptSecret(input.pageToken);

  const existing = db
    .select()
    .from(schema.metaConnections)
    .where(eq(schema.metaConnections.pageId, input.pageId))
    .get();

  if (existing) {
    db.update(schema.metaConnections)
      .set({
        pageName: input.pageName,
        connectedByUserId: input.connectedByUserId,
        metaUserId: input.metaUserId,
        encryptedUserToken: encryptedUser,
        encryptedPageToken: encryptedPage,
        userTokenExpiresAt: input.userTokenExpiresAt,
        status: "connected",
        lastVerifiedAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(schema.metaConnections.id, existing.id))
      .run();
  } else {
    db.insert(schema.metaConnections)
      .values({
        pageId: input.pageId,
        pageName: input.pageName,
        connectedByUserId: input.connectedByUserId,
        metaUserId: input.metaUserId,
        encryptedUserToken: encryptedUser,
        encryptedPageToken: encryptedPage,
        userTokenExpiresAt: input.userTokenExpiresAt,
        status: "connected",
        lastVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return db
    .select()
    .from(schema.metaConnections)
    .where(eq(schema.metaConnections.pageId, input.pageId))
    .get()!;
}

/**
 * Destroys the stored tokens in place and marks the row disconnected.
 *
 * Deleting the row instead would be tidier, but it would also erase which Page
 * was connected and by whom - the two facts an admin needs when they ask "did we
 * ever link this?" after the fact. The secrets are what must go, and clearing
 * the columns removes them as surely as a DELETE would.
 */
export function disconnectConnection(pageId: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.update(schema.metaConnections)
    .set({
      encryptedUserToken: null,
      encryptedPageToken: null,
      status: "disconnected",
      lastError: null,
      updatedAt: now,
    })
    .where(eq(schema.metaConnections.pageId, pageId))
    .run();

  // No token means no polling, so the forms it fed are switched off rather than
  // left ticking over and failing on every run.
  db.update(schema.metaFormMappings)
    .set({ syncEnabled: false, updatedAt: now })
    .where(eq(schema.metaFormMappings.pageId, pageId))
    .run();
}

export function listConnections(): ConnectionRow[] {
  return getDb().select().from(schema.metaConnections).all();
}

export function getConnectionByPage(pageId: string): ConnectionRow | undefined {
  return getDb().select().from(schema.metaConnections).where(eq(schema.metaConnections.pageId, pageId)).get();
}

/**
 * The decrypted Page token, or null if the connection is gone, disconnected, or
 * encrypted under a secret this server no longer has. The sync job treats null as
 * "needs refresh" and says so, rather than calling Graph with an empty token.
 */
export function pageTokenFor(pageId: string): string | null {
  const row = getConnectionByPage(pageId);
  if (!row || row.status === "disconnected") return null;
  return decryptSecret(row.encryptedPageToken);
}

export function userTokenFor(pageId: string): string | null {
  const row = getConnectionByPage(pageId);
  if (!row || row.status === "disconnected") return null;
  return decryptSecret(row.encryptedUserToken);
}

export function markConnectionProblem(pageId: string, error: string, status: ConnectionRow["status"]): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.update(schema.metaConnections)
    .set({ lastError: error.slice(0, 500), status, updatedAt: now })
    .where(eq(schema.metaConnections.pageId, pageId))
    .run();
}

export function markConnectionVerified(pageId: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.update(schema.metaConnections)
    .set({ status: "connected", lastVerifiedAt: now, lastError: null, updatedAt: now })
    .where(eq(schema.metaConnections.pageId, pageId))
    .run();
}

export type ConnectionHealth = {
  status: "connected" | "needs_refresh" | "disconnected";
  needsAttention: boolean;
  reason: string | null;
};

/**
 * What the banner on the integration page is based on. A dead token is called out
 * here rather than surfacing as a silent run of empty syncs, which is the failure
 * mode the admin would otherwise have no way to see.
 */
export function connectionHealth(row: ConnectionRow): ConnectionHealth {
  if (row.status === "disconnected" || !row.encryptedPageToken) {
    return { status: "disconnected", needsAttention: true, reason: "Not connected." };
  }
  if (row.status === "needs_refresh") {
    return {
      status: "needs_refresh",
      needsAttention: true,
      reason: row.lastError || "Facebook rejected the stored token.",
    };
  }
  if (row.lastError) {
    return { status: "connected", needsAttention: true, reason: row.lastError };
  }
  if (row.userTokenExpiresAt && new Date(row.userTokenExpiresAt).getTime() - Date.now() < 7 * 24 * 3600 * 1000) {
    return {
      status: "connected",
      needsAttention: true,
      reason: "The Facebook user token expires within 7 days. Reconnect to renew it.",
    };
  }
  return { status: "connected", needsAttention: false, reason: null };
}

export function usesDedicatedTokenSecret(): boolean {
  return hasDedicatedTokenSecret();
}

// ------------------------------------------------------------------- mappings

export type MappingRow = typeof schema.metaFormMappings.$inferSelect;

export function listMappings(): MappingRow[] {
  return getDb().select().from(schema.metaFormMappings).all();
}

export function getMapping(formId: string): MappingRow | undefined {
  return getDb().select().from(schema.metaFormMappings).where(eq(schema.metaFormMappings.formId, formId)).get();
}

export function enabledMappings(): MappingRow[] {
  return getDb().select().from(schema.metaFormMappings).where(eq(schema.metaFormMappings.syncEnabled, true)).all();
}

export type UpsertMappingInput = {
  formId: string;
  pageId: string;
  formName: string;
  project?: string | null;
  callerId?: number | null;
  smId?: number | null;
  fieldMap?: Record<string, string>;
  syncEnabled?: boolean;
};

/**
 * Saves a form's configuration. Assignment ids are checked against real users of
 * the right role, because a caller id that has since been deactivated would
 * silently send every future lead to nobody.
 */
export function upsertMapping(input: UpsertMappingInput): { mapping: MappingRow; warning: string | null } {
  const db = getDb();
  const now = new Date().toISOString();
  const warning: string[] = [];

  const callerId = input.callerId ?? null;
  const smId = input.smId ?? null;
  if (callerId != null && !userHasRole(callerId, "caller")) warning.push("The selected Caller is not an active Caller user.");
  if (smId != null && !userHasRole(smId, "sales_manager")) warning.push("The selected Sales Manager is not an active Sales Manager user.");

  // Only real columns and the explicit `ignore` are persisted, so a hand-crafted
  // request cannot point the sync job at an arbitrary column name.
  const fieldMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.fieldMap || {})) {
    if (typeof value === "string" && (value === IGNORE || FIELD_KEYS.has(value))) fieldMap[key] = value;
  }

  const existing = getMapping(input.formId);

  if (existing) {
    db.update(schema.metaFormMappings)
      .set({
        pageId: input.pageId,
        formName: input.formName,
        project: input.project ?? existing.project,
        callerId,
        smId,
        fieldMap,
        ...(input.syncEnabled === undefined ? {} : { syncEnabled: input.syncEnabled }),
        updatedAt: now,
      })
      .where(eq(schema.metaFormMappings.id, existing.id))
      .run();
  } else {
    db.insert(schema.metaFormMappings)
      .values({
        formId: input.formId,
        pageId: input.pageId,
        formName: input.formName,
        project: input.project ?? null,
        callerId,
        smId,
        fieldMap,
        syncEnabled: input.syncEnabled ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return { mapping: getMapping(input.formId)!, warning: warning.length ? warning.join(" ") : null };
}

function userHasRole(userId: number, role: string): boolean {
  const db = getDb();
  const row = db
    .select({ role: schema.users.role, active: schema.users.active })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  return !!row && row.active && row.role === role;
}

export function setSyncEnabled(formId: string, enabled: boolean): void {
  const db = getDb();
  const now = new Date().toISOString();
  // Turning sync back on clears the error that stopped it, so a form that was
  // fixed is not still shown as broken.
  db.update(schema.metaFormMappings)
    .set(enabled ? { syncEnabled: true, lastError: null, updatedAt: now } : { syncEnabled: false, updatedAt: now })
    .where(eq(schema.metaFormMappings.formId, formId))
    .run();
}

export function recordMappingSync(formId: string, cursor: string | null): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.update(schema.metaFormMappings)
    .set({ lastSyncedAt: now, lastSyncedCursor: cursor, lastError: null, updatedAt: now })
    .where(eq(schema.metaFormMappings.formId, formId))
    .run();
}

export function recordMappingError(formId: string, error: string): void {
  const db = getDb();
  db.update(schema.metaFormMappings)
    .set({ lastError: error.slice(0, 500), updatedAt: new Date().toISOString() })
    .where(eq(schema.metaFormMappings.formId, formId))
    .run();
}

// ----------------------------------------------------------------- sync runs

export function recordSyncRun(input: {
  formId: string | null;
  formName: string;
  status: "ok" | "warning" | "error" | "skipped";
  leadsFetched?: number;
  createdCount?: number;
  duplicates?: number;
  reactivatedCount?: number;
  errorCount?: number;
  message?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}): void {
  const db = getDb();
  db.insert(schema.metaSyncRuns)
    .values({
      formId: input.formId,
      formName: input.formName,
      status: input.status,
      leadsFetched: input.leadsFetched ?? 0,
      createdCount: input.createdCount ?? 0,
      duplicates: input.duplicates ?? 0,
      reactivatedCount: input.reactivatedCount ?? 0,
      errorCount: input.errorCount ?? 0,
      message: input.message ?? null,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt ?? new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })
    .run();
  trimRuns();
}

export function listSyncRuns(limit = 40) {
  return getDb().select().from(schema.metaSyncRuns).orderBy(desc(schema.metaSyncRuns.id)).limit(limit).all();
}

/**
 * Old runs are trimmed on write rather than by a separate cleanup job, so the
 * activity log cannot grow without bound and there is no second thing to remember
 * to schedule.
 */
const RUN_RETENTION = 400;

function trimRuns(): void {
  const db = getDb();
  const total = db.select({ id: schema.metaSyncRuns.id }).from(schema.metaSyncRuns).all().length;
  if (total <= RUN_RETENTION) return;
  // Delete the oldest (total - retention) rows. A subquery keeps the newest
  // `retention` ids in memory rather than shipping a thousand-parameter IN list.
  const doomed = db
    .select({ id: schema.metaSyncRuns.id })
    .from(schema.metaSyncRuns)
    .orderBy(schema.metaSyncRuns.id)
    .limit(total - RUN_RETENTION)
    .all()
    .map((r) => r.id);
  for (const id of doomed) {
    db.delete(schema.metaSyncRuns).where(eq(schema.metaSyncRuns.id, id)).run();
  }
}
// ------------------------------------------------------------- ingested leads

export function alreadyIngested(leadgenIds: string[]): Set<string> {
  const db = getDb();
  if (leadgenIds.length === 0) return new Set();
  const rows = db
    .select({ leadgenId: schema.metaIngestedLeads.leadgenId })
    .from(schema.metaIngestedLeads)
    .where(inArray(schema.metaIngestedLeads.leadgenId, leadgenIds))
    .all();
  return new Set(rows.map((r) => r.leadgenId));
}

export function markIngested(leadgenId: string, formId: string, leadId: number | null): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.insert(schema.metaIngestedLeads)
    .values({ leadgenId, formId, leadId, ingestedAt: now, createdAt: now })
    .onConflictDoNothing({ target: schema.metaIngestedLeads.leadgenId })
    .run();
}
// ------------------------------------------------------------- value helpers

/**
 * Turns a question key/answer pair into a clean CRM value.
 *
 * Phone goes through the shared `normalizePhone` so an ad collecting
 * "+91 98237 27172" and one collecting "09823727172" land on the same lead - the
 * duplicate check compares digits, so an unnormalised number would defeat it.
 */
export function normalizeMappedValue(field: string, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (field === "phone") return normalizePhone(trimmed);
  if (field === "email") return normalizeEmail(trimmed);
  if (field === "bhk") {
    // "3" and "3 BHK" both mean three bedrooms to anyone reading the lead.
    const n = trimmed.replace(/\s*BHK\s*$/i, "").trim();
    return /^\d+$/.test(n) ? `${n} BHK` : trimmed;
  }
  return trimmed;
}

export function mappingFor(mapping: MappingRow): Record<string, string> {
  return mapping.fieldMap && typeof mapping.fieldMap === "object" ? (mapping.fieldMap as Record<string, string>) : {};
}

/** True when the mapping is complete enough to create a lead from. */
export function mappingIsUsable(mapping: MappingRow): { ok: boolean; reason: string | null } {
  if (!mapping.callerId) return { ok: false, reason: "No Caller assigned to this form." };
  const map = mappingFor(mapping);
  const mapped = Object.values(map);
  if (!mapped.some((v) => v === "name")) return { ok: false, reason: "No Meta field is mapped to Name." };
  if (!mapped.includes("phone") && !mapped.includes("email")) {
    return { ok: false, reason: "Map a field to Phone (strongly recommended) or Email so leads can be matched." };
  }
  return { ok: true, reason: null };
}
