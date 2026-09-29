"use client";

import { useEffect, useRef } from "react";
import { sourceLabel } from "@/lib/crm/board-shared";

/**
 * Client-side filter state for the Leads board.
 *
 * Everything here is a pure cut over rows the board has already fetched, so no
 * schema, API or query changes are needed. Choices persist in localStorage per
 * user so each teammate gets their own defaults.
 */

export type LeadFilters = {
  smIds: number[];
  callerIds: number[];
  source: string;
  project: string;
  location: string;
  bhk: string;
  budgetMin: string;
  created: string;
  unassigned: boolean;
};

export const EMPTY_FILTERS: LeadFilters = {
  smIds: [],
  callerIds: [],
  source: "",
  project: "",
  location: "",
  bhk: "",
  budgetMin: "",
  created: "",
  unassigned: false,
};

const STORAGE_PREFIX = "pfh.leadFilters.";

export function storageKey(userId: number | null): string {
  return `${STORAGE_PREFIX}${userId ?? "anon"}`;
}

export function loadFilters(userId: number | null): LeadFilters {
  if (typeof window === "undefined") return EMPTY_FILTERS;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw) as Partial<LeadFilters>;
    return {
      ...EMPTY_FILTERS,
      ...parsed,
      smIds: Array.isArray(parsed.smIds) ? parsed.smIds : [],
      callerIds: Array.isArray(parsed.callerIds) ? parsed.callerIds : [],
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

export function saveFilters(userId: number | null, f: LeadFilters): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(f));
  } catch {
    /* private mode / quota - filters simply do not persist */
  }
}

/** Number of filters a user has actively set, shown on the Filters button. */
export function countActive(f: LeadFilters): number {
  let n = 0;
  if (f.smIds.length) n++;
  if (f.callerIds.length) n++;
  if (f.source) n++;
  if (f.project) n++;
  if (f.location) n++;
  if (f.bhk) n++;
  if (f.budgetMin) n++;
  if (f.created) n++;
  if (f.unassigned) n++;
  return n;
}

/** Human-readable chips for the applied filters, each individually removable. */
export type FilterChip = { key: keyof LeadFilters; value: string; label: string };

export function activeChips(
  f: LeadFilters,
  names: { sm: Record<number, string>; caller: Record<number, string> }
): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const id of f.smIds) {
    chips.push({ key: "smIds", value: String(id), label: `SM: ${names.sm[id] || id}` });
  }
  for (const id of f.callerIds) {
    chips.push({ key: "callerIds", value: String(id), label: `Caller: ${names.caller[id] || id}` });
  }
  if (f.source) chips.push({ key: "source", value: f.source, label: `Source: ${sourceLabel(f.source)}` });
  if (f.project) chips.push({ key: "project", value: f.project, label: `Project: ${f.project}` });
  if (f.location) chips.push({ key: "location", value: f.location, label: `Location: ${f.location}` });
  if (f.bhk) chips.push({ key: "bhk", value: f.bhk, label: `BHK: ${f.bhk}` });
  if (f.budgetMin) chips.push({ key: "budgetMin", value: f.budgetMin, label: `Budget from ${f.budgetMin}` });
  if (f.created) chips.push({ key: "created", value: f.created, label: `Created: ${f.created}` });
  if (f.unassigned) chips.push({ key: "unassigned", value: "1", label: "Unassigned only" });
  return chips;
}

export function removeChip(f: LeadFilters, chip: FilterChip): LeadFilters {
  const next = { ...f };
  if (chip.key === "smIds" || chip.key === "callerIds") {
    const num = Number(chip.value);
    const field = chip.key;
    next[field] = f[field].filter((id) => id !== num) as never;
  } else if (chip.key === "unassigned") {
    next.unassigned = false;
  } else {
    (next as Record<string, unknown>)[chip.key] = "";
  }
  return next;
}

export type LeadFilterRow = {
  id: number;
  source: string;
  originalProject: string | null;
  preferredProject?: string | null;
  location?: string | null;
  bhk: string | null;
  budget?: string | null;
  assignedSmId?: number | null;
  assignedCallerId?: number | null;
  createdAt: string;
};

const CREATED_RANGES: Record<string, (iso: string) => boolean> = {
  today: (iso) => iso.slice(0, 10) === new Date().toLocaleDateString("en-CA"),
  "7d": (iso) => Date.now() - new Date(iso).getTime() <= 7 * 86400000,
  "30d": (iso) => Date.now() - new Date(iso).getTime() <= 30 * 86400000,
};

/** Strips digits and units so "2 BHK", "2BHK" and "2" all match the filter "2". */
function normBhk(v: string | null | undefined): string {
  return (v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Budget is free text ("85 L", "1.2 Cr") and almost never populated, so this
 *  only matches when both sides carry a parseable number. */
function budgetAtLeast(row: LeadFilterRow, min: string): boolean {
  const target = Number(min.replace(/[^0-9.]/g, ""));
  if (!target) return true;
  const raw = (row.budget || "").toLowerCase();
  const num = Number((raw.match(/[0-9.]+/) || [""])[0]);
  if (!num) return false;
  // Values are written in lakhs/crores; normalise to lakhs.
  const lakhs = raw.includes("cr") ? num * 100 : num;
  return lakhs >= target;
}

export function applyFilters<T extends LeadFilterRow>(
  rows: T[],
  f: LeadFilters
): T[] {
  const createdTest = f.created ? CREATED_RANGES[f.created] : null;
  return rows.filter((r) => {
    if (f.unassigned) {
      if (r.assignedSmId && r.assignedCallerId) return false;
    } else {
      if (f.smIds.length && !f.smIds.includes(r.assignedSmId as number)) return false;
      if (f.callerIds.length && !f.callerIds.includes(r.assignedCallerId as number)) return false;
    }
    if (f.source && (r.source || "") !== f.source) return false;
    if (f.project) {
      const p = r.preferredProject || r.originalProject || "";
      if (p !== f.project) return false;
    }
    if (f.location && (r.location || "") !== f.location) return false;
    if (f.bhk) {
      const b = normBhk(f.bhk);
      if (!normBhk(r.bhk).startsWith(b)) return false;
    }
    if (f.budgetMin && !budgetAtLeast(r, f.budgetMin)) return false;
    if (createdTest) {
      if (!r.createdAt || !createdTest(r.createdAt)) return false;
    }
    return true;
  });
}

/** Distinct values for each dropdown, so the panel never offers a value that
 *  no lead actually has. */
export function filterOptions(rows: LeadFilterRow[]) {
  const project = new Set<string>();
  const location = new Set<string>();
  const bhk = new Map<string, string>();
  const source = new Set<string>();
  for (const r of rows) {
    const p = r.preferredProject || r.originalProject;
    if (p) project.add(p);
    if (r.location) location.add(r.location);
    if (r.bhk) bhk.set(normBhk(r.bhk), r.bhk);
    if (r.source) source.add(r.source);
  }
  const col = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return {
    projects: col(project),
    locations: col(location),
    bhk: [...bhk.values()].sort((a, b) => a.localeCompare(b)),
    sources: col(source),
  };
}

/** Confines Tab to the panel while it is open, and restores focus on close. */
export function useFocusTrap(open: boolean, onEscape?: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const escapeRef = useRef(onEscape);

  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((n) => !n.hasAttribute("disabled"));
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        escapeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open]);

  return ref;
}
