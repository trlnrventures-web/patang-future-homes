"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Settings > Meta Integration.
 *
 * Four stages in one screen, in the order the work actually happens: connect a
 * Facebook page, choose which forms to sync, map each form's questions onto CRM
 * fields and assignment, then watch the activity log. Each stage is inert until
 * the one before it is done, so the screen cannot be used out of order.
 */

type StaffOption = { id: number; name: string };

type Connection = {
  pageId: string;
  pageName: string;
  status: "connected" | "needs_refresh" | "disconnected";
  needsAttention: boolean;
  reason: string | null;
  connectedBy: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  tokenExpiresAt: string | null;
};

type Question = { key: string; label: string; type: string; options: string[] };

type Form = {
  id: string;
  name: string;
  status: string;
  createdTime: string | null;
  questions: Question[];
  fieldMap: Record<string, string>;
  saved: boolean;
  syncEnabled: boolean;
  project: string | null;
  callerId: number | null;
  smId: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

type RunLog = {
  id: number;
  formId: string | null;
  formName: string;
  status: "ok" | "warning" | "error" | "skipped";
  leadsFetched: number;
  createdCount: number;
  duplicates: number;
  reactivatedCount: number;
  errorCount: number;
  message: string | null;
  startedAt: string;
};

type AccessReport = {
  pageName: string;
  requiredScopes: string[];
  token: { valid: boolean | null; scopes: string[]; missingScopes: string[]; expiresAt: string | null; note: string | null };
  leadAccess: {
    canAccess: boolean | null;
    appHasPermission: boolean | null;
    userHasPermission: boolean | null;
    isPageAdmin: boolean | null;
    leadAccessManagerEnabled: boolean | null;
    failureReason: string | null;
    failureResolution: string | null;
    note: string | null;
  };
  verdict: string;
  checkFailed: boolean;
};

/**
 * The CRM columns a Meta question can feed. Mirrors `MAPPABLE_FIELDS` on the
 * server, which re-validates every value on save - this list only decides what the
 * dropdown offers.
 */
const CRM_FIELDS: { key: string; label: string }[] = [
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

const IGNORE = "ignore";

const inputClass =
  "rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary";

export default function MetaIntegrationPanel({
  callers,
  salesManagers,
  projects,
}: {
  callers: StaffOption[];
  salesManagers: StaffOption[];
  projects: string[];
}) {
  const [appConfigured, setAppConfigured] = useState<boolean | null>(null);
  const [usesDedicatedSecret, setUsesDedicatedSecret] = useState(true);
  const [requiredScopes, setRequiredScopes] = useState<string[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [forms, setForms] = useState<Form[]>([]);
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [access, setAccess] = useState<AccessReport | null>(null);

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingForms, setLoadingForms] = useState(false);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [savingFormId, setSavingFormId] = useState<string | null>(null);

  const popupRef = useRef<Window | null>(null);

  const activePageId = selectedPageId || connections.find((c) => c.status === "connected")?.pageId || "";
  const activeConnection = connections.find((c) => c.pageId === activePageId);
  const hasLiveConnection = connections.some((c) => c.status === "connected");

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/crm/api/meta", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setAppConfigured(data.appConfigured);
      setUsesDedicatedSecret(data.usesDedicatedTokenSecret);
      setRequiredScopes(data.requiredScopes || []);
      setConnections(data.connections || []);
      const live = (data.connections || []).find((c: Connection) => c.status === "connected");
      setSelectedPageId((prev) => prev || live?.pageId || "");
    } catch {
      setBanner({ tone: "error", text: "Could not load the integration status." });
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const loadForms = useCallback(async (pageId: string) => {
    if (!pageId) return;
    setLoadingForms(true);
    try {
      const res = await fetch(`/crm/api/meta/forms?pageId=${encodeURIComponent(pageId)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setForms([]);
        setBanner({ tone: "error", text: data.error || "Could not load forms." });
        return;
      }
      setForms(data.forms || []);
    } catch {
      setBanner({ tone: "error", text: "Could not reach the server." });
    } finally {
      setLoadingForms(false);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch("/crm/api/meta/log?limit=25", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setRuns(data.runs || []);
    } catch {
      // The log is decoration on top of a working page; a failed refresh is not
      // worth a banner on top of whatever the admin was doing.
    }
  }, []);

  // Deferred with setTimeout so the effect body itself does no state work, which
  // is the same shape the rest of the CRM uses for an initial load.
  useEffect(() => {
    const t = setTimeout(() => {
      loadStatus();
      loadRuns();
    }, 0);
    return () => clearTimeout(t);
  }, [loadStatus, loadRuns]);

  useEffect(() => {
    if (!activePageId) return;
    const t = setTimeout(() => loadForms(activePageId), 0);
    return () => clearTimeout(t);
  }, [activePageId, loadForms]);

  // The popup posts a message on success and then closes itself. There is no
  // reliable "closed" event to hang a refresh on, so the poll below is what
  // actually notices the connection landed.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== "crm-meta") return;
      if (event.data?.ok) {
        setBanner({ tone: "ok", text: "Facebook connected. Loading your pages..." });
        loadStatus();
        loadRuns();
      } else {
        setBanner({ tone: "error", text: "Facebook connection did not complete. See the popup for details." });
      }
    }
    window.addEventListener("message", onMessage);

    // Belt and braces for the popup that closed without posting, e.g. if the
    // admin dismissed it.
    const poll = window.setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        popupRef.current = null;
        window.clearInterval(poll);
        loadStatus();
        loadRuns();
      }
    }, 1500);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(poll);
    };
  }, [loadStatus, loadRuns]);

  async function connect() {
    setBanner(null);
    try {
      const res = await fetch("/crm/api/meta", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ tone: "error", text: data.error || "Could not start the Facebook login." });
        return;
      }
      // A popup, so the admin stays on the CRM page and the form list refreshes
      // in place when it closes.
      popupRef.current = window.open(data.authorizeUrl, "crm-meta-connect", "width=680,height=760");
      if (!popupRef.current) {
        setBanner({
          tone: "error",
          text: "Your browser blocked the Facebook login window. Allow popups for this site and try again.",
        });
      }
    } catch {
      setBanner({ tone: "error", text: "Network error while starting the connection." });
    }
  }

  async function disconnect(pageId: string) {
    if (!window.confirm("Disconnect this page? Its stored tokens are destroyed and its forms stop syncing.")) return;
    try {
      const res = await fetch("/crm/api/meta/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ tone: "error", text: data.error || "Could not disconnect." });
        return;
      }
      setBanner({ tone: "ok", text: "Disconnected. Stored tokens were destroyed." });
      if (selectedPageId === pageId) setSelectedPageId("");
      setForms([]);
      setAccess(null);
      await loadStatus();
    } catch {
      setBanner({ tone: "error", text: "Network error while disconnecting." });
    }
  }

  async function checkAccess(pageId: string) {
    setLoadingAccess(true);
    setAccess(null);
    try {
      const res = await fetch(`/crm/api/meta/access?pageId=${encodeURIComponent(pageId)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ tone: "error", text: data.error || "Could not run the access check." });
        return;
      }
      setAccess(data);
    } catch {
      setBanner({ tone: "error", text: "Network error during the access check." });
    } finally {
      setLoadingAccess(false);
    }
  }

  async function saveForm(form: Form, overrides: Partial<Form> = {}) {
    setSavingFormId(form.id);
    setBanner(null);
    try {
      const merged = { ...form, ...overrides };
      const res = await fetch("/crm/api/meta/mappings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: merged.id,
          pageId: activePageId,
          formName: merged.name,
          project: merged.project,
          callerId: merged.callerId,
          smId: merged.smId,
          fieldMap: merged.fieldMap,
          syncEnabled: merged.syncEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ tone: "error", text: data.error || "Could not save this form." });
        // "No Caller assigned" is the one rejection the admin can fix on this
        // screen, and only from inside the mapping editor — open it for them
        // rather than leaving them hunting for where the caller is picked.
        if (typeof data.error === "string" && data.error.includes("No Caller assigned")) {
          setOpenFormId(form.id);
        }
        return false;
      }
      setForms((prev) =>
        prev.map((f) =>
          f.id === form.id
            ? {
                ...f,
                fieldMap: data.mapping.fieldMap || {},
                project: data.mapping.project,
                callerId: data.mapping.callerId,
                smId: data.mapping.smId,
                syncEnabled: data.mapping.syncEnabled,
                lastError: data.mapping.lastError,
                saved: true,
              }
            : f
        )
      );
      setBanner({
        tone: data.warning ? "error" : "ok",
        text: data.warning || `Saved "${merged.name}".`,
      });
      return true;
    } catch {
      setBanner({ tone: "error", text: "Network error while saving." });
      return false;
    } finally {
      setSavingFormId(null);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setBanner(null);
    try {
      const res = await fetch("/crm/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ tone: "error", text: data.error || "The sync did not run." });
      } else if (data.skipped) {
        setBanner({ tone: "error", text: data.reason });
      } else {
        const parts = [`${data.created} created`, `${data.duplicates} duplicates`];
        if (data.reactivated) parts.push(`${data.reactivated} reactivated`);
        if (data.errors) parts.push(`${data.errors} errors`);
        setBanner({
          tone: data.errors ? "error" : "ok",
          text: `Sync finished: ${parts.join(", ")} across ${data.formsSynced} form(s).`,
        });
      }
      await Promise.all([loadRuns(), loadForms(activePageId)]);
    } catch {
      setBanner({ tone: "error", text: "Network error during the sync." });
    } finally {
      setSyncing(false);
    }
  }

  async function syncOneForm(formId: string) {
    setSyncing(true);
    try {
      const res = await fetch("/crm/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ tone: "error", text: data.error || "Could not sync this form." });
      } else {
        const r = data.results?.[0];
        setBanner({
          tone: r?.status === "error" ? "error" : "ok",
          text: r ? `${r.formName}: ${r.message}` : "Sync finished.",
        });
      }
      await Promise.all([loadRuns(), loadForms(activePageId)]);
    } catch {
      setBanner({ tone: "error", text: "Network error during the sync." });
    } finally {
      setSyncing(false);
    }
  }

  const enabledCount = forms.filter((f) => f.syncEnabled).length;

  return (
    <div className="space-y-5">
      {banner && (
        <div
          role="status"
          className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${
            banner.tone === "ok"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {banner.text}
        </div>
      )}

      {appConfigured === false && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900">
          META_APP_ID and META_APP_SECRET are not set on the server. Set them and
          restart the app before connecting. The App Secret is only ever read from
          the environment - it is never stored in the database or sent to the
          browser.
        </div>
      )}

      {appConfigured === true && !usesDedicatedSecret && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <span className="font-semibold">Tokens are encrypted with a key derived from JWT_SECRET.</span>{" "}
          Set <code className="font-mono">CRM_META_TOKEN_SECRET</code> to a value of its
          own. As it stands, rotating JWT_SECRET to force a log-out would also
          invalidate every stored Facebook token and silently stop lead syncing.
        </div>
      )}

      {/* ---------------------------------------------------------- 1. connect */}
      <section className="rounded-xl border border-border bg-white p-4">
        <h2 className="text-sm font-bold text-navy">1. Facebook page</h2>
        <p className="mt-1 text-xs text-muted">
          Connect with the Facebook account that administers the Patang pages. The
          pages are found from that account, so there is nothing to type in here.
        </p>

        {loadingStatus ? (
          <p className="mt-3 text-sm text-muted">Loading...</p>
        ) : connections.length === 0 ? (
          <button
            type="button"
            onClick={connect}
            disabled={appConfigured === false}
            className="mt-3 rounded-xl bg-[#1877F2] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#166FE5] disabled:opacity-50"
          >
            Connect Facebook
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            {connections.length > 1 && (
              <div>
                <label htmlFor="meta-page" className="mb-1.5 block text-xs font-bold text-navy">
                  Page
                </label>
                <select
                  id="meta-page"
                  value={activePageId}
                  onChange={(e) => {
                    setSelectedPageId(e.target.value);
                    setAccess(null);
                  }}
                  className={inputClass}
                >
                  {connections.map((c) => (
                    <option key={c.pageId} value={c.pageId}>
                      {c.pageName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeConnection && (
              <div
                className={`rounded-xl border px-3 py-2.5 text-xs ${
                  activeConnection.needsAttention
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-green-200 bg-green-50 text-green-800"
                }`}
              >
                <p className="font-semibold">
                  {activeConnection.status === "connected"
                    ? `Connected as ${activeConnection.pageName}`
                    : activeConnection.status === "needs_refresh"
                      ? "Facebook connection needs to be refreshed"
                      : `${activeConnection.pageName} is disconnected`}
                </p>
                {activeConnection.reason && <p className="mt-1">{activeConnection.reason}</p>}
                <p className="mt-1 text-[11px] opacity-80">
                  Connected by {activeConnection.connectedBy || "unknown"}
                  {activeConnection.lastVerifiedAt
                    ? ` · last verified ${formatTime(activeConnection.lastVerifiedAt)}`
                    : ""}
                  {activeConnection.tokenExpiresAt
                    ? ` · user token expires ${formatDate(activeConnection.tokenExpiresAt)}`
                    : ""}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {appConfigured === true && (
                <button
                  type="button"
                  onClick={connect}
                  className="rounded-xl bg-[#1877F2] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#166FE5]"
                >
                  {hasLiveConnection ? "Reconnect Facebook" : "Connect Facebook"}
                </button>
              )}
              {activeConnection?.status === "connected" && (
                <button
                  type="button"
                  onClick={() => checkAccess(activeConnection.pageId)}
                  disabled={loadingAccess}
                  className="rounded-xl border border-border bg-white px-3.5 py-2 text-xs font-bold text-navy hover:border-primary disabled:opacity-50"
                >
                  {loadingAccess ? "Checking..." : "Check lead access"}
                </button>
              )}
              {activeConnection && activeConnection.status !== "disconnected" && (
                <button
                  type="button"
                  onClick={() => disconnect(activeConnection.pageId)}
                  className="rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                >
                  Disconnect
                </button>
              )}
            </div>

            {requiredScopes.length > 0 && (
              <p className="pt-1 text-[11px] text-muted">
                Permissions requested: {requiredScopes.join(", ")}.
              </p>
            )}
          </div>
        )}

        {access && <AccessPanel access={access} />}
      </section>

      {/* ----------------------------------------------------------- 2. forms */}
      <section className="rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-navy">2. Lead forms</h2>
            <p className="mt-1 text-xs text-muted">
              Every form on the page, with a toggle per form. Nothing is fetched
              until a form is switched on here.
            </p>
          </div>
          {hasLiveConnection && (
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing || enabledCount === 0}
              className="rounded-xl border border-border bg-white px-3.5 py-2 text-xs font-bold text-navy hover:border-primary disabled:opacity-50"
              title={enabledCount === 0 ? "Turn on at least one form first" : undefined}
            >
              {syncing ? "Syncing..." : `Sync now (${enabledCount} on)`}
            </button>
          )}
        </div>

        {!hasLiveConnection ? (
          <p className="mt-3 text-sm text-muted">Connect a Facebook page first.</p>
        ) : loadingForms ? (
          <p className="mt-3 text-sm text-muted">Loading forms...</p>
        ) : forms.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No lead forms found on this page. Create a Lead Ad form in Ads Manager,
            then reload.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-bold">Form</th>
                  <th className="py-2 pr-3 font-bold">Status</th>
                  <th className="py-2 pr-3 font-bold">Created</th>
                  <th className="py-2 pr-3 font-bold">Assignment</th>
                  <th className="py-2 pr-3 font-bold">Last sync</th>
                  <th className="py-2 font-bold">Sync</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <FormRow
                    key={form.id}
                    form={form}
                    callerName={callers.find((c) => c.id === form.callerId)?.name || null}
                    smName={salesManagers.find((s) => s.id === form.smId)?.name || null}
                    saving={savingFormId === form.id}
                    syncing={syncing}
                    onToggle={(next) => saveForm(form, { syncEnabled: next })}
                    onOpen={() => setOpenFormId(openFormId === form.id ? null : form.id)}
                    onSync={() => syncOneForm(form.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {openFormId &&
          forms
            .filter((f) => f.id === openFormId)
            .map((form) => (
              <MappingEditor
                key={form.id}
                form={form}
                callers={callers}
                salesManagers={salesManagers}
                projects={projects}
                saving={savingFormId === form.id}
                onChange={(patch) =>
                  setForms((prev) => prev.map((f) => (f.id === form.id ? { ...f, ...patch } : f)))
                }
                onSave={(overrides) => saveForm(form, overrides)}
              />
            ))}
      </section>

      {/* ---------------------------------------------------------- 3. log */}
      <section className="rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-navy">3. Activity</h2>
            <p className="mt-1 text-xs text-muted">
              One line per form per run, from the scheduled job or from Sync now.
            </p>
          </div>
          <button
            type="button"
            onClick={loadRuns}
            className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-bold text-navy hover:border-primary"
          >
            Refresh
          </button>
        </div>

        {runs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No sync runs yet. Turn on a form above, then use Sync now.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-bold">When</th>
                  <th className="py-2 pr-3 font-bold">Form</th>
                  <th className="py-2 pr-3 font-bold">Result</th>
                  <th className="py-2 pr-3 font-bold text-right">Fetched</th>
                  <th className="py-2 pr-3 font-bold text-right">New</th>
                  <th className="py-2 pr-3 font-bold text-right">Dupes</th>
                  <th className="py-2 font-bold text-right">Errors</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 text-muted">{formatTime(run.startedAt)}</td>
                    <td className="py-2 pr-3 font-semibold text-navy">{run.formName}</td>
                    <td className="py-2 pr-3">
                      <StatusPill status={run.status} />
                      {run.message && <span className="ml-2 text-muted">{run.message}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">{run.leadsFetched}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-green-700">
                      {run.createdCount}
                    </td>
                    <td className="py-2 pr-3 text-right">{run.duplicates}</td>
                    <td className={`py-2 text-right ${run.errorCount ? "font-bold text-red-700" : ""}`}>
                      {run.errorCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function FormRow({
  form,
  callerName,
  smName,
  saving,
  syncing,
  onToggle,
  onOpen,
  onSync,
}: {
  form: Form;
  callerName: string | null;
  smName: string | null;
  saving: boolean;
  syncing: boolean;
  onToggle: (next: boolean) => void;
  onOpen: () => void;
  onSync: () => void;
}) {
  const archived = form.status.toUpperCase() !== "ACTIVE";

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-2.5 pr-3">
        <button
          type="button"
          onClick={onOpen}
          className="text-left font-semibold text-primary underline-offset-2 hover:underline"
        >
          {form.name}
        </button>
        <div className="text-[11px] text-muted">{form.questions.length} questions</div>
        {form.lastError && <div className="text-[11px] text-red-700">{form.lastError}</div>}
      </td>
      <td className="py-2.5 pr-3">
        <StatusPill status={archived ? "warning" : "ok"} label={form.status} />
      </td>
      <td className="py-2.5 pr-3 text-muted">{formatDate(form.createdTime)}</td>
      <td className="py-2.5 pr-3 text-muted">
        {callerName || smName ? (
          <span title={[callerName && `Caller: ${callerName}`, smName && `SM: ${smName}`].filter(Boolean).join(" · ")}>
            {[callerName, smName].filter(Boolean).join(" · ")}
          </span>
        ) : (
          <span className="text-amber-700">Not set</span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-muted">{form.lastSyncedAt ? formatTime(form.lastSyncedAt) : "Never"}</td>
      <td className="py-2.5">
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={form.syncEnabled}
              disabled={saving || archived}
              onChange={(e) => onToggle(e.target.checked)}
              className="h-4 w-4 accent-primary disabled:opacity-40"
            />
            <span className="text-[11px] font-semibold text-navy">Sync</span>
          </label>
          {form.syncEnabled && (
            <button
              type="button"
              onClick={onOpen}
              disabled={syncing}
              className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
            >
              Mapping
            </button>
          )}
          {form.syncEnabled && !archived && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
              title="Fetch new leads for this form only"
            >
              {syncing ? "Syncing..." : "Sync"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * The mapping screen. Left column is what the ad asks, right column is where the
 * answer should land in the CRM. Meta's standard questions arrive pre-mapped, so
 * an admin only has to make decisions about the custom ones.
 */
function MappingEditor({
  form,
  callers,
  salesManagers,
  projects,
  saving,
  onChange,
  onSave,
}: {
  form: Form;
  callers: StaffOption[];
  salesManagers: StaffOption[];
  projects: string[];
  saving: boolean;
  onChange: (patch: Partial<Form>) => void;
  onSave: (overrides: Partial<Form>) => void;
}) {
  const custom = useMemo(() => form.questions.filter((q) => !q.key.startsWith("_")), [form.questions]);
  const mappedCount = custom.filter((q) => form.fieldMap[q.key]).length;

  const setField = (key: string, value: string) => {
    onChange({ fieldMap: { ...form.fieldMap, [key]: value } });
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">{form.name} — field mapping</h3>
        <span className="text-[11px] text-muted">
          {mappedCount} of {custom.length} custom questions mapped
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {form.questions.length === 0 && (
          <p className="text-xs font-semibold text-red-700">
            Questions for this form could not be read from Facebook, so field mapping is
            unavailable right now. Assignment below still works.
          </p>
        )}
        {custom.map((q) => {
          const suggested = !form.saved;
          return (
            <div key={q.key} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-navy" title={q.label}>
                  {q.label}
                </div>
                <div className="truncate text-[11px] text-muted">{q.key}</div>
              </div>
              <select
                aria-label={`Map "${q.label}" to`}
                value={form.fieldMap[q.key] || IGNORE}
                onChange={(e) => setField(q.key, e.target.value)}
                className="w-40 shrink-0 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-navy outline-none focus:border-primary"
              >
                <option value={IGNORE}>Ignore this field</option>
                {CRM_FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              {suggested && form.fieldMap[q.key] && (
                <span className="shrink-0 text-[10px] text-muted">suggested</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 border-t border-border pt-3 md:grid-cols-3">
        <div>
          <label htmlFor={`proj-${form.id}`} className="mb-1.5 block text-xs font-bold text-navy">
            Project
          </label>
          {projects.length > 0 ? (
            <select
              id={`proj-${form.id}`}
              value={form.project || ""}
              onChange={(e) => onChange({ project: e.target.value || null })}
              className={`${inputClass} w-full`}
            >
              <option value="">Not set</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              {form.project && !projects.includes(form.project) && (
                <option value={form.project}>{form.project}</option>
              )}
            </select>
          ) : (
            <input
              id={`proj-${form.id}`}
              type="text"
              value={form.project || ""}
              onChange={(e) => onChange({ project: e.target.value || null })}
              className={`${inputClass} w-full`}
              placeholder="e.g. PAM"
            />
          )}
          <p className="mt-1 text-[11px] text-muted">
            Pre-set on every lead from this form. One form usually means one project.
          </p>
        </div>

        <div>
          <label htmlFor={`caller-${form.id}`} className="mb-1.5 block text-xs font-bold text-navy">
            Default Caller
          </label>
          <select
            id={`caller-${form.id}`}
            value={form.callerId || ""}
            onChange={(e) => onChange({ callerId: e.target.value ? Number(e.target.value) : null })}
            className={`${inputClass} w-full`}
          >
            <option value="">Not set</option>
            {callers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {callers.length === 0 && (
            <p className="mt-1 text-[11px] font-semibold text-red-700">
              No active Caller users found. Add a user with the Caller role in Team — sync cannot
              turn on without one.
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`sm-${form.id}`} className="mb-1.5 block text-xs font-bold text-navy">
            Default Sales Manager
          </label>
          <select
            id={`sm-${form.id}`}
            value={form.smId || ""}
            onChange={(e) => onChange({ smId: e.target.value ? Number(e.target.value) : null })}
            className={`${inputClass} w-full`}
          >
            <option value="">Not set</option>
            {salesManagers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {salesManagers.length === 0 && (
            <p className="mt-1 text-[11px] text-muted">No active Sales Manager users found.</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSave({})}
          disabled={saving}
          className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-secondary disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save mapping"}
        </button>
        <button
          type="button"
          onClick={() => onSave({ syncEnabled: true })}
          disabled={saving || form.syncEnabled}
          className="rounded-xl border border-border bg-white px-4 py-2 text-xs font-bold text-navy hover:border-primary disabled:opacity-50"
        >
          {form.syncEnabled ? "Sync is on" : "Save and turn sync on"}
        </button>
        <span className="text-[11px] text-muted">
          A caller is required, and at least one question must map to Name.
        </span>
      </div>
    </div>
  );
}

/** Meta's verdict on whether the App may read this page's leads. */
function AccessPanel({ access }: { access: AccessReport }) {
  const granted = access.token.scopes;
  const yes = (
    <span className="font-semibold text-green-700">yes</span>
  );
  const no = <span className="font-semibold text-red-700">no</span>;
  const unknown = <span className="text-muted">unknown</span>;

  return (
    <div className="mt-3 rounded-xl border border-border bg-background/50 p-3">
      <p className="text-xs font-bold text-navy">Lead access check — {access.pageName}</p>
      <p
        className={`mt-1.5 text-xs font-semibold ${
          access.leadAccess.canAccess === true
            ? "text-green-800"
            : access.checkFailed
              ? "text-amber-900"
              : "text-red-800"
        }`}
      >
        {access.verdict}
      </p>

      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">App may read leads</dt>
          <dd>
            {access.leadAccess.canAccess === null
              ? unknown
              : access.leadAccess.canAccess
                ? yes
                : no}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">App has leads_retrieval</dt>
          <dd>
            {access.leadAccess.appHasPermission === null
              ? unknown
              : access.leadAccess.appHasPermission
                ? yes
                : no}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Connected user has it</dt>
          <dd>
            {access.leadAccess.userHasPermission === null
              ? unknown
              : access.leadAccess.userHasPermission
                ? yes
                : no}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">User is a Page admin</dt>
          <dd>
            {access.leadAccess.isPageAdmin === null
              ? unknown
              : access.leadAccess.isPageAdmin
                ? yes
                : no}
          </dd>
        </div>
        {access.leadAccess.failureReason && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Meta says</dt>
            <dd>
              {access.leadAccess.failureReason}
              {access.leadAccess.failureResolution ? ` — ${access.leadAccess.failureResolution}` : ""}
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-2 text-[11px] text-muted">
        Permissions Facebook actually granted: {granted.length ? granted.join(", ") : "none reported"}.
        {access.token.missingScopes.length > 0 && (
          <>
            {" "}
            <span className="font-semibold text-amber-800">
              Missing: {access.token.missingScopes.join(", ")}.
            </span>
          </>
        )}
      </p>
      {access.leadAccess.leadAccessManagerEnabled === true && (
        <p className="mt-1 text-[11px] text-muted">
          Leads Access Manager is switched on for this business, so Page admin status
          alone may not be enough — the business admin configures who can read leads.
        </p>
      )}
    </div>
  );
}

function StatusPill({ status, label }: { status: "ok" | "warning" | "error" | "skipped"; label?: string }) {
  const styles: Record<string, string> = {
    ok: "bg-green-100 text-green-800",
    warning: "bg-amber-100 text-amber-800",
    error: "bg-red-100 text-red-800",
    skipped: "bg-stone-100 text-stone-700",
  };
  const fallback: Record<string, string> = {
    ok: "OK",
    warning: "Warning",
    error: "Error",
    skipped: "Skipped",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        styles[status] || styles.skipped
      }`}
    >
      {label || fallback[status] || status}
    </span>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
