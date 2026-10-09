"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, roleLabel } from "./AuthProvider";
import ChangePasswordForm from "./ChangePasswordForm";

const FIELD =
  "w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy outline-none transition-colors focus:border-primary";
const LABEL = "mb-1.5 block text-sm font-semibold text-muted";

export default function MyAccountForm() {
  const { user, setUser, refresh } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);
    try {
      const res = await fetch("/crm/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save your details");
        setLoading(false);
        return;
      }
      setUser({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        phone: data.user.phone ?? null,
      });
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-navy">Profile Details</h2>
        <p className="mt-1 text-sm text-muted">
          Your name, email and mobile number are what you sign in with and how
          the team reaches you. Role and salary are managed by an admin.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <div>
            <label className={LABEL} htmlFor="profile-name">
              Full Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD}
              maxLength={100}
              required
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="profile-email">
              Email (used to sign in)
            </label>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
              required
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="profile-phone">
              Mobile Number
            </label>
            <input
              id="profile-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={FIELD}
              placeholder="10-digit mobile number"
            />
            <p className="mt-1.5 text-xs text-muted">
              Also works as your sign-in ID. Leave blank if you do not have one
              added yet.
            </p>
          </div>

          <div className="rounded-xl bg-background px-4 py-3 text-sm text-muted">
            Role:{" "}
            <span className="font-semibold text-navy">
              {roleLabel(user.role)}
            </span>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {saved && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Profile updated.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-colors hover:bg-secondary disabled:opacity-60 sm:w-auto"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-navy">Change Password</h2>
        <p className="mt-1 text-sm text-muted">
          You need your current password to set a new one. It must be at least
          8 characters.
        </p>
        {passwordSaved && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Password updated.
          </div>
        )}
        <ChangePasswordForm
          forced={false}
          onSuccess={() => {
            refresh();
            setPasswordSaved(true);
          }}
        />
      </section>
    </div>
  );
}
