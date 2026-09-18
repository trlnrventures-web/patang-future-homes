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

  const markPaid = async () => {
    setBusy(true);
    try {
      const res = await fetch("/crm/api/incentives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, month }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      alert("Could not mark as paid");
    } finally {
      setBusy(false);
    }
  };

  if (paid && outstanding === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-800">
        Paid
      </span>
    );
  }

  return (
    <button
      onClick={markPaid}
      disabled={busy}
      className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-secondary disabled:opacity-50"
    >
      {paid ? `Paid ${total.toLocaleString("en-IN")} · Update` : "Mark as Paid"}
    </button>
  );
}