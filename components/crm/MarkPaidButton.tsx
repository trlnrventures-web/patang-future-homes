"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarkPaidButton({
  userId,
  month,
  total,
  outstanding,
  paid,
}: {
  userId: number;
  month: string;
  total: number;
  outstanding: number;
  paid: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const call = async (action: "paid" | "unpaid") => {
    setBusy(true);
    try {
      const res = await fetch("/crm/api/incentives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, month, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Could not mark as ${action}`);
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Could not mark as ${action}`);
    } finally {
      setBusy(false);
    }
  };

  if (paid) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-800">
          Paid
        </span>
        <button
          onClick={() => {
            if (window.confirm(`Mark ${month} incentive as UNPAID? This reverses it back to pending and logs the change.`)) {
              call("unpaid");
            }
          }}
          disabled={busy}
          className="rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          Mark as Unpaid
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => call("paid")}
      disabled={busy}
      className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-secondary disabled:opacity-50"
    >
      {outstanding > 0 && outstanding < total ? `Mark as Paid (₹${total.toLocaleString("en-IN")})` : "Mark as Paid"}
    </button>
  );
}
