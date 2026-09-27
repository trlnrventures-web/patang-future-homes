"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LEAD_FUNNEL_STAGES, LEAD_STATUS_LABELS, bhkLabel } from "@/lib/crm/leads";

export type BoardLead = {
  id: number;
  name: string;
  phone: string;
  bhk: string | null;
  status: string;
  daysInStage: number;
  assignedSmName?: string;
};

type Props = {
  leads: BoardLead[];
  /** Callers on a handed-off lead see the board read-only. */
  readOnly?: boolean;
  /** Preserves the list's filters/sort so Previous/Next Lead works from here too. */
  hrefQuery?: string;
  onChanged: () => void;
};

function stageOf(status: string) {
  return LEAD_FUNNEL_STAGES.find((s) => s.matches.includes(status)) || null;
}

export default function LeadBoard({ leads, readOnly, hrefQuery = "", onChanged }: Props) {
  const router = useRouter();
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const byStage = useMemo(() => {
    const grouped: Record<string, BoardLead[]> = {};
    for (const stage of LEAD_FUNNEL_STAGES) grouped[stage.key] = [];
    // Leads that left the funnel (lost / invalid / dnc) have no column of their
    // own and are not shown — the board is a view of the live funnel.
    for (const lead of leads) {
      const stage = stageOf(lead.status);
      if (stage) grouped[stage.key].push(lead);
    }
    for (const stage of LEAD_FUNNEL_STAGES) {
      grouped[stage.key].sort((a, b) => b.daysInStage - a.daysInStage);
    }
    return grouped;
  }, [leads]);

  const moveLead = useCallback(
    async (lead: BoardLead, targetStatus: string) => {
      if (readOnly || lead.status === targetStatus) return;
      setPendingId(lead.id);
      setError("");
      try {
        const res = await fetch(`/crm/api/leads/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // Same server-side status-change path the detail page uses: it updates
          // the stage, stamps stage_changed_at and logs a status_change activity.
          body: JSON.stringify({ status: targetStatus }),
        });
        if (!res.ok) throw new Error("failed");
        setError("");
        onChanged();
      } catch {
        setError(`Could not move ${lead.name}. Please try again.`);
      } finally {
        setPendingId(null);
      }
    },
    [onChanged, readOnly]
  );

  const totalShown = LEAD_FUNNEL_STAGES.reduce((n, s) => n + byStage[s.key].length, 0);
  const hidden = leads.length - totalShown;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted">
        <span>
          {totalShown} lead{totalShown === 1 ? "" : "s"} on the board
        </span>
        {hidden > 0 && <span>· {hidden} closed (lost / invalid) not shown</span>}
        {!readOnly && <span>· Drag a card to another column to change its stage</span>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        {LEAD_FUNNEL_STAGES.map((stage) => {
          const cards = byStage[stage.key];
          const isOver = overStage === stage.key;
          return (
            <section
              key={stage.key}
              onDragOver={(e) => {
                if (readOnly || draggingId === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overStage !== stage.key) setOverStage(stage.key);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage.key ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                const id = Number(e.dataTransfer.getData("text/plain"));
                setDraggingId(null);
                const lead = leads.find((l) => l.id === id);
                if (lead) void moveLead(lead, stage.status);
              }}
              aria-label={`${stage.label} — ${cards.length} lead${cards.length === 1 ? "" : "s"}`}
              className={`flex w-[16.5rem] shrink-0 flex-col rounded-2xl border bg-background/60 transition-colors lg:w-auto lg:min-w-[13.5rem] lg:flex-1 ${
                isOver ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                <h3 className="text-xs font-bold text-navy">{stage.label}</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-muted">
                  {cards.length}
                </span>
              </header>
              <div className="flex max-h-[60vh] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {cards.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[11px] text-soft">
                    {isOver ? "Drop here" : "No leads"}
                  </p>
                ) : (
                  cards.map((lead) => (
                    <BoardCard
                      key={lead.id}
                      lead={lead}
                      dragging={draggingId === lead.id}
                      pending={pendingId === lead.id}
                      readOnly={readOnly}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(lead.id));
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(lead.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverStage(null);
                      }}
                      onOpen={() => router.push(`/crm/leads/${lead.id}${hrefQuery}`)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({
  lead,
  dragging,
  pending,
  readOnly,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  lead: BoardLead;
  dragging: boolean;
  pending: boolean;
  readOnly?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const stale = lead.daysInStage >= 7;
  return (
    <article
      draggable={!readOnly && !pending}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${lead.name}, ${LEAD_STATUS_LABELS[lead.status] || lead.status}`}
      className={`cursor-pointer rounded-xl border bg-white p-2.5 text-left transition-shadow ${
        dragging ? "border-primary opacity-40" : "border-border hover:border-primary/40 hover:shadow-sm"
      } ${pending ? "animate-pulse" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-navy">
          {lead.name}
        </span>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            stale ? "bg-red-50 text-red-700" : "bg-background text-muted"
          }`}
          title="Days in this stage"
        >
          {lead.daysInStage}d
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-soft">
        <span className="truncate">{lead.phone || "—"}</span>
        {lead.bhk && (
          <span className="shrink-0 rounded-full border border-border bg-background px-1.5 py-0.5 font-medium text-muted">
            {bhkLabel(lead.bhk)}
          </span>
        )}
      </div>
      {lead.assignedSmName && (
        <div className="mt-1 truncate text-[10px] font-semibold text-primary">
          SM: {lead.assignedSmName}
        </div>
      )}
    </article>
  );
}
