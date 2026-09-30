"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Settles one person's half of one booking. The booking and the person are sent
 * separately because they are what identify the row: a lead with both a Caller
 * and an SM has two independent rows, and ticking one must not settle the other.
 */
export default function MarkBookingPaidButton({
  bookingId,
  userId,
  personName,
  amount,
  paid,
  paidAtLabel,
}: {
  bookingId: number;
  userId: number;
  personName: string;
  amount: number;
  paid: boolean;
  paidAtLabel?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  const call = async (action: "paid" | "unpaid") => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/crm/api/incentives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, userId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Could not mark as ${action}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Could not mark as ${action}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {paid ? (
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-800">
            Paid{paidAtLabel ? ` ${paidAtLabel}` : ""}
          </span>
          <button
            onClick={() => {
              if (
                window.confirm(
                  `Reverse ${personName}'s incentive on this booking back to unpaid? This is logged.`
                )
              ) {
                call("unpaid");
              }
            }}
            disabled={busy}
            className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            Undo
          </button>
        </span>
      ) : (
        <button
          onClick={() => call("paid")}
          disabled={busy}
          className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {busy ? "..." : `Mark Paid · ₹${amount.toLocaleString("en-IN")}`}
        </button>
      )}
      {err && <span className="text-[10px] font-semibold text-red-600">{err}</span>}
    </span>
  );
}
