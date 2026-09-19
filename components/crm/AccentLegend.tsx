"use client";

const ITEMS = [
  { cls: "bg-red-500", label: "Overdue" },
  { cls: "bg-amber-500", label: "Hot / SLA Breach" },
  { cls: "bg-gray-300", label: "Routine" },
  { cls: "bg-emerald-500", label: "Resolved / Booked" },
];

export default function AccentLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-border bg-white px-3 py-1">
      {ITEMS.map((i) => (
        <span
          key={i.label}
          className="flex items-center gap-1 text-[10px] font-semibold text-soft"
        >
          <span className={`h-2 w-2 rounded-full ${i.cls}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}