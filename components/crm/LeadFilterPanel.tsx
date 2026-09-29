"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EMPTY_FILTERS,
  activeChips,
  applyFilters,
  countActive,
  filterOptions,
  loadFilters,
  removeChip,
  saveFilters,
  useFocusTrap,
  type FilterChip,
  type LeadFilters,
} from "@/lib/crm/lead-filters";
import { sourceLabel, type BoardLead } from "@/lib/crm/board-shared";

type Person = { id: number; name: string };

type Props = {
  leads: BoardLead[];
  userId: number | null;
  /** The applied filter set, owned by the board so the two views stay in sync. */
  filters: LeadFilters;
  onFiltersChange: (next: LeadFilters) => void;
  /** Result count for the current filters, shown inside the panel. */
  resultCount: number;
};

/** Multi-select pill group, so several owners can be chosen at once. */
function MultiPick({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Person[];
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  if (!options.length) {
    return (
      <div>
        <Label>{label}</Label>
        <p className="text-xs text-soft">No owners found</p>
      </div>
    );
  }
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((x) => x !== o.id) : [...selected, o.id])}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                on
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-white text-muted hover:border-primary/40 hover:text-primary"
              }`}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-bold text-navy">{children}</div>;
}

function Select({
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyHint,
  labels,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder: string;
  emptyHint?: string;
  labels?: Record<string, string>;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {options.length === 0 ? (
        <p className="text-xs text-soft">{emptyHint || `No ${label.toLowerCase()} data yet`}</p>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none transition-colors focus:border-primary"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {labels?.[o] || o}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export default function LeadFilterPanel({
  leads,
  userId,
  filters: applied,
  onFiltersChange,
  resultCount,
}: Props) {
  const [open, setOpen] = useState(false);
  // `applied` (owned by the board) drives the results; `draft` is the editable
  // copy inside the panel, so closing without applying changes nothing.
  const [draft, setDraft] = useState<LeadFilters>(applied);
  const panelRef = useFocusTrap(open, () => setOpen(false));

  // Restore this user's saved filters once we know who they are, then push the
  // result up to the board.
  useEffect(() => {
    if (userId == null) return;
    const saved = loadFilters(userId);
    onFiltersChange(saved);
  }, [userId, onFiltersChange]);

  const people = useMemo(() => {
    const sm = new Map<number, string>();
    const caller = new Map<number, string>();
    for (const l of leads) {
      if (l.assignedSmId && l.assignedSmName) sm.set(l.assignedSmId, l.assignedSmName);
      if (l.assignedCallerId && l.assignedCallerName) {
        caller.set(l.assignedCallerId, l.assignedCallerName);
      }
    }
    return {
      sm: Object.fromEntries(sm),
      caller: Object.fromEntries(caller),
      smList: [...sm].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      callerList: [...caller]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [leads]);

  const options = useMemo(() => filterOptions(leads), [leads]);
  const activeCount = countActive(applied);
  const chips = useMemo(
    () => activeChips(applied, { sm: people.sm, caller: people.caller }),
    [applied, people.sm, people.caller]
  );

  const budgetRows = useMemo(() => leads.filter((l) => l.budget).length, [leads]);
  const sourceLabels = useMemo(
    () => Object.fromEntries(options.sources.map((s) => [s, sourceLabel(s)])),
    [options.sources]
  );

  const dropChip = (chip: FilterChip) => {
    const next = removeChip(applied, chip);
    onFiltersChange(next);
    setDraft(next);
    saveFilters(userId, next);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setDraft(applied);
            setOpen(true);
          }}
          className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
            activeCount
              ? "border-primary bg-primary text-white"
              : "border-border bg-white text-muted hover:border-primary/40 hover:text-primary"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" />
          </svg>
          Filters
          {activeCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                activeCount ? "bg-white/25 text-white" : "bg-primary text-white"
              }`}
            >
              {activeCount}
            </span>
          )}
        </button>

        {chips.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <button
                key={`${c.key}-${c.value}`}
                type="button"
                onClick={() => dropChip(c)}
                className="flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-xs font-semibold text-primary"
              >
                {c.label}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3 w-3">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onFiltersChange(EMPTY_FILTERS);
                setDraft(EMPTY_FILTERS);
                saveFilters(userId, EMPTY_FILTERS);
              }}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-muted underline-offset-2 hover:text-primary hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-navy/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filter leads"
            className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl sm:max-w-md"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
              <div>
                <h2 className="text-base font-bold text-navy">Filters</h2>
                <p className="text-[11px] text-muted">
                  {resultCount} of {leads.length} leads
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-soft hover:bg-background hover:text-navy"
                aria-label="Close filters"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <MultiPick
                label="Sales Manager"
                options={people.smList}
                selected={draft.smIds}
                onChange={(smIds) => setDraft((d) => ({ ...d, smIds }))}
              />
              <MultiPick
                label="Caller"
                options={people.callerList}
                selected={draft.callerIds}
                onChange={(callerIds) => setDraft((d) => ({ ...d, callerIds }))}
              />
              <Select
                label="Source"
                value={draft.source}
                options={options.sources}
                onChange={(source) => setDraft((d) => ({ ...d, source }))}
                placeholder="Any source"
                labels={sourceLabels}
                emptyHint="No source recorded on any lead yet"
              />
              <Select
                label="Project"
                value={draft.project}
                options={options.projects}
                onChange={(project) => setDraft((d) => ({ ...d, project }))}
                placeholder="Any project"
              />
              <Select
                label="Location"
                value={draft.location}
                options={options.locations}
                onChange={(location) => setDraft((d) => ({ ...d, location }))}
                placeholder="Any location"
              />
              <Select
                label="BHK / Configuration"
                value={draft.bhk}
                options={options.bhk}
                onChange={(bhk) => setDraft((d) => ({ ...d, bhk }))}
                placeholder="Any configuration"
              />

              <div>
                <Label>Budget (from, in lakhs)</Label>
                {budgetRows === 0 ? (
                  <p className="text-xs text-soft">
                    No budget data yet - this filter stays inactive until leads have a budget.
                  </p>
                ) : (
                  <input
                    type="number"
                    min={0}
                    value={draft.budgetMin}
                    onChange={(e) => setDraft((d) => ({ ...d, budgetMin: e.target.value }))}
                    placeholder="e.g. 50"
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none transition-colors focus:border-primary"
                  />
                )}
              </div>

              <div>
                <Label>Created</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: "", label: "Any time" },
                    { key: "today", label: "Today" },
                    { key: "7d", label: "Last 7 days" },
                    { key: "30d", label: "Last 30 days" },
                  ].map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      aria-pressed={draft.created === o.key}
                      onClick={() => setDraft((d) => ({ ...d, created: o.key }))}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        draft.created === o.key
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-white text-muted hover:border-primary/40 hover:text-primary"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-background/40 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={draft.unassigned}
                  onChange={(e) => setDraft((d) => ({ ...d, unassigned: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm font-semibold text-navy">Unassigned leads only</span>
              </label>
            </div>

            <div className="flex gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setDraft(EMPTY_FILTERS)}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted hover:border-primary/40 hover:text-primary"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => {
                  onFiltersChange(draft);
                  saveFilters(userId, draft);
                  setOpen(false);
                }}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-secondary"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export { applyFilters };
