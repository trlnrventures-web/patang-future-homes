"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TodayRow = {
  checkinTime: string | null;
  checkoutTime: string | null;
  mode: "office" | "field_duty";
  fieldDutyReason: string | null;
  checkinTimeLabel?: string | null;
  checkoutTimeLabel?: string | null;
  statusLabel?: string | null;
  workingLabel?: string | null;
  distanceM?: number | null;
};

type DayCard = {
  date: string;
  day: string;
  in: string;
  out: string;
  type: string;
  label: string;
};

type LeaveRow = {
  id: number;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  userName?: string;
};

type TeamRow = {
  userId: number;
  name: string;
  role?: string | null;
  mode: string;
  fieldDutyReason: string | null;
  checkinTime: string;
  checkoutTime: string;
  status: string | null;
  working?: string;
};

type AttendanceData = {
  today: string;
  weekOffDay: string;
  row: TodayRow | null;
  onLeave: boolean;
  isWeekOff: boolean;
  history: DayCard[];
  week: DayCard[];
  leaveDaysThisMonth: number;
  myLeaves: LeaveRow[];
  pendingLeaves: (LeaveRow & { userName: string })[];
  teamView: TeamRow[];
  weekOffDecision: "taken_off" | "worked" | null;
};

const TYPE_COLORS: Record<string, string> = {
  week_off: "bg-gray-100 text-gray-500",
  leave: "bg-amber-100 text-amber-700",
  absent: "bg-red-100 text-red-700",
  not_checked_in: "bg-gray-100 text-gray-500",
  checked_in: "bg-blue-100 text-blue-700",
  missing_checkout: "bg-orange-100 text-orange-700",
  on_time: "bg-green-100 text-green-700",
  late: "bg-red-100 text-red-700",
};

const TYPE_DOT: Record<string, string> = {
  week_off: "bg-gray-300",
  leave: "bg-amber-500",
  absent: "bg-red-500",
  not_checked_in: "bg-gray-300",
  checked_in: "bg-blue-500",
  missing_checkout: "bg-orange-500",
  on_time: "bg-green-500",
  late: "bg-red-500",
};

export default function AttendancePanel({ data }: { data: AttendanceData }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [mode, setMode] = useState<"office" | "field_duty">("office");
  const [fieldReason, setFieldReason] = useState("");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState("");
  const [weekOffBusy, setWeekOffBusy] = useState(false);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2500);
  };

  const getCoords = (): Promise<{ lat?: number; lng?: number }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({}),
        { timeout: 6000 }
      );
    });

  const doAction = async (action: "checkin" | "checkout") => {
    setBusy(action);
    try {
      const coords = await getCoords();
      const body: {
        action: "checkin" | "checkout";
        lat?: number;
        lng?: number;
        mode?: "office" | "field_duty";
        fieldDutyReason?: string;
      } = {
        action,
        ...coords,
        ...(action === "checkin" ? { mode, fieldDutyReason: fieldReason } : {}),
      };
      const res = await fetch("/crm/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      flash(action === "checkin" ? "Checked in" : "Checked out");
      router.refresh();
      setFieldReason("");
    } catch (e: unknown) {
      flash((e as Error).message || "Something went wrong");
    } finally {
      setBusy("");
    }
  };

  const applyLeave = async () => {
    if (!leaveStart || !leaveEnd || !leaveReason) return flash("Fill in all the fields");
    setBusy("leave");
    try {
      const res = await fetch("/crm/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: leaveStart, endDate: leaveEnd, reason: leaveReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      flash("Leave request submitted");
      setLeaveStart("");
      setLeaveEnd("");
      setLeaveReason("");
      router.refresh();
    } catch (e: unknown) {
      flash((e as Error).message || "Something went wrong");
    } finally {
      setBusy("");
    }
  };

  const declareWeekOff = async (decision: "taken_off" | "worked") => {
    setWeekOffBusy(true);
    try {
      const res = await fetch("/crm/api/week-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      flash(json.message || "Decision saved");
      router.refresh();
    } catch (e: unknown) {
      flash((e as Error).message || "Something went wrong");
    } finally {
      setWeekOffBusy(false);
    }
  };

  const decideLeave = async (id: number, action: "approve" | "reject") => {
    setBusy(`decide-${id}`);
    try {
      const res = await fetch("/crm/api/leave", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, rejectionReason: rejectReason[id] || "" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      flash(action === "approve" ? "Approved" : "Rejected");
      router.refresh();
    } catch (e: unknown) {
      flash((e as Error).message || "Something went wrong");
    } finally {
      setBusy("");
    }
  };

  const row = data.row;

  return (
    <div className="space-y-5">
      {notice && (
        <div className="fixed left-1/2 top-16 z-[100] -translate-x-1/2 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-2xl">
          {notice}
        </div>
      )}

      {/* Today card */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xl font-bold text-primary">{data.today}</div>
            <div className="mt-1 text-xs text-muted">
              {data.weekOffDecision === "worked"
                ? "Working today (week-off banked)"
                : data.weekOffDecision === "taken_off"
                  ? `Week Off taken: ${data.weekOffDay}`
                  : data.isWeekOff
                    ? `Week Off: ${data.weekOffDay}`
                    : data.onLeave
                      ? "On approved leave today"
                      : row?.mode === "field_duty"
                        ? `Field duty: ${row.fieldDutyReason || "No reason given"}`
                        : row?.checkoutTime
                          ? `Done: ${row.workingLabel} working`
                          : row?.checkinTime
                            ? `Checked in at ${row.checkinTimeLabel} · ${row.statusLabel}`
                            : "Not checked in yet today"}
            </div>
            {row?.distanceM != null && (
              <div className="mt-1 text-[11px] text-soft">
                Check-in distance: {row.distanceM}m from office
              </div>
            )}
          </div>

          {!data.isWeekOff && !data.onLeave && (
            <div className="flex flex-wrap items-center gap-2">
              {!row?.checkinTime && (
                <>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as "office" | "field_duty")}
                    className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
                  >
                    <option value="office">Office</option>
                    <option value="field_duty">Field Duty</option>
                  </select>
                  {mode === "field_duty" && (
                    <input
                      value={fieldReason}
                      onChange={(e) => setFieldReason(e.target.value)}
                      placeholder="Field duty reason"
                      className="w-44 rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
                    />
                  )}
                  <button
                    onClick={() => doAction("checkin")}
                    disabled={busy === "checkin"}
                    className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-secondary disabled:opacity-50"
                  >
                    {busy === "checkin" ? "..." : "Check In"}
                  </button>
                </>
              )}
              {row?.checkinTime && !row?.checkoutTime && (
                <button
                  onClick={() => doAction("checkout")}
                  disabled={busy === "checkout"}
                  className="rounded-xl bg-green-600 px-5 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {busy === "checkout" ? "..." : "Check Out"}
                </button>
              )}
              {row?.checkinTime && (
                <div className="rounded-xl bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
                  In: {row.checkinTimeLabel}
                  {row.checkoutTimeLabel && <span className="ml-2">Out: {row.checkoutTimeLabel}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Week-off declaration prompt */}
      {data.isWeekOff && !data.onLeave && !data.weekOffDecision && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <div className="text-center">
            <div className="text-lg font-bold text-amber-800">It&apos;s your week-off day ({data.weekOffDay})</div>
            <div className="mt-1 text-sm text-amber-700">Are you taking your week off today?</div>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => declareWeekOff("taken_off")}
                disabled={weekOffBusy}
                className="rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {weekOffBusy ? "..." : "Yes, taking it off"}
              </button>
              <button
                onClick={() => declareWeekOff("worked")}
                disabled={weekOffBusy}
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-secondary disabled:opacity-50"
              >
                {weekOffBusy ? "..." : "No, I\u2019m working today"}
              </button>
            </div>
            <div className="mt-2 text-[11px] text-amber-600">
              Working today will bank 1 leave credit for use within the next 2 months.
            </div>
          </div>
        </div>
      )}

      {/* Week-off already decided */}
      {data.isWeekOff && !data.onLeave && data.weekOffDecision && (
        <div className={`rounded-2xl border p-4 text-center text-sm font-medium ${
          data.weekOffDecision === "worked"
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-gray-200 bg-gray-50 text-gray-600"
        }`}>
          {data.weekOffDecision === "worked"
            ? "You chose to work today. 1 leave credit banked."
            : "Week-off taken. Enjoy your day off!"}
        </div>
      )}

      {/* This week + leave balance */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="mb-3 text-sm font-bold text-primary">This Week</div>
          <div className="grid grid-cols-7 gap-1.5">
            {data.week.map((h: DayCard) => (
              <div
                key={h.date}
                className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 ${TYPE_COLORS[h.type] || "bg-gray-100"}`}
                title={`${h.date} · ${h.label} · In ${h.in} · Out ${h.out}`}
              >
                <div className="text-[10px] font-semibold text-muted">{h.day}</div>
                <div className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[h.type] || "bg-gray-300"}`} />
                <div className="text-[10px] font-medium">{h.in}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold text-primary">Leave Balance</div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
              Week Off: {data.weekOffDay}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <div className="text-3xl font-bold text-primary">{data.leaveDaysThisMonth}</div>
            <div className="pb-1 text-xs text-muted">
              day{data.leaveDaysThisMonth === 1 ? "" : "s"} used this month
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-background px-3 py-2 text-[11px] text-muted">
            Approved leaves count toward this month&apos;s balance and reset every month.
          </div>
        </div>
      </div>

      {/* Team today (admin/sales head) */}
      {data.teamView.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="mb-3 text-sm font-bold text-primary">Team Status Today ({data.teamView.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Mode</th>
                  <th className="px-2 py-2">In</th>
                  <th className="px-2 py-2">Out</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.teamView.map((t: TeamRow) => (
                  <tr key={t.userId} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-2.5 font-semibold text-navy">{t.name}</td>
                    <td className="px-2 py-2.5 text-xs text-muted">
                      {t.mode === "field_duty" ? "Field" : "Office"}
                      {t.fieldDutyReason && <div className="text-[10px] text-soft">{t.fieldDutyReason}</div>}
                    </td>
                    <td className="px-2 py-2.5 text-navy">{t.checkinTime}</td>
                    <td className="px-2 py-2.5 text-navy">{t.checkoutTime}</td>
                    <td className="px-2 py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          t.status === "late" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                        }`}
                      >
                        {t.status === "late" ? "Late" : "On Time"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Last 14 days */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="mb-3 text-sm font-bold text-primary">Last 14 Days</div>
        <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-14">
          {data.history.map((h: DayCard) => (
            <div
              key={h.date}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 ${TYPE_COLORS[h.type] || "bg-gray-100"}`}
              title={`${h.date} · ${h.label} · In ${h.in} · Out ${h.out}`}
            >
              <div className="text-[10px] font-semibold text-muted">{h.day}</div>
              <div className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[h.type] || "bg-gray-300"}`} />
              <div className="text-[10px] font-medium">{h.in}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />On Time</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />Late / Absent</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-500" />Missing Checkout</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Leave</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-gray-300" />Week Off</span>
        </div>
      </div>

      {/* Leave requests: mine */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="mb-3 text-sm font-bold text-primary">Leave Requests</div>
        {data.myLeaves.length === 0 ? (
          <p className="text-sm text-muted">No leave requests yet.</p>
        ) : (
          <div className="space-y-2">
            {data.myLeaves.map((l: LeaveRow) => (
              <div key={l.id} className="flex items-center justify-between rounded-xl bg-background px-3 py-2.5 text-sm">
                <div>
                  <div className="font-medium text-navy">
                    {l.startDate} → {l.endDate}
                  </div>
                  <div className="text-xs text-muted">{l.reason}</div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    l.status === "approved"
                      ? "bg-green-100 text-green-700"
                      : l.status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {l.status}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={leaveStart}
              onChange={(e) => setLeaveStart(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
            />
            <input
              type="date"
              value={leaveEnd}
              onChange={(e) => setLeaveEnd(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
            />
          </div>
          <input
            value={leaveReason}
            onChange={(e) => setLeaveReason(e.target.value)}
            placeholder="Leave reason"
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
          />
          <button
            onClick={applyLeave}
            disabled={busy === "leave"}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-secondary disabled:opacity-50"
          >
            {busy === "leave" ? "..." : "Apply for Leave"}
          </button>
        </div>
      </div>

      {/* Pending leaves: admin decision */}
      {data.pendingLeaves.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="mb-3 text-sm font-bold text-primary">Pending Requests: Approve/Reject ({data.pendingLeaves.length})</div>
          <div className="space-y-3">
            {data.pendingLeaves.map((l: LeaveRow & { userName: string }) => (
              <div key={l.id} className="rounded-xl bg-background p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-navy">{l.userName}</div>
                    <div className="text-xs text-muted">
                      {l.startDate} → {l.endDate}
                    </div>
                    <div className="text-xs text-muted">{l.reason}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => decideLeave(l.id, "approve")}
                      disabled={busy === `decide-${l.id}`}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => decideLeave(l.id, "reject")}
                      disabled={busy === `decide-${l.id}`}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
                <input
                  value={rejectReason[l.id] || ""}
                  onChange={(e) => setRejectReason((p) => ({ ...p, [l.id]: e.target.value }))}
                  placeholder="Rejection reason (optional)"
                  className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-navy"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}