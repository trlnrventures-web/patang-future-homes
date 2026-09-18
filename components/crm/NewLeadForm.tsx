"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Toast } from "./ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function NewLeadForm({ isOpen, onClose }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.target as HTMLFormElement);
    try {
      const res = await fetch("/crm/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name")),
          phone: String(form.get("phone")),
          originalProject: form.get("originalProject") || null,
          source: form.get("source") || "meta",
          notes: form.get("notes") || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Could not create lead");
        setBusy(false);
        return;
      }
      const data = await res.json();
      showToast("Lead created!");
      onClose();
      router.push(`/crm/leads/${data.lead.id}`);
    } catch {
      showToast("Something went wrong");
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-primary";

  return (
    <>
      <Toast message={toast} visible={!!toast} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
        >
          <h2 className="text-lg font-bold text-primary">New Lead</h2>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Customer Name *</label>
            <input name="name" required placeholder="Rahul Sharma" className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Phone Number *</label>
            <input name="phone" required placeholder="9876543210" type="tel" className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Original Project</label>
            <input name="originalProject" placeholder="Pearl Gardens" className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Source</label>
            <select name="source" className={input}>
              <option value="meta">Meta Lead</option>
              <option value="website">Website</option>
              <option value="walk_in">Walk-in</option>
              <option value="referral">Referral</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Notes</label>
            <textarea name="notes" rows={2} className={`${input} resize-none`} />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Create Lead
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}