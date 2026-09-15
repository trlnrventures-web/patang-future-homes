"use client";

import { useState } from "react";

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "whatsapp" | "success";
  size?: "sm" | "md" | "lg";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-primary text-white hover:bg-secondary shadow-sm shadow-primary/20",
    secondary:
      "bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10",
    ghost: "bg-transparent text-muted border border-border hover:bg-primary/5",
    danger: "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100",
    whatsapp: "bg-[#25D366] text-white hover:bg-[#1DA851] shadow-sm shadow-[#25D366]/30",
    success: "bg-green-600 text-white hover:bg-green-700",
  };

  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3.5 text-sm w-full",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-white ${className}`}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  color = "bg-primary/10 text-primary",
  className = "",
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${color} ${className}`}
    >
      {children}
    </span>
  );
}

export function Toast({
  message,
  visible,
}: {
  message: string;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="fixed left-1/2 top-16 z-[100] -translate-x-1/2 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-2xl">
      {message}
    </div>
  );
}

export function CopyButton({
  text,
  onCopied,
  variant = "primary",
  size = "md",
  className = "",
  label = "COPY MESSAGE",
}: {
  text: string;
  onCopied?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "whatsapp" | "success";
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "done">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
      onCopied?.();
      setTimeout(() => setState("idle"), 1800);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setState("done");
        onCopied?.();
        setTimeout(() => setState("idle"), 1800);
      } catch {
        // clipboard unavailable
      }
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors ${
        state === "done"
          ? "bg-green-600 text-white"
          : variant === "whatsapp"
            ? "bg-[#25D366] text-white hover:bg-[#1DA851]"
            : variant === "secondary"
              ? "bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10"
              : variant === "ghost"
                ? "bg-transparent text-muted border border-border hover:bg-primary/5"
                : "bg-primary text-white hover:bg-secondary shadow-sm shadow-primary/20"
      } ${
        size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-6 py-3.5 text-sm w-full" : "px-4 py-2.5 text-sm"
      } ${className}`}
    >
      {state === "done" ? (
        <>
          <CheckIcon />
          Copied
        </>
      ) : (
        <>
          <CopyIcon />
          {label}
        </>
      )}
    </button>
  );
}

export function WhatsAppOpenButton({
  phone,
  message,
  onOpened,
  size = "md",
  className = "",
}: {
  phone: string;
  message: string;
  onOpened?: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const open = () => {
    const digits = phone.replace(/\D/g, "");
    const number = digits.length === 10 ? `91${digits}` : digits;
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    onOpened?.();
  };

  return (
    <button
      type="button"
      onClick={open}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] font-bold text-white shadow-sm shadow-[#25D366]/30 transition-colors hover:bg-[#1DA851] ${
        size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-6 py-3.5 text-sm w-full" : "px-4 py-2.5 text-sm"
      } ${className}`}
    >
      <WhatsAppIcon />
      OPEN WHATSAPP
    </button>
  );
}

export function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M20.52 3.48a11.87 11.87 0 0 0-18.4 13.63L.72 23.28a.75.75 0 0 0 .93.93l6.17-1.4a11.87 11.87 0 0 0 12.7-19.33ZM12 21.75a9.8 9.8 0 0 1-5-1.37.75.75 0 0 0-.63-.08l-4.6 1.04 1.1-4.54a.75.75 0 0 0-.1-.65A9.38 9.38 0 1 1 12 21.75Zm5.2-6.55c-.29-.15-1.7-.84-1.96-.94s-.45-.15-.64.14-.74.94-.9 1.13-.33.21-.62.07a7.8 7.8 0 0 1-2.3-1.42 8.6 8.6 0 0 1-1.59-1.98c-.17-.29 0-.44.12-.58s.28-.33.42-.5a1.9 1.9 0 0 0 .28-.47.5.5 0 0 0 0-.48c-.07-.14-.64-1.54-.87-2.11s-.46-.48-.64-.49h-.58a1.1 1.1 0 0 0-.8.38 3.36 3.36 0 0 0-1.04 2.49 5.83 5.83 0 0 0 1.23 3.1 13.3 13.3 0 0 0 5.09 4.47c.71.31 1.26.49 1.7.63a4.1 4.1 0 0 0 1.88.12 3.08 3.08 0 0 0 2.02-1.42 2.48 2.48 0 0 0 .17-1.43c-.08-.11-.28-.18-.58-.33Z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}