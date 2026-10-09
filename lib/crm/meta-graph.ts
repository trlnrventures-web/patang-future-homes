/**
 * Meta Graph API client for the lead-ads integration.
 *
 * Only the calls this feature needs, with the two things that actually bite
 * handled deliberately: a structured error carrying Meta's own error code (so the
 * caller can tell "this token is dead" apart from "we are being rate limited"),
 * and cursor pagination followed to the end rather than to the first page.
 */

/** Current Graph version. Overridable so a version bump is a deploy-time change. */
export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";

const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * The permissions the App must be configured with. `leads_retrieval` governs
 * whether lead data can be read at all; `ads_management` and `pages_manage_ads`
 * are what make the ad-level fields (`ad_id`, `adset_id`, `campaign_id`) on a
 * lead readable; the two `pages_*` scopes are the supporting set Meta's Lead
 * Ads documentation lists for the retrieval path.
 *
 * `pages_manage_metadata` is deliberately absent: Facebook rejects it on the
 * standard Facebook Login product (it belongs to Facebook Login for Business),
 * and it only covers webhook subscription, which this integration does not use.
 */
export const REQUIRED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_ads",
  "ads_management",
  "leads_retrieval",
] as const;

/**
 * The standard fields a Lead Ad form collects. `full_name`, `phone_number` and
 * `email` are Meta's built-in question keys; anything else on a form is a custom
 * question the admin maps by hand.
 */
export const STANDARD_FIELD_SUGGESTIONS: Record<string, string> = {
  full_name: "name",
  phone_number: "phone",
  email: "email",
};

export type GraphErrorKind = "rate_limit" | "token" | "permission" | "not_found" | "unknown";

export class GraphError extends Error {
  code: number | null;
  subcode: number | null;
  type: GraphErrorKind;
  retryAfterSeconds: number | null;

  constructor(message: string, opts: { code?: number | null; subcode?: number | null; status?: number } = {}) {
    super(message);
    this.name = "GraphError";
    this.code = opts.code ?? null;
    this.subcode = opts.subcode ?? null;
    this.retryAfterSeconds = null;
    this.type = classify(this.code, this.subcode, opts.status);
  }
}

function classify(code: number | null, subcode: number | null, status: number | undefined): GraphErrorKind {
  if (code === 190 || code === 102 || subcode === 463 || subcode === 467) return "token";
  if (code === 200 || code === 294 || subcode === 2018065) return "permission";
  if (code === 4 || code === 17 || code === 32 || code === 613) return "rate_limit";
  if (code === 803 || code === 100 || status === 404) return "not_found";
  return "unknown";
}

function appCredentials() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  return { appId, appSecret };
}

/** Whether the server has the App credentials it needs to even start a handshake. */
export function isAppConfigured(): boolean {
  const { appId, appSecret } = appCredentials();
  return !!appId && !!appSecret;
}

/**
 * Where an admin is sent to grant permissions. `redirect_uri` must be byte-identical
 * to the one the callback verifies, so it is computed once here and reused there.
 */
export function callbackUrl(): string {
  const explicit = process.env.META_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://crm.patangfuturehomes.com").replace(/\/+$/, "");
  return `${base}/crm/api/meta/callback`;
}

export function authorizeUrl(state: string): string {
  const { appId } = appCredentials();
  const params = new URLSearchParams({
    client_id: appId || "",
    redirect_uri: callbackUrl(),
    state,
    response_type: "code",
    scope: REQUIRED_SCOPES.join(","),
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

type GraphResponse = Record<string, unknown> & {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
};

async function graphGet<T = GraphResponse>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH_BASE}/${path.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (error) {
    // A transport failure is not a Meta error and carries no code. Treating it as
    // "unknown" keeps the job from marking a healthy connection as broken.
    throw new GraphError(`Could not reach Graph API: ${(error as Error).message}`);
  }

  const retryAfter = Number(res.headers.get("retry-after"));
  const body = (await res.json().catch(() => ({}))) as GraphResponse;

  if (!res.ok || body?.error) {
    const err = body?.error;
    const message = err?.message || `Graph request failed with HTTP ${res.status}`;
    const thrown = new GraphError(message, { code: err?.code, subcode: err?.error_subcode, status: res.status });
    if (Number.isFinite(retryAfter) && retryAfter > 0) thrown.retryAfterSeconds = retryAfter;
    throw thrown;
  }

  return body as T;
}

export type ManagedPage = {
  id: string;
  name: string;
  /** Page token. Never leaves the server except in this one internal hop. */
  accessToken: string;
  tasks: string[];
};

export type TokenBundle = {
  accessToken: string;
  expiresInSeconds: number | null;
};

/**
 * Graph answers in snake_case (`access_token`, `expires_in`); the rest of the
 * code reads camelCase. Reading the raw body as `TokenBundle` used to leave
 * `accessToken` undefined, which quietly stripped `fb_exchange_token` from the
 * long-lived exchange and made Facebook reject it.
 */
function toTokenBundle(body: TokenBundle & GraphResponse): TokenBundle {
  const raw = body as unknown as { access_token?: unknown; expires_in?: unknown };
  return {
    accessToken: String(raw.access_token ?? body.accessToken ?? ""),
    expiresInSeconds:
      typeof raw.expires_in === "number"
        ? raw.expires_in
        : typeof raw.expires_in === "string" && Number.isFinite(Number(raw.expires_in))
          ? Number(raw.expires_in)
          : (body.expiresInSeconds ?? null),
  };
}

/** Short-lived user token, straight from the authorization code. */
export async function exchangeCodeForToken(code: string): Promise<TokenBundle> {
  const { appId, appSecret } = appCredentials();
  const body = await graphGet<TokenBundle & GraphResponse>("oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: callbackUrl(),
    code,
  });
  const bundle = toTokenBundle(body);
  // `graphGet` drops empty params, so an empty token would surface as a
  // confusing Facebook complaint rather than as what actually went wrong.
  if (!bundle.accessToken) {
    throw new GraphError("Facebook did not return an access token for that code.", { status: 400 });
  }
  return bundle;
}

/**
 * Trades the one-hour token for a ~60 day one. Without this step the integration
 * would need an admin to re-click "Connect Facebook" every hour.
 */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<TokenBundle> {
  const { appId, appSecret } = appCredentials();
  if (!shortLivedToken) {
    throw new GraphError("Cannot extend an empty short-lived token.", { status: 400 });
  }
  const body = await graphGet<TokenBundle & GraphResponse>("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  return toTokenBundle(body);
}

/**
 * The Pages the connected account administers, each with its own access token.
 * The account must actually hold a Page task - a Page the person can see but not
 * manage does not come back here, which is the behaviour we want.
 */
export async function listManagedPages(userToken: string): Promise<{ pages: ManagedPage[]; metaUserId: string | null }> {
  const data = await graphGet<{ data?: unknown[] }>(`me/accounts`, {
    fields: "id,name,access_token,tasks",
    access_token: userToken,
    limit: 100,
  });

  const pages: ManagedPage[] = [];
  for (const raw of (data.data || []) as Record<string, unknown>[]) {
    const id = String(raw.id || "");
    const token = String(raw.access_token || "");
    if (!id || !token) continue;
    pages.push({
      id,
      name: String(raw.name || `Page ${id}`),
      accessToken: token,
      tasks: Array.isArray(raw.tasks) ? raw.tasks.map(String) : [],
    });
  }

  // The id of the user who granted access, needed by the lead-access diagnostic.
  let metaUserId: string | null = null;
  try {
    const me = await graphGet<{ id?: string }>("me", { fields: "id", access_token: userToken });
    metaUserId = me.id ? String(me.id) : null;
  } catch {
    // Not fatal: the Page tokens already work, and the diagnostic degrades to a
    // message instead of blocking the connection.
  }

  return { pages, metaUserId };
}

export type LeadgenFormSummary = {
  id: string;
  name: string;
  status: string;
  createdTime: string | null;
};

export async function listLeadgenForms(pageId: string, pageToken: string): Promise<LeadgenFormSummary[]> {
  const data = await graphGet<{ data?: unknown[] }>(`${pageId}/leadgen_forms`, {
    access_token: pageToken,
    limit: 100,
  });
  return ((data.data || []) as Record<string, unknown>[]).map((raw) => ({
    id: String(raw.id || ""),
    name: String(raw.name || "Untitled form"),
    status: String(raw.status || "UNKNOWN"),
    createdTime: raw.created_time ? String(raw.created_time) : null,
  }));
}

export type FormQuestion = {
  /** Meta's stable key, e.g. `full_name` or a custom question's key. */
  key: string;
  /** The human question as the ad actually asks it, e.g. "What's your budget?". */
  label: string;
  type: string;
  options: string[];
};

/**
 * The question schema for one form, which is what the mapping screen is built
 * from. `required` is deliberately not requested: Graph removed it and asking
 * for it fails the whole expansion with "(#100) Tried accessing nonexisting
 * field (required)" — nothing in the mapping or sync logic reads it.
 */
export async function getFormQuestions(formId: string, pageToken: string): Promise<FormQuestion[]> {
  const data = await graphGet<{ questions?: unknown }>(formId, {
    access_token: pageToken,
    fields: "questions{key,label,type,options}",
  });
  // Graph answers `fields=questions{...}` with a bare array, but the same edge
  // read as a connection comes back as `{ data: [...] }` — accept both, because
  // an empty parse here silently empties the whole mapping screen.
  const q = data.questions;
  const raw = (Array.isArray(q) ? q : ((q as { data?: unknown[] })?.data || [])) as Record<string, unknown>[];
  return raw.map((entry) => ({
    key: String(entry.key || ""),
    label: String(entry.label || entry.key || "Question"),
    type: String(entry.type || ""),
    options: Array.isArray(entry.options)
      ? (entry.options as unknown[])
          .map((o) =>
            typeof o === "string" ? o : String((o as Record<string, unknown>).value ?? (o as Record<string, unknown>).title ?? (o as Record<string, unknown>).name ?? "")
          )
          .filter(Boolean)
      : [],
  }));
}

export type RawFieldValue = { name: string; text?: string; values?: Array<string | { value?: string }> };

export type GraphLead = {
  id: string;
  createdTime: string | null;
  /** key -> answer, flattened out of Meta's `field_data` envelope. */
  fields: Record<string, string>;
  /**
   * The ad the submission came from. Only present when the token carries
   * `ads_management` / `pages_manage_ads`; a lead from an organic post or an
   * unapproved scope comes back with nulls here rather than failing the poll.
   */
  adId: string | null;
  adSetId: string | null;
  campaignId: string | null;
};

/** The lead body Meta returns regardless of ad-level permissions. */
const LEAD_BODY_FIELDS = "id,created_time,field_data";
/** The ad-level attribution fields, readable only with `ads_management`. */
const LEAD_AD_FIELDS = `${LEAD_BODY_FIELDS},ad_id,adset_id,campaign_id`;

/**
 * Leads submitted to a form since a unix timestamp, following every page.
 *
 * `since` is the poll's whole optimisation: an unfiltered call returns the form's
 * entire history, which for a live form is tens of thousands of leads and counts
 * against the rate limit on every single poll.
 *
 * The ad-level fields need `ads_management` / `pages_manage_ads`. If the token
 * does not carry them Meta fails the request outright rather than blanking the
 * fields, so the poll falls back to the lead body alone: a missing campaign id
 * costs attribution, a failed poll costs every lead.
 */
export async function fetchLeadsSince(
  formId: string,
  pageToken: string,
  sinceUnix: number | null,
  maxPages = 20
): Promise<GraphLead[]> {
  try {
    return await fetchLeadPages(formId, pageToken, sinceUnix, LEAD_AD_FIELDS, maxPages);
  } catch (error) {
    if (!(error instanceof GraphError) || error.type !== "permission") throw error;
    return await fetchLeadPages(formId, pageToken, sinceUnix, LEAD_BODY_FIELDS, maxPages);
  }
}

async function fetchLeadPages(
  formId: string,
  pageToken: string,
  sinceUnix: number | null,
  fields: string,
  maxPages: number
): Promise<GraphLead[]> {
  const out: GraphLead[] = [];
  let url: string | null = `${GRAPH_BASE}/${formId}/leads`;

  for (let page = 0; page < maxPages && url; page++) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("access_token", pageToken);
    pageUrl.searchParams.set("fields", fields);
    pageUrl.searchParams.set("limit", "100");
    if (sinceUnix != null) pageUrl.searchParams.set("since", String(sinceUnix));
    // A cursor page must not be re-filtered, and re-applying `since` to it would
    // be harmless but redundant, so the params above are set only on page one.
    url = null;

    const res: Response = await fetch(pageUrl, { cache: "no-store" }).catch((error: Error) => {
      throw new GraphError(`Could not reach Graph API: ${error.message}`);
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: Record<string, unknown>[];
      paging?: { next?: string };
      error?: { message?: string; code?: number; error_subcode?: number };
    };

    if (!res.ok || body?.error) {
      throw new GraphError(body?.error?.message || `HTTP ${res.status}`, {
        code: body?.error?.code,
        subcode: body?.error?.error_subcode,
        status: res.status,
      });
    }

    for (const raw of body.data || []) {
      // Meta documents `field_data` as an array of { name, values } entries.
      // Accept the object envelope too, but never treat an array's inherited
      // `values` method as data — iterating it throws mid-poll.
      const fd = raw.field_data;
      const entries: RawFieldValue[] = Array.isArray(fd)
        ? (fd as RawFieldValue[])
        : ((fd as { values?: RawFieldValue[] } | null | undefined)?.values || []);
      const answers: Record<string, string> = {};
      for (const v of entries) {
        // Graph returns `values` as an array of plain strings, but some payloads
        // (and older docs) use `{ value }` objects. Accept both, or every answer
        // silently reads back empty.
        const first = v.values?.[0];
        const text = v.text ?? (typeof first === "string" ? first : first?.value);
        if (v.name && text != null) answers[v.name] = String(text);
      }
      out.push({
        id: String(raw.id || ""),
        createdTime: raw.created_time ? String(raw.created_time) : null,
        fields: answers,
        adId: raw.ad_id ? String(raw.ad_id) : null,
        adSetId: raw.adset_id ? String(raw.adset_id) : null,
        campaignId: raw.campaign_id ? String(raw.campaign_id) : null,
      });
    }

    const next = body.paging?.next;
    // `next` already carries the access token, so it is followed verbatim and the
    // params above are deliberately not re-applied.
    if (next && (body.data?.length ?? 0) > 0) url = next;
  }

  return out;
}

export type LeadAccessReport = {
  canAccess: boolean | null;
  appHasPermission: boolean | null;
  userHasPermission: boolean | null;
  isPageAdmin: boolean | null;
  leadAccessManagerEnabled: boolean | null;
  failureReason: string | null;
  failureResolution: string | null;
  note: string | null;
};

/**
 * Asks Meta directly whether this App, as configured, may read this Page's leads.
 *
 * This is the check that settles whether App Review is needed, and it is why the
 * integration page can answer that question instead of guessing: the answer
 * depends on the App's current access level and on the Business Manager's
 * Leads Access Manager configuration, neither of which is visible from here.
 */
export async function checkLeadAccess(
  pageId: string,
  metaUserId: string,
  pageToken: string
): Promise<LeadAccessReport> {
  try {
    const data = await graphGet<{ has_lead_access?: Record<string, unknown> }>(pageId, {
      access_token: pageToken,
      fields: `has_lead_access.user_id(${metaUserId})`,
    });
    const h = (data.has_lead_access || {}) as {
      can_access_lead?: boolean;
      app_has_leads_permission?: boolean;
      user_has_leads_permission?: boolean;
      is_page_admin?: boolean;
      enabled_lead_access_manager?: boolean;
      failure_reason?: string;
      failure_resolution?: string;
    };
    return {
      canAccess: typeof h.can_access_lead === "boolean" ? h.can_access_lead : null,
      appHasPermission: typeof h.app_has_leads_permission === "boolean" ? h.app_has_leads_permission : null,
      userHasPermission: typeof h.user_has_leads_permission === "boolean" ? h.user_has_leads_permission : null,
      isPageAdmin: typeof h.is_page_admin === "boolean" ? h.is_page_admin : null,
      leadAccessManagerEnabled: typeof h.enabled_lead_access_manager === "boolean" ? h.enabled_lead_access_manager : null,
      failureReason: h.failure_reason ?? null,
      failureResolution: h.failure_resolution ?? null,
      note: null,
    };
  } catch (error) {
    // Calling this endpoint itself needs `leads_retrieval`, so a Standard-Access
    // app gets an error here rather than a verdict. Say so instead of implying
    // the check passed.
    const ge = error as GraphError;
    return {
      canAccess: null,
      appHasPermission: null,
      userHasPermission: null,
      isPageAdmin: null,
      leadAccessManagerEnabled: null,
      failureReason: null,
      failureResolution: null,
      note:
        ge.type === "permission"
          ? "The App does not currently hold leads_retrieval for this Page, so Meta cannot report access. This is the expected result before App Review is approved."
          : `Could not run the access check: ${ge.message}`,
    };
  }
}

type DebugToken = {
  app_id?: string;
  scopes?: string;
  expires_at?: number;
  is_valid?: boolean;
  granular_scopes?: { scope?: string; target_ids?: string[] }[];
};

export type TokenDiagnostics = {
  valid: boolean | null;
  appId: string | null;
  scopes: string[];
  missingScopes: string[];
  expiresAt: string | null;
  note: string | null;
};

/**
 * Reads the token back to see exactly which permissions Facebook actually granted.
 * A scope that was never approved comes back absent, which is the honest way to
 * tell an admin why syncing is not working instead of guessing from the UI.
 */
export async function debugToken(token: string): Promise<TokenDiagnostics> {
  const { appId, appSecret } = appCredentials();
  try {
    const data = await graphGet<DebugToken & GraphResponse>("debug_token", {
      input_token: token,
      access_token: `${appId}|${appSecret}`,
    });
    const scopes = Array.isArray(data.scopes)
      ? data.scopes
      : (data.granular_scopes || []).map((g) => String(g.scope || "")).filter(Boolean);
    const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
    return {
      valid: data.is_valid === true,
      appId: data.app_id ? String(data.app_id) : null,
      scopes,
      missingScopes: [...missing],
      expiresAt: data.expires_at ? new Date(data.expires_at * 1000).toISOString() : null,
      note: null,
    };
  } catch (error) {
    return {
      valid: null,
      appId: null,
      scopes: [],
      missingScopes: [],
      expiresAt: null,
      note: `Could not read token details: ${(error as GraphError).message}`,
    };
  }
}
