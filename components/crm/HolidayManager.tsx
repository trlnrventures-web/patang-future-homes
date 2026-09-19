"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

type Holiday = { id: number; date: string; name: string };

export default function HolidayManager({ holidays, today }: { holidays: Holiday[]; today: string }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const send = async (payload: Record<string, unknown>, okMessage: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/crm/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || okMessage);
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-muted">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
          />
        </label>
        <label className="min-w-[12rem] flex-1 text-xs font-semibold text-muted">
          Holiday name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Diwali"
            className="mt-1 block w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
          />
        </label>
        <Button
          size="sm"
          disabled={busy || !date || !name.trim()}
          onClick={async () => {
            const ok = await send({ date, name }, "Could not add holiday");
            if (ok) {
              setDate("");
              setName("");
            }
          }}
        >
          Add holiday
        </Button>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      <div className="mt-3 space-y-1.5">
        {holidays.length === 0 && <p className="text-xs text-soft">No holidays added yet.</p>}
        {holidays.map((h) => (
          <div
            key={h.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2"
          >
            <span className="text-sm text-navy">
              <span className="font-semibold">{h.date}</span> · {h.name}
              {h.date === today && (
                <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                  TODAY
                </span>
              )}
            </span>
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Remove holiday "${h.name}" on ${h.date}?`)) {
                  send({ action: "remove", id: h.id }, "Could not remove holiday");
                }
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
