"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const { setUser } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/crm/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: forced ? undefined : currentPassword,
          newPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Password change failed");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setUser(data.user);
      router.push("/crm/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
      {!forced && (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-muted" htmlFor="currentPassword">
            Current Password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy outline-none transition-colors focus:border-primary"
            required
          />
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-muted" htmlFor="newPassword">
          New Password
        </label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy outline-none transition-colors focus:border-primary"
          placeholder="Minimum 8 characters"
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-muted" htmlFor="confirmPassword">
          Confirm New Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy outline-none transition-colors focus:border-primary"
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
        {loading ? "Saving..." : "Save New Password"}
      </button>
    </form>
  );
}