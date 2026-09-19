"use client";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

type SnapshotLead = {
  slaStatus?: string | null;
  hasOverdueFollowUp?: boolean;
  nextFollowUpIso?: string | null;
};

type Props = {
  leads: SnapshotLead[];
  onStartQueue?: () => void;
};

function istToday(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export default function InboxSnapshot({ leads, onStartQueue }: Props) {
  const today = istToday();
  let overdue = 0;
  let slaLate = 0;
  let dueToday = 0;
  for (const l of leads) {
    if (l.hasOverdueFollowUp) overdue += 1;
    if (l.slaStatus === "overdue") slaLate += 1;
    const due = l.nextFollowUpIso;
    if (due && !l.hasOverdueFollowUp && new Date(due).getTime() + IST_OFFSET_MS >= 0) {
      const dueIst = new Date(new Date(due).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
      if (dueIst === today) dueToday += 1;
    }
  }

  const stats = [
    { label: "Leads in View", value: leads.length, cls: "" },
    { label: "Overdue Follow-up", value: overdue, cls: overdue > 0 ? "text-red-600" : "" },
    { label: "SLA Breach (First-Call)", value: slaLate, cls: slaLate > 0 ? "text-red-600" : "" },
    { label: "Due Today", value: dueToday, cls: dueToday > 0 ? "text-primary" : "" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2.5">
          <span className={`text-xl font-bold ${s.cls}`}>{s.value}</span>
          <span className="text-[10px] font-semibold leading-tight text-soft">{s.label}</span>
        </div>
      ))}
      {onStartQueue ? (
        <button
          onClick={onStartQueue}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-secondary"
        >
          Start Call Queue
        </button>
      ) : (
        <div className="hidden items-center justify-end rounded-xl sm:flex">
          <span className="text-[10px] text-soft">Live summary of the current view</span>
        </div>
      )}
    </div>
  );
}