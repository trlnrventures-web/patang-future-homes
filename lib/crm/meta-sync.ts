import { getDb } from "./db";
import * as schema from "./schema";
import { notifyUser } from "./push";
import { notifyNewLead } from "./lead-alerts";
import { handleReInquiry } from "./reinquiry";
import { pickRandomCallerId } from "./leads";
import {
  fetchLeadsSince,
  GraphError,
  type GraphLead,
} from "./meta-graph";
import {
  alreadyIngested,
  enabledMappings,
  getConnectionByPage,
  isRealField,
  markConnectionProblem,
  markConnectionVerified,
  markIngested,
  mappingFor,
  mappingIsUsable,
  normalizeMappedValue,
  pageTokenFor,
  recordMappingError,
  recordMappingSync,
  recordSyncRun,
  setSyncEnabled,
  type MappingRow,
} from "./meta-store";

/**
 * The lead poller.
 *
 * Webhooks are the right long-term shape for this, but a `leads_retrieval`
 * webhook only fires for an App that is Live and has been through App Review.
 * Polling the form's leads endpoint works as soon as the App can read them at
 * all, so this is the transport that ships first; a webhook can be layered on
 * later to cut the delay without replacing any of the ingestion below.
 *
 * Every form is handled independently. One form failing - a revoked token, a
 * rate limit, a deleted form - must not stop the other four from syncing, so
 * errors are recorded per form and the loop continues.
 */

export type SyncOutcome = {
  ranAt: string;
  formsSynced: number;
  leadsFetched: number;
  created: number;
  duplicates: number;
  reactivated: number;
  errors: number;
  results: FormSyncResult[];
};

export type FormSyncResult = {
  formId: string;
  formName: string;
  status: "ok" | "warning" | "error" | "skipped";
  leadsFetched: number;
  created: number;
  duplicates: number;
  reactivated: number;
  errors: number;
  message: string;
};

/**
 * Guards against two pollers overlapping - a slow Graph call in one run while a
 * second request starts another would double-count the same leads in the log and
 * race on the cursor. Held in-process, which is enough here: the CRM is a single
 * Node process on one box.
 */
let inFlight = false;

export function syncInProgress(): boolean {
  return inFlight;
}

/** Runs the poll across every enabled form. Safe to call from cron or a button. */
export async function runMetaSync(): Promise<SyncOutcome> {
  const ranAt = new Date().toISOString();

  if (inFlight) {
    return {
      ranAt,
      formsSynced: 0,
      leadsFetched: 0,
      created: 0,
      duplicates: 0,
      reactivated: 0,
      errors: 0,
      results: [],
    };
  }

  inFlight = true;
  const totals = { leadsFetched: 0, created: 0, duplicates: 0, reactivated: 0, errors: 0, formsSynced: 0 };
  const results: FormSyncResult[] = [];

  try {
    const mappings = enabledMappings();

    for (const mapping of mappings) {
      const result = await syncForm(mapping, ranAt);
      results.push(result);
      totals.leadsFetched += result.leadsFetched;
      totals.created += result.created;
      totals.duplicates += result.duplicates;
      totals.reactivated += result.reactivated;
      totals.errors += result.errors;
      if (result.status === "ok" || result.status === "warning") totals.formsSynced += 1;
    }
  } finally {
    inFlight = false;
  }

  return { ranAt, ...totals, results };
}

async function syncForm(mapping: MappingRow, ranAt: string): Promise<FormSyncResult> {
  const base = {
    formId: mapping.formId,
    formName: mapping.formName,
    leadsFetched: 0,
    created: 0,
    duplicates: 0,
    reactivated: 0,
    errors: 0,
  };

  const finish = (
    status: FormSyncResult["status"],
    message: string,
    finishedAt = new Date().toISOString()
  ): FormSyncResult => {
    recordSyncRun({
      formId: mapping.formId,
      formName: mapping.formName,
      status,
      leadsFetched: base.leadsFetched,
      createdCount: base.created,
      duplicates: base.duplicates,
      reactivatedCount: base.reactivated,
      errorCount: base.errors,
      message,
      startedAt: ranAt,
      finishedAt,
    });
    return { ...base, status, message };
  };

  // A form whose mapping is incomplete would create half-populated leads that the
  // team then has to clean up by hand. It is switched off and said out loud
  // instead of quietly importing rubbish.
  const usable = mappingIsUsable(mapping);
  if (!usable.ok) {
    setSyncEnabled(mapping.formId, false);
    recordMappingError(mapping.formId, usable.reason || "Incomplete mapping.");
    return finish("error", `Sync turned off: ${usable.reason}`);
  }

  const token = pageTokenFor(mapping.pageId);
  if (!token) {
    setSyncEnabled(mapping.formId, false);
    const reason = getConnectionByPage(mapping.pageId)?.lastError
      || "Facebook connection is missing or its stored token cannot be read.";
    recordMappingError(mapping.formId, reason);
    return finish("error", "Sync turned off: the Facebook connection needs to be refreshed.");
  }

  // `since` is exclusive of the cursor we stored, minus one second so a lead
  // submitted in the same second as the last one is not skipped. The duplicate
  // guard below is what actually makes re-delivery harmless.
  const sinceUnix = mapping.lastSyncedCursor
    ? Math.floor(new Date(mapping.lastSyncedCursor).getTime() / 1000) - 1
    : null;

  let leads: GraphLead[];
  try {
    leads = await fetchLeadsSince(mapping.formId, token, sinceUnix);
  } catch (error) {
    const ge = error as GraphError;
    return handleFetchError(mapping, base, finish, ge);
  }

  markConnectionVerified(mapping.pageId);
  base.leadsFetched = leads.length;

  if (leads.length === 0) {
    recordMappingSync(mapping.formId, mapping.lastSyncedCursor);
    return finish("ok", "No new leads.");
  }

  // Graph can redeliver: `since` has one-second granularity, and a retried poll
  // returns the same window. Skipping ids already ingested is what keeps the
  // activity log honest and stops a repeat enquiry being written twice.
  const seen = alreadyIngested(leads.map((l) => l.id));
  const fresh = leads.filter((l) => l.id && !seen.has(l.id));

  const fieldMap = mappingFor(mapping);
  let newest = mapping.lastSyncedCursor;

  for (const lead of fresh) {
    if (lead.createdTime && (!newest || lead.createdTime > newest)) newest = lead.createdTime;
    try {
      const outcome = ingestLead(mapping, lead, fieldMap);
      base.created += outcome.created;
      base.duplicates += outcome.duplicate;
      base.reactivated += outcome.reactivated;
      markIngested(lead.id, mapping.formId, outcome.leadId);
    } catch (error) {
      base.errors += 1;
      console.error(`[crm-meta] lead ${lead.id} on form ${mapping.formId} failed:`, error);
    }
  }

  // The cursor advances even when individual leads failed, so one bad submission
  // does not wedge the form into retrying the same page forever. A lead that
  // genuinely failed is visible in the error count on the activity log.
  recordMappingSync(mapping.formId, newest);

  const parts: string[] = [];
  if (base.created) parts.push(`${base.created} new lead${base.created === 1 ? "" : "s"}`);
  if (base.reactivated) parts.push(`${base.reactivated} reactivated`);
  if (base.duplicates) parts.push(`${base.duplicates} duplicate${base.duplicates === 1 ? "" : "s"}`);
  if (base.errors) parts.push(`${base.errors} error${base.errors === 1 ? "" : "s"}`);

  return finish(
    base.errors ? "warning" : "ok",
    parts.length ? parts.join(", ") : "No new leads."
  );
}

/**
 * Turns a Graph failure into a decision: a dead token disables the form and asks
 * the admin to reconnect, a rate limit is recorded and left for the next poll, and
 * anything else is logged without changing the form's state.
 */
function handleFetchError(
  mapping: MappingRow,
  base: { formId: string; formName: string; leadsFetched: number; created: number; duplicates: number; reactivated: number; errors: number },
  finish: (status: FormSyncResult["status"], message: string) => FormSyncResult,
  ge: GraphError
): FormSyncResult {
  if (ge.type === "rate_limit") {
    // Deliberately not an error. Backing off means skipping this cycle; the next
    // poll picks up from the same cursor, so nothing is lost.
    const detail = ge.retryAfterSeconds ? ` Retry after ${ge.retryAfterSeconds}s.` : "";
    recordMappingError(mapping.formId, `Rate limited by Meta.${detail}`);
    return finish("warning", `Rate limited by Meta - will retry on the next poll.${detail}`);
  }

  if (ge.type === "token") {
    setSyncEnabled(mapping.formId, false);
    const reason = "Facebook rejected the stored token. Reconnect the page to resume syncing.";
    markConnectionProblem(mapping.pageId, reason, "needs_refresh");
    recordMappingError(mapping.formId, reason);
    return finish("error", reason);
  }

  if (ge.type === "permission") {
    setSyncEnabled(mapping.formId, false);
    const reason = `Missing Facebook permission: ${ge.message}`;
    recordMappingError(mapping.formId, reason);
    return finish("error", `${reason}. Sync turned off.`);
  }

  if (ge.type === "not_found") {
    setSyncEnabled(mapping.formId, false);
    const reason = "This form no longer exists on the Page. It may have been deleted in Ads Manager.";
    recordMappingError(mapping.formId, reason);
    return finish("error", reason);
  }

  recordMappingError(mapping.formId, ge.message);
  return finish("error", ge.message);
}

/**
 * Creates (or matches) the CRM lead for one Meta submission.
 *
 * Reuses the same `handleReInquiry` path a manually created lead takes, so the
 * duplicate-by-phone rule, the reactivation of a previously lost lead, and the
 * activity trail all behave identically whether a lead arrived from an ad or from
 * the New Lead form. That reuse is the point: two ingestion paths would drift.
 */
function ingestLead(
  mapping: MappingRow,
  lead: GraphLead,
  fieldMap: Record<string, string>
): { created: number; duplicate: number; reactivated: number; leadId: number } {
  const db = getDb();
  const now = new Date().toISOString();

  // A Meta question can only land in one CRM column, so a later question mapped
  // to the same column does not silently overwrite an earlier one.
  const values: Record<string, string> = {};
  for (const [questionKey, crmField] of Object.entries(fieldMap)) {
    if (!isRealField(crmField)) continue;
    const answer = lead.fields[questionKey];
    if (answer == null) continue;
    const normalized = normalizeMappedValue(crmField, answer);
    if (normalized) values[crmField] = normalized;
  }

  // The form's project is pre-set by the admin rather than mapped, and it wins
  // over any question that happened to be mapped to `project`.
  if (mapping.project) values.project = mapping.project;

  const phone = values.phone || "";
  const email = values.email || "";
  const name = values.name || "";
  // `leads.phone` is NOT NULL and the duplicate check keys on it, so a submission
  // with no usable number at all cannot become a lead. Reached only when the admin
  // mapped no phone question and the form collected none.
  const phoneForMatch = phone || (email ? `${email}@no-phone` : "");
  if (!name || !phoneForMatch) {
    throw new Error("Submission has neither a name nor a phone/email to identify it by.");
  }

  // Keeps the raw answers for the team, since an unmapped question is otherwise
  // lost entirely and the caller may be asked about it on the first call.
  const unmapped = Object.entries(lead.fields)
    .filter(([key]) => !isRealField(fieldMap[key]))
    .map(([key, value]) => `${key}: ${value}`);

  const answerLines = Object.entries(values).map(([field, value]) => `${field}: ${value}`);

  // Every Meta form's leads are distributed randomly among the active callers,
  // so enquiries spread across the team instead of piling up on one person. This
  // ignores any caller once stored on the mapping, which is what "all forms
  // random" requires.
  const resolvedCallerId = pickRandomCallerId(db);

  const result = handleReInquiry({
    db,
    phone: phoneForMatch,
    project: mapping.project,
    message: answerLines.join(" | ") || lead.id,
    source: "meta",
    insertLead: () =>
      db
        .insert(schema.leads)
        .values({
          name,
          phone: phoneForMatch,
          secondaryPhone: values.secondary_phone ?? null,
          whatsappNumber: phoneForMatch,
          email: email || null,
          source: "meta",
          formName: mapping.formName,
          originalProject: mapping.project,
          location: values.location ?? null,
          sublocation: values.sublocation ?? null,
          budget: values.budget ?? null,
          bhk: values.bhk ?? null,
          // These two are enum columns, and an ad answer is free text: it only
          // lands here if it happens to match a legal value. Anything else is left
          // null rather than written, because a value the schema does not allow
          // would either be rejected or corrupt a column the rest of the CRM
          // filters on.
          purpose: enumValue(values.purpose, ["self_use", "investment", "both"] as const),
          timeline: enumValue(values.timeline, [
            "immediate",
            "1_3_months",
            "3_6_months",
            "6_plus_months",
            "exploring",
          ] as const),
          preferredProject: values.preferred_project ?? null,
          familyRequirements: values.family_requirements ?? null,
          otherPreferences: values.other_preferences ?? null,
          originalMessage: values.original_message ?? null,
          // Ad-level attribution. Only filled when the token carries
          // `ads_management`; the poll degrades to nulls rather than dropping
          // the lead when it does not. `campaignName` is deliberately not set
          // from these ids - it is matched against `campaigns.name` for
          // attribution, and a raw Meta id there would never line up.
          campaignId: lead.campaignId,
          adSetId: lead.adSetId,
          adId: lead.adId,
          campaignName: values.campaign_name ?? null,
          notes: [
            `Synced from Facebook form "${mapping.formName}".`,
            unmapped.length ? `\nUnmapped answers: ${unmapped.join("; ")}` : "",
          ]
            .join("")
            .trim(),
          status: "new",
          stageChangedAt: now,
          // Randomly assigned across active callers (see above); the SM still
          // comes from the form's configuration.
          assignedCallerId: resolvedCallerId,
          assignedSmId: mapping.smId,
          assignedAt: resolvedCallerId || mapping.smId ? now : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get(),
  });

  const leadRow = result.lead;

  if (result.kind === "new") {
    db.insert(schema.activities)
      .values({
        leadId: leadRow.id,
        userId: resolvedCallerId || mapping.smId || leadRow.assignedCallerId || 1,
        type: "note",
        notes: `Lead created from Facebook form "${mapping.formName}".`,
        createdAt: now,
      })
      .run();
  }

  void notifyAssigned(resolvedCallerId, mapping, leadRow.id, name, mapping.formName);

  if (result.kind === "new" || result.kind === "reactivated") {
    notifyNewLead(resolvedCallerId || leadRow.assignedCallerId, leadRow, { kind: result.kind });
  }

  return {
    created: result.kind === "new" ? 1 : 0,
    duplicate: result.kind === "duplicate" ? 1 : 0,
    reactivated: result.kind === "reactivated" ? 1 : 0,
    leadId: leadRow.id,
  };
}

/**
 * Keeps a free-text ad answer only when it is one of the values the column
 * actually allows, matching case-insensitively against the stored form of the
 * value. Returns null otherwise, so a column with a fixed set of values is never
 * written with something the rest of the CRM would not recognise.
 */
function enumValue<T extends string>(raw: string | undefined, allowed: readonly T[]): T | null {
  if (!raw) return null;
  const needle = raw.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === needle) ?? null;
}

/**
 * Tells the assigned people a lead arrived. Fire-and-forget: the lead is already
 * committed, and `notifyUser` never throws, so a push failure cannot roll back an
 * import.
 */
function notifyAssigned(
  assignedCallerId: number | null,
  mapping: MappingRow,
  leadId: number,
  name: string,
  formName: string
): void {
  const recipients = [assignedCallerId, mapping.smId].filter((v): v is number => v != null);
  if (recipients.length === 0) return;

  for (const userId of recipients) {
    notifyUser(userId, {
      title: "New Meta lead",
      body: `${name || "New enquiry"} - ${formName}`,
      url: `/crm/leads/${leadId}`,
      tag: `meta-lead-${leadId}`,
      requireInteraction: true,
    }).catch(() => {});
  }
}

/**
 * A one-off run for a single form, used by the "Sync now" button. Kept separate
 * from the scheduled run so an admin can prove a form works without waiting for
 * the next poll, and without a global lock that would make the button look dead.
 */
export async function runSingleFormSync(formId: string): Promise<FormSyncResult | null> {
  const mapping = enabledMappings().find((m) => m.formId === formId);
  if (!mapping) return null;
  return syncForm(mapping, new Date().toISOString());
}
