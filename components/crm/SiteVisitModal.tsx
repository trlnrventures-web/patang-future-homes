"use client";

import { useState } from "react";
import { Badge, Button } from "./ui";

export type RecommendedProperty = {
  slug: string;
  title: string;
};

export type ShownProperty = {
  slug?: string;
  title: string;
  shown: boolean;
  added?: boolean;
};

export type VisitRecord = {
  id: number;
  projectId: string | null;
  date: string;
  time: string;
  status: string;
  meetingPoint?: string | null;
  smName?: string;
  propertyShown?: string | null;
  propertiesShown?: string | null;
  recommendedProperties?: string | null;
};

export const ACTIVE_VISIT_STATUSES = ["proposed", "booked", "confirmed", "arrived"];

export function isActiveVisit(status: string): boolean {
  return ACTIVE_VISIT_STATUSES.includes(status);
}

export function parseRecommended(raw?: string | null): RecommendedProperty[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecommendedProperty[]) : [];
  } catch {
    return [];
  }
}

export function parseShown(raw?: string | null): ShownProperty[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ShownProperty[]) : [];
  } catch {
    return [];
  }
}

export function shownSummary(list: ShownProperty[]): string {
  return list
    .map((p) =>
      p.added
        ? `+ ${p.title} (added)`
        : p.shown
          ? `${p.title} ✓`
          : `${p.title} ✗ (not shown)`
    )
    .join(", ");
}

export function visitStatusMeta(status: string): { label: string; cls: string } {
  switch (status) {
    case "proposed":
      return { label: "Proposed", cls: "bg-cyan-100 text-cyan-800" };
    case "booked":
      return { label: "Booked", cls: "bg-teal-100 text-teal-800" };
    case "confirmed":
      return { label: "Confirmed", cls: "bg-teal-200 text-teal-900" };
    case "arrived":
      return { label: "Arrived", cls: "bg-sky-100 text-sky-800" };
    case "visit_done":
      return { label: "Visit Done", cls: "bg-green-100 text-green-800" };
    case "no_show":
      return { label: "No Show", cls: "bg-red-100 text-red-700" };
    case "cancelled":
      return { label: "Cancelled", cls: "bg-slate-100 text-slate-600" };
    default:
      return { label: status || "—", cls: "bg-background text-muted" };
  }
}

type BookPayload = {
  visitDate: string;
  visitTime: string;
  projectId: string;
  meetingPoint: string;
  notes: string;
  recommendedProperties: RecommendedProperty[];
};

type Props = {
  visit: VisitRecord | null;
  recommendations: RecommendedProperty[];
  propertyOptions: string[];
  defaults: { date: string; time: string; project: string; meetingPoint: string };
  initialView?: "book" | "manage";
  busy: boolean;
  onClose: () => void;
  onBook: (payload: BookPayload) => void;
  onStatus: (type: string, visitId?: number) => void;
  onDone: (visitId: number, propertiesShown: ShownProperty[]) => void;
};

export default function SiteVisitModal({
  visit,
  recommendations,
  propertyOptions,
  defaults,
  initialView,
  busy,
  onClose,
  onBook,
  onStatus,
  onDone,
}: Props) {
  const active = visit ? isActiveVisit(visit.status) : false;
  const [view, setView] = useState<"manage" | "book" | "done">(
    initialView ?? (active ? "manage" : "book")
  );

  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time || "11:00");
  const [projectTitle, setProjectTitle] = useState(
    defaults.project || recommendations[0]?.title || ""
  );
  const [meetingPoint, setMeetingPoint] = useState(defaults.meetingPoint);
  const [notes, setNotes] = useState("");

  const snapshot = parseRecommended(visit?.recommendedProperties);
  const doneList = snapshot.length > 0 ? snapshot : recommendations;
  const [marks, setMarks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(doneList.map((r) => [r.title, false]))
  );
  const [added, setAdded] = useState<string[]>([]);
  const [addInput, setAddInput] = useState("");

  const shownCount =
    doneList.filter((r) => marks[r.title]).length + added.length;

  const existingShown = parseShown(visit?.propertiesShown);
  const existingSummary =
    existingShown.length > 0
      ? shownSummary(existingShown)
      : visit?.propertyShown || "";

  function addExtra() {
    const value = addInput.trim();
    if (!value) return;
    if (added.includes(value)) {
      setAddInput("");
      return;
    }
    setAdded((prev) => [...prev, value]);
    setAddInput("");
  }

  function submitDone() {
    if (!visit || shownCount === 0) return;
    const list: ShownProperty[] = [
      ...doneList.map((r) => ({
        slug: r.slug,
        title: r.title,
        shown: !!marks[r.title],
      })),
      ...added.map((title) => ({ title, shown: true, added: true })),
    ];
    onDone(visit.id, list);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-primary">
              {view === "book"
                ? "Book Site Visit"
                : view === "done"
                  ? "Confirm Properties Shown"
                  : "Site Visit"}
            </h3>
            {view === "manage" && visit && (
              <p className="mt-1 text-xs text-muted">
                {visit.date}
                {visit.time ? ` · ${visit.time}` : ""}
                {visit.projectId ? ` · ${visit.projectId}` : ""}
              </p>
            )}
            {view === "done" && (
              <p className="mt-1 text-xs text-muted">
                Mark every property shown on this visit. This is required to
                close the visit.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-lg leading-none text-muted hover:bg-background"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {view === "book" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-muted">
                Date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Time
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
                />
              </label>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-muted">
                Recommended properties
              </div>
              {recommendations.length === 0 ? (
                <p className="text-xs text-soft">
                  No recommendations yet — pick any property below.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {recommendations.map((r) => {
                    const selected = projectTitle === r.title;
                    return (
                      <button
                        key={r.slug || r.title}
                        type="button"
                        onClick={() => setProjectTitle(r.title)}
                        className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                          selected
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-white text-navy hover:bg-background"
                        }`}
                      >
                        <div className="font-semibold">{r.title}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="block text-xs font-semibold text-muted">
              Property for this visit
              <input
                list="visit-property-options"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="Pick a recommendation or search another"
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
              />
              <datalist id="visit-property-options">
                {propertyOptions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <span className="mt-1 block text-[10px] font-normal text-soft">
                Not in the list? Type a different property name.
              </span>
            </label>

            <label className="block text-xs font-semibold text-muted">
              Meeting point
              <input
                value={meetingPoint}
                onChange={(e) => setMeetingPoint(e.target.value)}
                placeholder="Project site, Vasai"
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
              />
            </label>

            <label className="block text-xs font-semibold text-muted">
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
              />
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="success"
                disabled={busy || !date || !time || !projectTitle.trim()}
                onClick={() =>
                  onBook({
                    visitDate: date,
                    visitTime: time,
                    projectId: projectTitle.trim(),
                    meetingPoint,
                    notes,
                    recommendedProperties: recommendations,
                  })
                }
              >
                Book Visit
              </Button>
            </div>
          </div>
        )}

        {view === "manage" && visit && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={visitStatusMeta(visit.status).cls}>
                {visitStatusMeta(visit.status).label}
              </Badge>
              {visit.smName && (
                <span className="text-xs text-muted">SM: {visit.smName}</span>
              )}
            </div>
            {visit.meetingPoint && (
              <p className="text-xs text-muted">
                Meeting point: {visit.meetingPoint}
              </p>
            )}
            {existingSummary && (
              <div className="rounded-xl border border-border bg-background p-3 text-xs text-navy">
                <span className="font-semibold">Shown: </span>
                {existingSummary}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(visit.status === "proposed" || visit.status === "booked") && (
                <Button
                  variant="success"
                  size="sm"
                  disabled={busy}
                  onClick={() => onStatus("visit_confirmed", visit.id)}
                >
                  Confirm Visit
                </Button>
              )}
              {visit.status === "confirmed" && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onStatus("visit_arrived", visit.id)}
                >
                  Mark Arrived
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => setView("done")}
              >
                Visit Done — Tag Properties
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() => onStatus("visit_no_show", visit.id)}
              >
                No Show
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onStatus("visit_cancelled", visit.id)}
              >
                Cancel Visit
              </Button>
            </div>
          </div>
        )}

        {view === "manage" && !active && visit && (
          <div className="mt-4 border-t border-border pt-4">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setView("book")}
            >
              Book Another Visit
            </Button>
          </div>
        )}

        {view === "done" && visit && (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold text-muted">
                Recommended properties
              </div>
              {doneList.length === 0 ? (
                <p className="text-xs text-soft">
                  No recommendations on record. Add the property shown below.
                </p>
              ) : (
                <div className="space-y-2">
                  {doneList.map((r) => {
                    const shown = !!marks[r.title];
                    return (
                      <div
                        key={r.slug || r.title}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm font-semibold text-navy">
                          {r.title}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setMarks((m) => ({ ...m, [r.title]: true }))
                            }
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                              shown
                                ? "bg-green-600 text-white"
                                : "bg-background text-muted hover:bg-green-50"
                            }`}
                          >
                            Shown ✓
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setMarks((m) => ({ ...m, [r.title]: false }))
                            }
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                              !shown
                                ? "bg-slate-200 text-slate-700"
                                : "bg-background text-muted hover:bg-slate-100"
                            }`}
                          >
                            Not shown ✗
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-muted">
                Add another property shown
              </div>
              <div className="flex gap-2">
                <input
                  list="done-property-options"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addExtra();
                    }
                  }}
                  placeholder="Search property..."
                  className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
                />
                <datalist id="done-property-options">
                  {propertyOptions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!addInput.trim()}
                  onClick={addExtra}
                >
                  Add
                </Button>
              </div>
              {added.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {added.map((title) => (
                    <span
                      key={title}
                      className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-800"
                    >
                      + {title}
                      <button
                        type="button"
                        onClick={() =>
                          setAdded((prev) => prev.filter((t) => t !== title))
                        }
                        className="text-green-700 hover:text-red-600"
                        aria-label={`Remove ${title}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setView("manage")}
                className="text-xs font-semibold text-accent-ink hover:underline"
              >
                ← Back
              </button>
              <Button
                variant="success"
                disabled={busy || shownCount === 0}
                onClick={submitDone}
              >
                Yes, Done
              </Button>
            </div>
            {shownCount === 0 && (
              <p className="text-right text-[11px] text-amber-700">
                Mark at least one property as shown to close the visit.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
