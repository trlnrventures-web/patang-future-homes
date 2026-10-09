"use client";

import { useCallback, useEffect, useState } from "react";

type ArchivedLead = {
  id: number;
  name: string;
  phone: string;
  source: string;
  status: string;
  deletedAt: string | null;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso;
  }
}

/**
 * Archive/restore tools. Deleting a lead only soft-deletes it, so this is the
 * one place it can be brought back. Duplicate merging (a destructive operation)
 * is intentionally not here yet.
 */
export default function DataToolsPanel() {
  const [leads, setLeads] = useState<ArchivedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/crm/api/data/archived-leads", { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setLeads(data.leads ?? []);
      setSelected(new Set());
    } catch {
      setErr("Could not load archived leads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const restore = async (ids: number[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/crm/api/data/archived-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Restore failed");
      setMsg(`Restored ${data.restored} lead${data.restored === 1 ? "" : "s"}. They are back on the board as New.`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-navy">Archived leads</h2>
          <p className="mt-0.5 text-[11px] text-soft">
            {leads.length} archived lead{leads.length === 1 ? "" : "s"}. Restoring returns them to the
            board as New.
          </p>
        </div>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => void restore([...selected])}
            disabled={busy}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-secondary disabled:opacity-50"
          >
            Restore selected ({selected.size})
          </button>
        )}
      </div>

      {msg && <p className="text-xs font-semibold text-green-700">{msg}</p>}
      {err && <p className="text-xs font-semibold text-red-700">{err}</p>}

      {loading ? (
        <p className="py-6 text-center text-sm text-muted">Loading...</p>
      ) : leads.length === 0 ? (
        <p className="rounded-xl bg-background px-3 py-6 text-center text-sm text-soft">
          Nothing archived. Deleting a lead moves it here instead of erasing it.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all archived leads"
                    checked={selected.size === leads.length && leads.length > 0}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(leads.map((l) => l.id)) : new Set())
                    }
                  />
                </th>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Phone</th>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">Archived</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-border/40 last:border-0">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${lead.name}`}
                      checked={selected.has(lead.id)}
                      onChange={() => toggle(lead.id)}
                    />
                  </td>
                  <td className="px-2 py-2 font-semibold text-navy">{lead.name}</td>
                  <td className="px-2 py-2 text-muted">{lead.phone}</td>
                  <td className="px-2 py-2 text-muted">{lead.source}</td>
                  <td className="px-2 py-2 text-muted">{formatWhen(lead.deletedAt)}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void restore([lead.id])}
                      disabled={busy}
                      className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-semibold text-navy hover:bg-primary/5 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-xs text-muted">
        Duplicate merging is not available yet; it permanently rewrites lead history, so it ships
        with its own review step.
      </div>
    </div>
  );
}
