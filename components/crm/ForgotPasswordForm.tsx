"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/crm/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not send the reset link. Please try again.");
        setLoading(false);
        return;
      }

      // The server answers the same way whether or not the account exists, so
      // this is the confirmation, not proof that a mail was sent.
      setSent(true);
      setLoading(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted">
        <p className="font-semibold text-navy">Check your inbox</p>
        <p className="mt-1">
          If that phone number or email belongs to an account, a reset link is on
          its way. The link is valid for 30 minutes and can only be used once.
        </p>
        <Link
          href="/crm/login"
          className="mt-4 inline-block text-sm font-semibold text-primary underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label
          className="mb-1.5 block text-sm font-semibold text-muted"
          htmlFor="identifier"
        >
          Phone number or email
        </label>
        <input
          id="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy outline-none transition-colors focus:border-primary"
          placeholder="9823727172 or you@patangfuturehomes.com"
          required
        />
        <p className="mt-1.5 text-xs text-muted">
          The link is emailed to the address on your CRM account.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-colors hover:bg-secondary disabled:opacity-60"
      >
        {loading ? "Sending..." : "Send reset link"}
      </button>

      <Link
        href="/crm/login"
        className="text-center text-sm font-semibold text-primary underline"
      >
        Back to sign in
      </Link>
    </form>
  );
}
