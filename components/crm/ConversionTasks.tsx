"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { buildWhatsAppUrl } from "@/lib/crm/messages";

type Reminder = {
  visitId: number;
  leadId: number;
  leadName: string;
  phone: string;
  date: string;
  time: string;
  kind: "day_before" | "two_hour";
  overdue: boolean;
  message: string;
};

type NurtureTask = {
  followUpId: number;
  leadId: number;
  leadName: string;
  phone: string;
  reason: string;
  attempts: number;
  dormant: boolean;
  message: string;
};

type Payload = {
  reminders: Reminder[];
  nurture: { tasks: NurtureTask[]; capped: boolean; total: number };
  admin: {
    overdueReminders: Reminder[];
    overdueOutcomes: { visitId: number; leadId: number; date: string; time: string }[];
    needsRouting: { leadId: number; name: string; grade: string | null; status: string }[];
  } | null;
};

export default function ConversionTasks() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/crm/api/conversion/tasks");
      if (!res.ok) return;
      setData(await res.json());
    } catch {
      // Task feed is optional; the dashboard still renders.
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (leadId: number, body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/crm/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Could not save");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;

  const hasAnything =
    data.reminders.length > 0 ||
    data.nurture.tasks.length > 0 ||
    (data.admin &&
      (data.admin.overdueReminders.length > 0 ||
        data.admin.overdueOutcomes.length > 0 ||
        data.admin.needsRouting.length > 0));

  if (!hasAnything && !error) return null;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
      )}

      {data.reminders.length > 0 && (
        <section className="rounded-xl border border-border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-primary">Visit reminders</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {data.reminders.length}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.reminders.map((task) => (
              <div
                key={`${task.visitId}-${task.kind}`}
                className={`rounded-xl p-3 ${task.overdue ? "bg-red-50" : "bg-background"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy">
                      {task.kind === "day_before" ? "Day before" : "2 hours before"} · {task.leadName}
                    </p>
                    <p className="text-xs text-muted">
                      {task.date} {task.time}
                      {task.overdue ? " · overdue" : ""}
                    </p>
                  </div>
                  <Link
                    href={`/crm/leads/${task.leadId}`}
                    className="shrink-0 text-xs font-semibold text-primary hover:underline"
                  >
                    Open
                  </Link>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-slate-600">{task.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(task.leadId, { type: "reminder_done", visitId: task.visitId, kind: task.kind })
                    }
                    className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Mark done
                  </button>
                  {task.phone && (
                    <a
                      href={buildWhatsAppUrl(task.phone, task.message)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-semibold text-navy hover:bg-primary/5"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.nurture.tasks.length > 0 && (
        <section className="rounded-xl border border-border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-primary">Nurture re-contact</h2>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
              {data.nurture.tasks.length}
              {data.nurture.capped ? ` of ${data.nurture.total}` : ""}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.nurture.tasks.map((task) => (
              <div key={task.followUpId} className="rounded-xl bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy">{task.leadName}</p>
                    <p className="text-xs text-muted">
                      {task.reason} · attempt {task.attempts + 1}
                      {task.dormant ? " · dormant" : ""}
                    </p>
                  </div>
                  <Link
                    href={`/crm/leads/${task.leadId}`}
                    className="shrink-0 text-xs font-semibold text-primary hover:underline"
                  >
                    Open
                  </Link>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-slate-600">{task.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(task.leadId, { type: "nurture_contact", responded: true })}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Replied
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(task.leadId, { type: "nurture_contact", responded: false })}
                    className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-semibold text-navy hover:bg-primary/5 disabled:opacity-50"
                  >
                    No reply
                  </button>
                  {task.phone && (
                    <a
                      href={buildWhatsAppUrl(task.phone, task.message)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-semibold text-navy hover:bg-primary/5"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.admin && (
        <>
          {data.admin.needsRouting.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-base font-bold text-amber-900">
                Needs routing ({data.admin.needsRouting.length})
              </h2>
              <p className="text-xs text-amber-800">
                Graded A/B with a booked visit but no available SM in the tier.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {data.admin.needsRouting.slice(0, 8).map((l) => (
                  <li key={l.leadId}>
                    <Link href={`/crm/leads/${l.leadId}`} className="font-semibold text-amber-900 hover:underline">
                      {l.name}
                    </Link>
                    <span className="text-amber-800"> · {l.grade || "ungraded"} · {l.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.admin.overdueOutcomes.length > 0 && (
            <section className="rounded-xl border border-red-200 bg-red-50 p-4">
              <h2 className="text-base font-bold text-red-900">
                Visit outcomes overdue ({data.admin.overdueOutcomes.length})
              </h2>
              <ul className="mt-2 space-y-1 text-sm">
                {data.admin.overdueOutcomes.slice(0, 8).map((v) => (
                  <li key={v.visitId}>
                    <Link href={`/crm/leads/${v.leadId}`} className="font-semibold text-red-900 hover:underline">
                      Visit on {v.date} {v.time}
                    </Link>
                    <span className="text-red-800"> · no outcome logged</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.admin.overdueReminders.length > 0 && (
            <section className="rounded-xl border border-red-200 bg-red-50 p-4">
              <h2 className="text-base font-bold text-red-900">
                Reminders overdue ({data.admin.overdueReminders.length})
              </h2>
              <ul className="mt-2 space-y-1 text-sm">
                {data.admin.overdueReminders.slice(0, 8).map((r) => (
                  <li key={`${r.visitId}-${r.kind}`}>
                    <Link href={`/crm/leads/${r.leadId}`} className="font-semibold text-red-900 hover:underline">
                      {r.leadName}
                    </Link>
                    <span className="text-red-800">
                      {" "}
                      · {r.kind === "day_before" ? "day-before" : "two-hour"} for {r.date} {r.time}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
