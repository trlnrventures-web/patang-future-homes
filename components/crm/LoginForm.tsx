"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export default function LoginForm() {
  const { setUser } = useAuth();
  const [email, setEmail] = useState("admin@patangfuturehomes.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/crm/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed");
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
        <label className="mb-1.5 block text-sm font-semibold text-muted" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy outline-none transition-colors focus:border-primary"
          placeholder="you@patangfuturehomes.com"
          required
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-muted" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy outline-none transition-colors focus:border-primary"
          placeholder="••••••••"
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

      <p className="mt-2 text-center text-xs text-muted">
        Owner: admin@patangfuturehomes.com · admin123
      </p>
    </form>
  );
}