"use client";

import { useState, useEffect, useCallback } from "react";
import { normalizeEmail, normalizePhone } from "@/lib/crm/identifiers";

type TeamUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  active: boolean;
  weekOffDay: string;
  baseSalary: number | null;
  seeAllLeads: boolean;
  pin: string | null;
  pinLocked: boolean;
  pinFailedCount: number;
  available: boolean;
  unavailableFrom: string | null;
  unavailableTo: string | null;
  unavailableNote: string | null;
  routingTier: string;
  dailyVisitCap: number | null;
};

type EditState = {
  baseSalary: string;
  weekOffDay: string;
  email: string;
  phone: string;
  seeAllLeads: boolean;
  available: boolean;
  unavailableFrom: string;
  unavailableTo: string;
  unavailableNote: string;
  routingTier: string;
  dailyVisitCap: string;
};

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Owner / Admin",
  sales_head: "Sales Head",
  sales_manager: "Sales Manager",
  caller: "Caller",
  marketing: "Marketing",
};

/** Only these roles have a lead scope that "see all leads" can widen. */
const SCOPED_ROLES = new Set(["caller", "sales_manager"]);

const EMPTY_EDIT: EditState = {
  baseSalary: "",
  weekOffDay: "Tuesday",
  email: "",
  phone: "",
  seeAllLeads: false,
  available: true,
  unavailableFrom: "",
  unavailableTo: "",
  unavailableNote: "",
  routingTier: "none",
  dailyVisitCap: "",
};

const ROUTING_TIERS = [
  { value: "none", label: "Not routed" },
  { value: "commission", label: "Commission (Grade A)" },
  { value: "salaried", label: "Salaried (Grade B)" },
];

export default function TeamManager() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [edits, setEdits] = useState<Record<number, EditState>>({});

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2500);
  };

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/crm/api/team");
      const json = await res.json();
      if (res.ok) {
        setUsers(json.users);
        const initial: Record<number, EditState> = {};
        for (const u of json.users) {
          initial[u.id] = {
            baseSalary: u.baseSalary != null ? String(u.baseSalary) : "",
            weekOffDay: u.weekOffDay || "Tuesday",
            email: u.email || "",
            phone: u.phone || "",
            seeAllLeads: !!u.seeAllLeads,
            available: u.available !== false,
            unavailableFrom: (u.unavailableFrom || "").slice(0, 10),
            unavailableTo: (u.unavailableTo || "").slice(0, 10),
            unavailableNote: u.unavailableNote || "",
            routingTier: u.routingTier || "none",
            dailyVisitCap: u.dailyVisitCap != null ? String(u.dailyVisitCap) : "",
          };
        }
        setEdits(initial);
      }
    } catch {
      flash("Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadUsers, 0);
    return () => clearTimeout(t);
  }, [loadUsers]);

  const saveUser = async (userId: number) => {
    setSaving(userId);
    try {
      const edit = edits[userId] ?? EMPTY_EDIT;
      const body: Record<string, unknown> = {
        userId,
        // Both are login identifiers, so they are sent even when the admin
        // touched only the salary: a blank phone is a deliberate "remove it",
        // and the server needs to see the email to keep the two in step.
        email: normalizeEmail(edit.email),
        phone: edit.phone.trim() === "" ? null : normalizePhone(edit.phone),
      };
      body.baseSalary = edit.baseSalary !== "" ? Number(edit.baseSalary) : null;
      body.weekOffDay = edit.weekOffDay;
      if (SCOPED_ROLES.has(users.find((u) => u.id === userId)?.role || "")) {
        body.seeAllLeads = edit.seeAllLeads;
      }

      // Availability + grade routing only apply to sales managers. The caller
      // is never routed, so sending these for a caller would be a no-op error.
      if (users.find((u) => u.id === userId)?.role === "sales_manager") {
        body.available = edit.available;
        body.unavailableFrom = edit.unavailableFrom || null;
        body.unavailableTo = edit.unavailableTo || null;
        body.unavailableNote = edit.unavailableNote || null;
        body.routingTier = edit.routingTier;
        body.dailyVisitCap = edit.dailyVisitCap !== "" ? Number(edit.dailyVisitCap) : null;
      }

      const res = await fetch("/crm/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      flash(`Updated ${users.find((u) => u.id === userId)?.name || "user"}`);
      loadUsers();
    } catch (e: unknown) {
      flash((e as Error).message || "Something went wrong");
    } finally {
      setSaving(null);
    }
  };

  const updateEdit = <K extends keyof EditState>(userId: number, field: K, value: EditState[K]) => {
    setEdits((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? EMPTY_EDIT), [field]: value },
    }));
  };

  const pinAction = async (userId: number, action: "reset" | "unlock") => {
    setSaving(userId);
    try {
      const res = await fetch("/crm/api/team/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      const name = users.find((u) => u.id === userId)?.name || "user";
      flash(
        action === "reset"
          ? `New PIN for ${name}: ${json.pin}`
          : `Unlocked ${name}`
      );
      loadUsers();
    } catch (e: unknown) {
      flash((e as Error).message || "Something went wrong");
    } finally {
      setSaving(null);
    }
  };

  const deactivateUser = async (user: TeamUser) => {
    if (user.active === false) return;
    const ok = window.confirm(
      `Deactivate ${user.name}?\n\nThey keep all their history, but their open leads go back to the assignment pool and they will stop receiving routed work.`,
    );
    if (!ok) return;
    setSaving(user.id);
    try {
      const res = await fetch("/crm/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, active: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      flash(`${user.name} deactivated`);
      loadUsers();
    } catch (e: unknown) {
      flash((e as Error).message || "Something went wrong");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted">
        Loading team members...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notice && (
        <div className="fixed left-1/2 top-16 z-[100] -translate-x-1/2 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-2xl">
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Email (login)</th>
                <th className="px-2 py-2">Phone (login)</th>
                <th className="px-2 py-2">Login PIN</th>
                <th className="px-2 py-2">Role</th>
                <th className="px-2 py-2">Week Off</th>
                <th className="px-2 py-2">All Leads</th>
                <th className="px-2 py-2">Availability &amp; routing</th>
                <th className="px-2 py-2 text-right">Base Monthly Salary</th>
                <th className="px-2 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const edit = edits[u.id] ?? EMPTY_EDIT;
                const salaryChanged =
                  edit.baseSalary !== (u.baseSalary != null ? String(u.baseSalary) : "");
                const weekOffChanged = edit.weekOffDay !== u.weekOffDay;
                const canSeeAll = SCOPED_ROLES.has(u.role);
                const seeAllChanged = canSeeAll && edit.seeAllLeads !== !!u.seeAllLeads;
                // Compared after normalization, otherwise trailing spaces or a
                // +91 prefix leave the row permanently showing as unsaved.
                const emailChanged = normalizeEmail(edit.email) !== (u.email ?? "");
                const phoneChanged =
                  (normalizePhone(edit.phone) ?? "") !== (u.phone ?? "");
                const isSalesManager = u.role === "sales_manager";
                const routingChanged =
                  isSalesManager &&
                  (edit.available !== (u.available !== false) ||
                    edit.routingTier !== (u.routingTier || "none") ||
                    (edit.dailyVisitCap !== "" ? Number(edit.dailyVisitCap) : null) !==
                      (u.dailyVisitCap ?? null) ||
                    edit.unavailableFrom !== (u.unavailableFrom || "").slice(0, 10) ||
                    edit.unavailableTo !== (u.unavailableTo || "").slice(0, 10) ||
                    edit.unavailableNote !== (u.unavailableNote || ""));
                const hasChanges =
                  salaryChanged || weekOffChanged || emailChanged || phoneChanged || seeAllChanged || routingChanged;

                return (
                  <tr key={u.id} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-2.5">
                      <div className="font-semibold text-navy">{u.name}</div>
                      {!u.active && (
                        <div className="text-[11px] text-red-600">Inactive</div>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="email"
                        value={edit.email}
                        onChange={(e) => updateEdit(u.id, "email", e.target.value)}
                        className={`w-56 rounded-xl border bg-white px-3 py-1.5 text-xs text-navy ${
                          emailChanged ? "border-primary" : "border-border"
                        }`}
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={edit.phone}
                        onChange={(e) => updateEdit(u.id, "phone", e.target.value)}
                        placeholder="Not set"
                        className={`w-36 rounded-xl border bg-white px-3 py-1.5 text-xs text-navy ${
                          phoneChanged ? "border-primary" : "border-border"
                        }`}
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-gray-100 px-2 py-1 font-mono text-xs tracking-widest text-navy">
                            {u.pin ?? "----"}
                          </span>
                          <button
                            onClick={() => pinAction(u.id, "reset")}
                            disabled={saving === u.id}
                            className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
                          >
                            Reset
                          </button>
                        </div>
                        {u.pinLocked ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-red-600">
                              Locked
                            </span>
                            <button
                              onClick={() => pinAction(u.id, "unlock")}
                              disabled={saving === u.id}
                              className="rounded-lg bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                            >
                              Unlock
                            </button>
                          </div>
                        ) : (
                          u.pinFailedCount > 0 && (
                            <span className="text-[11px] text-amber-600">
                              {u.pinFailedCount} failed attempt
                              {u.pinFailedCount === 1 ? "" : "s"}
                            </span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted">
                      {ROLE_LABELS[u.role] || u.role}
                    </td>
                    <td className="px-2 py-2.5">
                      <select
                        value={edit.weekOffDay}
                        onChange={(e) => updateEdit(u.id, "weekOffDay", e.target.value)}
                        className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs text-navy"
                      >
                        {WEEK_DAYS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2.5">
                      {canSeeAll ? (
                        <label
                          className="flex items-center gap-1.5 text-[11px] text-muted"
                          title="Read access to every lead, including leads another sales manager owns"
                        >
                          <input
                            type="checkbox"
                            checked={edit.seeAllLeads}
                            onChange={(e) => updateEdit(u.id, "seeAllLeads", e.target.checked)}
                            className={`h-3.5 w-3.5 rounded border-border accent-primary ${seeAllChanged ? "ring-2 ring-primary/40" : ""}`}
                          />
                          {edit.seeAllLeads ? "On" : "Off"}
                        </label>
                      ) : (
                        <span className="text-[11px] text-muted/60">n/a</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      {isSalesManager ? (
                        <div className="flex w-56 flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <label
                              className="flex items-center gap-1.5 text-[11px] font-semibold text-muted"
                              title="When off, grade routing skips this SM entirely"
                            >
                              <input
                                type="checkbox"
                                checked={edit.available}
                                onChange={(e) => updateEdit(u.id, "available", e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-border accent-primary"
                              />
                              {edit.available ? "Available" : "Unavailable"}
                            </label>
                            <select
                              value={edit.routingTier}
                              onChange={(e) => updateEdit(u.id, "routingTier", e.target.value)}
                              className="rounded-lg border border-border bg-white px-1.5 py-1 text-[11px] text-navy"
                              title="A leads go to commission SMs, B leads to salaried SMs"
                            >
                              {ROUTING_TIERS.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="date"
                              value={edit.unavailableFrom}
                              onChange={(e) => updateEdit(u.id, "unavailableFrom", e.target.value)}
                              title="Unavailable from (optional)"
                              className="w-full rounded-lg border border-border bg-white px-1.5 py-1 text-[11px] text-navy"
                            />
                            <span className="text-[11px] text-muted">to</span>
                            <input
                              type="date"
                              value={edit.unavailableTo}
                              onChange={(e) => updateEdit(u.id, "unavailableTo", e.target.value)}
                              title="Unavailable to (optional)"
                              className="w-full rounded-lg border border-border bg-white px-1.5 py-1 text-[11px] text-navy"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              value={edit.unavailableNote}
                              onChange={(e) => updateEdit(u.id, "unavailableNote", e.target.value)}
                              placeholder="Unavailable note (optional)"
                              className="w-full rounded-lg border border-border bg-white px-1.5 py-1 text-[11px] text-navy"
                            />
                            <input
                              type="number"
                              min={1}
                              value={edit.dailyVisitCap}
                              onChange={(e) => updateEdit(u.id, "dailyVisitCap", e.target.value)}
                              placeholder="Cap"
                              title="Daily visit cap (blank = the global setting)"
                              className="w-16 rounded-lg border border-border bg-white px-1.5 py-1 text-[11px] text-navy"
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted/60">n/a</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs text-muted">₹</span>
                        <input
                          type="number"
                          value={edit.baseSalary}
                          onChange={(e) => updateEdit(u.id, "baseSalary", e.target.value)}
                          placeholder="0"
                          min={0}
                          step={1000}
                          className="w-28 rounded-xl border border-border bg-white px-3 py-1.5 text-right text-xs text-navy"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        <button
                          onClick={() => saveUser(u.id)}
                          disabled={saving === u.id || !hasChanges}
                          className={`rounded-xl px-4 py-1.5 text-xs font-bold transition-colors ${
                            hasChanges
                              ? "bg-primary text-white hover:bg-secondary"
                              : "bg-gray-100 text-gray-400 cursor-not-allowed"
                          } disabled:opacity-50`}
                        >
                          {saving === u.id ? "..." : "Save"}
                        </button>
                        {u.active ? (
                          <button
                            onClick={() => deactivateUser(u)}
                            disabled={saving === u.id}
                            title="Keep all history, release open leads, stop routing"
                            className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-red-600">Former team member</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-primary/5 px-4 py-3 text-xs text-muted">
        <p>
          <strong className="text-primary">Login identifiers:</strong> email and
          phone are both used to sign in and must be unique across the team.
          Phone is the number their reset link and account are tied to - leave
          it blank only if the person has no number on file yet.
        </p>
        <p className="mt-1.5">
          <strong className="text-primary">Login PIN:</strong> read the 4-digit
          PIN here and hand it to the person. After 5 wrong attempts the account
          locks - use <strong>Unlock</strong> to let them retry, or{" "}
          <strong>Reset</strong> to issue a new PIN.
        </p>
        <p className="mt-1.5">
          <strong className="text-primary">Availability &amp; routing:</strong>{" "}
          grade A leads go to the commission tier, grade B to the salaried tier,
          and both only after a visit is booked. Unavailable SMs and SMs at their
          daily visit cap are skipped. Deactivating keeps all history but returns
          open leads to the assignment pool; accounts with history cannot be
          hard-deleted.
        </p>
        <p className="mt-1.5">
          <strong className="text-primary">Note:</strong> Changing a salary only
          affects future months. Past confirmed salary slips remain unchanged
          for historical accuracy.
        </p>
      </div>
    </div>
  );
}
