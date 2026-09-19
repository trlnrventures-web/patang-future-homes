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
      onClick={onToggleSelect ? (e) => { e.stopPropagation(); onToggleSelect(); } : open}
      className={`relative flex min-h-[9.5rem] cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white p-3 transition-colors ${
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-primary/30"
      }`}
    >
      {accentCls && <span className={`absolute left-0 top-0 h-full w-1 ${accentCls}`} />}
      <div className="flex min-w-0 items-center gap-1.5">
        {onToggleSelect && (
          <button
            type="button"
            aria-label="Select lead"
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              selected ? "border-primary bg-primary" : "border-muted/50 bg-white"
            }`}
          >
            {selected && (
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </button>
        )}
        <span
          onClick={open}
          className="truncate text-sm font-bold text-navy transition-colors hover:text-primary"
        >
          {lead.name}
        </span>
        {lead.statusLabel && (
          <Badge color={lead.statusCls || "bg-background text-muted"}>{lead.statusLabel}</Badge>
        )}
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
        {lead.slaLabel && (
          <Badge color={lead.slaCls || "bg-background text-muted"}>{lead.slaLabel}</Badge>
        )}
        {badges}
      </div>
      <div className="mt-1.5 truncate text-[10px] text-soft">{lead.phone}</div>
      {pills && <div className="mt-1.5 flex flex-wrap gap-1">{pills}</div>}
      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
        <div className="min-w-0 flex-1 text-[10px]">
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
          {footerNote && <div className={lead.nextFollowUpDisplay ? "mt-0.5" : ""}>{footerNote}</div>}
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