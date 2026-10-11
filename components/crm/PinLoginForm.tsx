"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export default function PinLoginForm() {
  const { setUser } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) {
      setError("Enter your 4-digit PIN");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/crm/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, pin }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed");
        setPin("");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setUser(data.user);
      window.location.href = "/crm/dashboard";
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

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
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-muted" htmlFor="pin">
          4-digit PIN
        </label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          pattern="\d*"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-center text-lg font-bold tracking-[0.7em] text-navy outline-none transition-colors focus:border-primary"
          placeholder="••••"
          required
        />
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
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
