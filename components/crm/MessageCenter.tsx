"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  MESSAGE_CATEGORIES,
  MESSAGE_CATEGORY_LABELS,
  renderMessage,
  buildLeadContext,
  type LeadSnapshot,
  formatMessageTime,
} from "@/lib/crm/messages";
import { bhkLabel } from "@/lib/crm/leads";
import { CopyButton, WhatsAppOpenButton, Badge, Toast } from "./ui";

export type MCTemplate = {
  id: number;
  name: string;
  category: string;
  body: string;
  active: boolean;
  isPersonal: boolean;
  createdBy: number;
};

export type MCLog = {
  id: number;
  category: string | null;
  renderedMessage: string;
  action: string;
  createdAt: string;
  userName: string;
  templateId: number | null;
};

export type MCLead = Record<string, unknown> & { id: number; name: string };

type Props = {
  lead: MCLead;
  sharedTemplates: MCTemplate[];
  personalTemplates: MCTemplate[];
  initialLogs: MCLog[];
  suggestedCategory: string;
};

const ACTION_LABELS: Record<string, string> = {
  generated: "Message generated",
  copied: "Copied to clipboard",
  whatsapp_opened: "WhatsApp opened",
  edited: "Edited",
};

export default function MessageCenter({
  lead,
  sharedTemplates,
  personalTemplates,
  initialLogs,
  suggestedCategory,
}: Props) {
  const [category, setCategory] = useState(suggestedCategory || "first_contact");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [isPersonal, setIsPersonal] = useState(false);
  const [draft, setDraft] = useState("");
  const [logs, setLogs] = useState<MCLog[]>(initialLogs);
  const [templates] = useState<MCTemplate[]>(sharedTemplates);
  const [myTemplates, setMyTemplates] = useState<MCTemplate[]>(personalTemplates);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const context: LeadSnapshot = useMemo(() => buildLeadContext(lead), [lead]);

  // Auto-load the recommended template for this lead on mount (no logging).
  useEffect(() => {
    const first = templates.find((t) => t.category === suggestedCategory);
    if (first) {
      setCategory(first.category);
      setTemplateId(first.id);
      setIsPersonal(false);
      setDraft(renderMessage(first.body, buildLeadContext(lead)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTemplate = useMemo(() => {
    const source = isPersonal ? myTemplates : templates;
    return source.find((t) => t.id === templateId);
  }, [templateId, isPersonal, templates, myTemplates]);

  const categoryTemplates = useMemo(
    () => (isPersonal ? myTemplates : templates).filter((t) => t.category === category),
    [isPersonal, templates, myTemplates, category]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }, []);

  const logAction = useCallback(
    async (action: string) => {
      try {
        await fetch("/crm/api/messages/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            templateId: selectedTemplate?.id || null,
            category: selectedTemplate?.category || category,
            renderedMessage: draft,
            action,
          }),
        });
      } catch {
        // logging is non-blocking
      }
    },
    [lead.id, selectedTemplate, category, draft]
  );

  const refreshLogs = useCallback(async () => {
    try {
      const res = await fetch(`/crm/api/messages/log?leadId=${lead.id}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } catch {
      // ignore
    }
  }, [lead.id]);

  const selectTemplate = useCallback(
    (t: MCTemplate) => {
      const rendered = renderMessage(t.body, context);
      setTemplateId(t.id);
      setIsPersonal(t.isPersonal === true);
      setCategory(t.category);
      setDraft(rendered);
      logAction("generated");
    },
    [context, logAction]
  );

  const selectCategory = useCallback(
    (c: string) => {
      setCategory(c);
      setTemplateId(null);
      const first = (isPersonal ? myTemplates : templates).find((t) => t.category === c);
      if (first) {
        selectTemplate(first);
      } else {
        setDraft("");
      }
    },
    [isPersonal, templates, myTemplates, selectTemplate]
  );

  const handleCopied = useCallback(() => {
    showToast("Message copied");
    logAction("copied");
    refreshLogs();
  }, [logAction, refreshLogs, showToast]);

  const handleWhatsAppOpened = useCallback(() => {
    showToast("WhatsApp opened");
    logAction("whatsapp_opened");
    refreshLogs();
  }, [logAction, refreshLogs, showToast]);

  const saveAsPersonal = useCallback(async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/crm/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${MESSAGE_CATEGORY_LABELS[category] || "Custom"} - Personal`,
          category,
          body: draft,
          isPersonal: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMyTemplates((prev) => [...prev, data.template]);
        showToast("Personal template saved");
      }
    } catch {
      showToast("Could not save template");
    } finally {
      setSaving(false);
    }
  }, [draft, category, showToast]);

  const relatedTemplates = categoryTemplates.filter((t) => !t.isPersonal);

  return (
    <div className="space-y-4">
      <Toast message={toast} visible={!!toast} />

      {/* Lead context */}
      <div className="rounded-2xl border border-border bg-background/60 p-4">
        <div className="text-sm font-bold text-navy">{lead.name || "Customer"}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {lead.bhk ? <span>{bhkLabel(String(lead.bhk))}</span> : null}
          {lead.budget ? (
            <>
              <span>•</span>
              <span>{String(lead.budget)}</span>
            </>
          ) : null}
          {lead.location ? (
            <>
              <span>•</span>
              <span>{String(lead.location)}</span>
            </>
          ) : null}
        </div>
        {lead.originalProject ? (
          <div className="mt-2 text-xs">
            <span className="text-soft">Original Enquiry: </span>
            <span className="font-semibold text-navy">
              {String(lead.originalProject)}
            </span>
          </div>
        ) : null}
        {lead.concern ? (
          <div className="mt-1 text-xs">
            <span className="text-soft">Concern: </span>
            <span className="font-semibold text-amber-700">
              {String(lead.concern)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Category selector */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-primary">
            Recommended Message
          </h3>
          <button
            onClick={() => setShowMore((s) => !s)}
            className="text-xs font-semibold text-accent-ink hover:underline"
          >
            {showMore ? "Show less ▴" : "More options ▾"}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => {
              setIsPersonal(false);
              selectCategory(suggestedCategory);
            }}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
              !isPersonal && category === suggestedCategory
                ? "border-primary bg-primary text-white"
                : "border-border bg-white text-muted hover:bg-primary/5"
            }`}
          >
            {MESSAGE_CATEGORY_LABELS[suggestedCategory] || "Recommended"}
          </button>
        </div>

        {showMore && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {MESSAGE_CATEGORIES.filter((c) => c.value !== suggestedCategory).map((c) => (
                <button
                  key={c.value}
                  onClick={() => {
                    setIsPersonal(false);
                    selectCategory(c.value);
                  }}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    !isPersonal && category === c.value
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-white text-muted hover:bg-primary/5"
                  }`}
                >
                  {c.label}
                </button>
              ))}
              {!isPersonal && myTemplates.length > 0 && (
                <button
                  onClick={() => {
                    setIsPersonal(true);
                    setTemplateId(null);
                    setCategory(myTemplates[0]?.category || "custom");
                  }}
                  className="shrink-0 rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700"
                >
                  My Templates ({myTemplates.length})
                </button>
              )}
            </div>
            {isPersonal && myTemplates.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-1">
                {myTemplates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      templateId === t.id && isPersonal
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-white text-muted hover:bg-primary/5"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Template variants for current category */}
      {!showMore && relatedTemplates.length > 1 && (
        <div className="-mt-1 flex flex-wrap gap-1.5">
          {relatedTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTemplate(t)}
              className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                templateId === t.id && !isPersonal
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-white text-muted hover:bg-primary/5"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* Message preview / editor */}
      <div className="rounded-2xl border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted">
            MESSAGE PREVIEW
            {selectedTemplate && <span className="text-[10px] text-soft">• {selectedTemplate.name}</span>}
            {isPersonal && (
              <Badge color="bg-violet-100 text-violet-700">Personal</Badge>
            )}
          </div>
          <button
            onClick={() => {
              setDraft((d) => d);
              logAction("edited");
            }}
            className="text-[11px] font-semibold text-soft hover:text-primary"
            title="Edit inline (you can change it directly)"
          >
            ✎ Edit
          </button>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={7}
          className="w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed text-navy outline-none"
          placeholder="Your message will be prepared here."
        />

        <div className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row">
          <CopyButton
            text={draft}
            onCopied={handleCopied}
            size="lg"
            className="sm:flex-1"
            label="COPY MESSAGE"
          />
          <WhatsAppOpenButton
            phone={String(lead.whatsappNumber || lead.phone || "")}
            message={draft}
            onOpened={handleWhatsAppOpened}
            size="lg"
            className="sm:flex-1"
          />
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <button
            onClick={saveAsPersonal}
            disabled={saving || !draft.trim()}
            className="text-xs font-semibold text-accent-ink hover:underline disabled:opacity-50"
          >
            + Save as my template
          </button>
          <span className="text-[10px] text-soft">
            After copying, paste and send the message on WhatsApp
          </span>
        </div>
      </div>

      {/* Message history */}
      <div>
        <h3 className="mb-2 text-sm font-bold text-primary">Message History</h3>
        {logs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-white p-4 text-center text-xs text-muted">
            No message activity yet.
          </p>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 8).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-navy">
                    {MESSAGE_CATEGORY_LABELS[log.category || ""] || "Custom"}
                    <span className="ml-2 font-normal text-muted">
                      {log.userName}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-soft">
                    {log.renderedMessage}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`text-[11px] font-semibold ${
                      log.action === "copied"
                        ? "text-green-700"
                        : log.action === "whatsapp_opened"
                          ? "text-[#1DA851]"
                          : "text-muted"
                    }`}
                  >
                    {ACTION_LABELS[log.action] || log.action}
                  </div>
                  <div className="mt-0.5 text-[10px] text-soft">
                    {formatMessageTime(log.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}