"use client";

import { useState } from "react";
import AnnouncementBar from "./AnnouncementBar";
import Navbar from "./Navbar";

const STORAGE_KEY = "pfh-announcement-dismissed";

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function SiteHeader() {
  const [showBar, setShowBar] = useState(() => !isDismissed());

  const dismiss = () => {
    setShowBar(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50">
      {showBar && <AnnouncementBar onDismiss={dismiss} />}
      <Navbar />
    </div>
  );
}