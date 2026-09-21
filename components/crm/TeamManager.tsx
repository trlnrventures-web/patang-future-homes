"use client";

import { useState, useEffect, useCallback } from "react";

type TeamUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  active: boolean;
  weekOffDay: string;
  baseSalary: number | null;
};

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Owner / Admin",
  sales_head: "Sales Head",
  sales_manager: "Sales Manager",
  caller: "Caller",
  marketing: "Marketing",
};

export default function TeamManager() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [edits, setEdits] = useState<Record<number, { baseSalary: string; weekOffDay: string }>>({});

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
        const initial: Record<number, { baseSalary: string; weekOffDay: string }> = {};
        for (const u of json.users) {
          initial[u.id] = {
            baseSalary: u.baseSalary != null ? String(u.baseSalary) : "",
            weekOffDay: u.weekOffDay || "Tuesday",
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
      const edit = edits[userId];
      const body: Record<string, unknown> = { userId };
      if (edit.baseSalary !== "") {
        body.baseSalary = Number(edit.baseSalary);
      } else {
        body.baseSalary = null;
      }
      body.weekOffDay = edit.weekOffDay;

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

  const updateEdit = (userId: number, field: "baseSalary" | "weekOffDay", value: string) => {
    setEdits((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value },
    }));
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
                <th className="px-2 py-2">Role</th>
                <th className="px-2 py-2">Week Off</th>
                <th className="px-2 py-2 text-right">Base Monthly Salary</th>
                <th className="px-2 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const edit = edits[u.id] || { baseSalary: "", weekOffDay: "Tuesday" };
                const salaryChanged =
                  edit.baseSalary !== (u.baseSalary != null ? String(u.baseSalary) : "");
                const weekOffChanged = edit.weekOffDay !== u.weekOffDay;
                const hasChanges = salaryChanged || weekOffChanged;

                return (
                  <tr key={u.id} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-2.5">
                      <div className="font-semibold text-navy">{u.name}</div>
                      <div className="text-[11px] text-soft">{u.email}</div>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-primary/5 px-4 py-3 text-xs text-muted">
        <strong className="text-primary">Note:</strong> Changing a salary only affects future months.
        Past confirmed salary slips remain unchanged for historical accuracy.
      </div>
    </div>
  );
}
