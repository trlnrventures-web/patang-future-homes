"use client";

import { useEffect, useState } from "react";

const MESSAGES = [
  "Zero Brokerage on New Projects",
  "Free Site Visits, We'll Pick You Up",
];

export default function AnnouncementBar({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % MESSAGES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      role="status"
      className="relative flex h-9 items-center justify-center overflow-hidden bg-primary px-8 text-center text-[11px] font-semibold text-white sm:text-xs"
    >
      {MESSAGES.map((message, i) => (
        <span
          key={message}
          aria-hidden={i !== index}
          className={`announce-item transition-opacity duration-500 ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        >
          {message}
        </span>
      ))}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss announcement"
        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-3.5 w-3.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18 18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}