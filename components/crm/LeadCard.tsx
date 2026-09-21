"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, ChevronIcon, PhoneIcon, WhatsAppIcon } from "./ui";
import { formatPhoneForWhatsApp } from "@/lib/crm/messages";

export type LeadCardLead = {
  id: number;
  name: string;
  phone: string;
  whatsappNumber?: string | null;
  status?: string;
  statusLabel?: string;
  statusCls?: string;
  slaLabel?: string;
  slaCls?: string;
  nextAction?: string;
  nextFollowUpDisplay?: string | null;
  hasOverdueFollowUp?: boolean;
};

type Props = {
  lead: LeadCardLead;
  badges?: ReactNode;
  pills?: ReactNode;
  footerNote?: ReactNode;
  accentCls?: string;
  selected?: boolean;
  onToggleSelect?: () => void;
};

export default function LeadCard({ lead, badges, pills, footerNote, accentCls, selected, onToggleSelect }: Props) {
  const router = useRouter();
  const overdue = !!lead.hasOverdueFollowUp && !!lead.nextFollowUpDisplay;

  const open = () => router.push(`/crm/leads/${lead.id}`);
  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={`group relative flex min-h-[8.5rem] cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white p-3 transition-colors ${
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-primary/30"
      }`}
    >
      {accentCls && <span className={`absolute inset-y-0 left-0 w-1 ${accentCls}`} />}
      <div className="flex min-w-0 items-center gap-2">
        {onToggleSelect && (
          <button
            type="button"
            aria-label="Select lead"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              selected ? "border-primary bg-primary" : "border-muted/50 bg-white hover:border-primary"
            }`}
          >
            {selected && (
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </button>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy transition-colors group-hover:text-primary">
          {lead.name}
        </span>
        {lead.statusLabel && (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${lead.statusCls || "bg-background text-muted"}`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotCls(lead.status)}`} />
            {lead.statusLabel}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
        {lead.slaLabel && (
          <Badge color={lead.slaCls || "bg-background text-muted"}>{lead.slaLabel}</Badge>
        )}
        {badges}
      </div>
      {pills && <div className="mt-1.5 flex flex-wrap gap-1.5">{pills}</div>}
      <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
        <div className="min-w-0 flex-1 text-[10px] leading-tight">
          {lead.nextFollowUpDisplay ? (
            <>
              {lead.nextAction && (
                <div className="truncate font-semibold text-navy">
                  Next:{" "}
                  <span className={overdue ? "text-red-600" : "text-primary"}>{lead.nextAction}</span>
                </div>
              )}
              <div className={overdue ? "truncate font-semibold text-red-600" : "truncate text-soft"}>
                {overdue ? "Overdue: " : "Due: "}{lead.nextFollowUpDisplay}
              </div>
            </>
          ) : null}
          <div className="flex min-w-0 items-center gap-1 text-soft">
            {footerNote}
            {lead.phone && <span className="truncate">· {lead.phone}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1" onClick={stop}>
          <a
            href={`tel:+${lead.phone.replace(/\D/g, "")}`}
            title="Call lead"
            onClick={stop}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-navy transition-colors hover:bg-primary/5 hover:text-primary"
          >
            <PhoneIcon />
          </a>
          <a
            href={`https://wa.me/${formatPhoneForWhatsApp(lead.whatsappNumber || lead.phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open WhatsApp"
            onClick={stop}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-navy transition-colors hover:bg-[#25D366]/10 hover:text-[#1fb858]"
          >
            <WhatsAppIcon />
          </a>
          <Link
            href={`/crm/leads/${lead.id}`}
            title="Open lead"
            onClick={stop}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-navy transition-colors hover:bg-primary/5 hover:text-primary"
          >
            <ChevronIcon />
          </Link>
        </div>
      </div>
    </div>
  );
}

function statusDotCls(status?: string): string {
  switch (status) {
    case "new":
      return "bg-red-500";
    case "calling":
    case "connected":
      return "bg-amber-500";
    case "qualified":
      return "bg-emerald-500";
    case "assigned":
      return "bg-violet-500";
    case "follow_up":
      return "bg-yellow-500";
    case "visit_proposed":
      return "bg-cyan-500";
    case "visit_booked":
      return "bg-teal-500";
    case "visit_confirmed":
      return "bg-teal-600";
    case "visit_done":
      return "bg-sky-500";
    case "negotiation":
      return "bg-fuchsia-500";
    case "booked":
      return "bg-green-500";
    case "nurture":
      return "bg-indigo-500";
    case "no_response":
      return "bg-slate-400";
    case "lost":
    case "invalid":
    case "dnc":
      return "bg-red-400";
    default:
      return "bg-slate-300";
  }
}