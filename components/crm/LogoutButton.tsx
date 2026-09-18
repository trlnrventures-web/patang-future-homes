"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export default function LogoutButton({ compact = false }: { compact?: boolean }) {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    await logout();
  };

  return (
    <button
      onClick={handle}
      disabled={busy}
      className={`flex items-center gap-2 rounded-lg font-medium text-muted transition-colors hover:bg-red-50 hover:text-red-600 ${
        compact ? "px-2 py-1.5 text-xs" : "w-full px-3 py-2.5 text-sm"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[18px] w-[18px] shrink-0"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
      </svg>
      {busy ? "Logging out..." : "Logout"}
    </button>
  );
}