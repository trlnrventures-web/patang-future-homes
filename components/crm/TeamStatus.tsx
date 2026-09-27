import Link from "next/link";
import type { TeamMemberStatus } from "@/lib/crm/team-status";

const KIND_COLOR: Record<TeamMemberStatus["kind"], string> = {
  checked_in_on_time: "bg-green-100 text-green-700",
  checked_in_late: "bg-amber-100 text-amber-700",
  not_checked_in: "bg-red-100 text-red-700",
  week_off: "bg-violet-100 text-violet-700",
  week_off_worked: "bg-violet-100 text-violet-700",
  on_leave: "bg-orange-100 text-orange-700",
  holiday: "bg-sky-100 text-sky-700",
};

const ROLE_LABEL: Record<TeamMemberStatus["role"], string> = {
  caller: "Caller",
  sales_manager: "SM",
};

export default function TeamStatus({
  members,
  date,
}: {
  members: TeamMemberStatus[];
  date: string;
}) {
  const checkedIn = members.filter((m) => m.kind === "checked_in_on_time" || m.kind === "checked_in_late").length;
  const notCheckedIn = members.filter((m) => m.kind === "not_checked_in").length;
  const weekOff = members.filter((m) => m.kind === "week_off" || m.kind === "week_off_worked").length;
  const onLeave = members.filter((m) => m.kind === "on_leave").length;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-primary">Today&apos;s Team Status</h2>
        <Link
          href="/crm/attendance/audit"
          className="text-xs font-semibold text-accent-ink hover:underline"
        >
          Full attendance audit →
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-semibold text-muted">
        {checkedIn > 0 && <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-700">{checkedIn} in</span>}
        {notCheckedIn > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">{notCheckedIn} not checked in</span>}
        {weekOff > 0 && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">{weekOff} week-off</span>}
        {onLeave > 0 && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-orange-700">{onLeave} on leave</span>}
        {members.length > 0 && (
          <span className="rounded-full bg-background px-2.5 py-1">{members.length} members · {date}</span>
        )}
      </div>

      {members.length === 0 ? (
        <p className="rounded-2xl border border-border bg-white p-5 text-center text-sm text-muted">
          No active team members found.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-navy">{m.name}</div>
                <div className="text-[11px] text-muted">
                  {ROLE_LABEL[m.role]}
                  {m.checkinTime ? ` · in at ${m.checkinTime}` : ""}
                </div>
              </div>
              <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${KIND_COLOR[m.kind]}`}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}