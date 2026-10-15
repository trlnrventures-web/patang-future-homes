"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  leadQueueHref,
  loadQueue,
  newQueueKey,
  queueIdsUrl,
  saveQueue,
  type LeadQueue,
} from "@/lib/crm/lead-queue";

type Props = {
  currentId: number;
  /** Queue key carried in the URL; null for a direct link / notification / search. */
  queueKey: string | null;
  /** Server-built queue for a lead's own stage, used when nothing is frozen. */
  fallback: LeadQueue;
  /** List context (`quick`, `q`, `inbox`…) that "Back to Leads" and Next both keep. */
  navQs: string;
};

const navLinkCls =
  "rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5";
const navDisabledCls =
  "cursor-not-allowed rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-bold text-soft opacity-50";

/**
 * Previous/Next navigation that stays inside one stage.
 *
 * It prefers the queue frozen in sessionStorage when the lead was opened from
 * the board or the inbox (so the order cannot shuffle and changing the open
 * lead's stage does not move the queue). With no frozen queue it freezes the
 * server-built same-stage queue instead. The ids endpoint is re-run on every
 * move so a lead that was deleted, has left the stage, or is no longer visible
 * to this user is skipped.
 */
export default function LeadNav({ currentId, queueKey, fallback, navQs }: Props) {
  const router = useRouter();
  const [queue, setQueue] = useState<LeadQueue>(fallback);
  const [key, setKey] = useState<string | null>(queueKey);
  const [valid, setValid] = useState<Set<number> | null>(null);

  // Initialise the frozen queue once per lead. Re-runs when the lead changes so
  // each hop re-reads the same frozen set (or builds one on a direct link). The
  // write is deferred out of the effect body, matching the repo's pattern, so it
  // is not a synchronous setState during commit.
  useEffect(() => {
    const frozen = loadQueue(queueKey);
    const t = setTimeout(() => {
      if (frozen) {
        setQueue(frozen);
        setKey(queueKey);
        return;
      }
      const k = queueKey || newQueueKey();
      saveQueue(k, fallback);
      setQueue(fallback);
      setKey(k);
      if (!queueKey) {
        try {
          window.history.replaceState(null, "", leadQueueHref(currentId, k, navQs));
        } catch {
          /* address bar is cosmetic here */
        }
      }
    }, 0);
    return () => clearTimeout(t);
  }, [currentId, queueKey, navQs, fallback]);

  // Fresh validity for the frozen ids: same comparator and permission scope as
  // the list, so deleted / out-of-scope / stage-changed leads drop out.
  useEffect(() => {
    let active = true;
    fetch(queueIdsUrl(queue))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ids?: number[] } | null) => {
        if (!active) return;
        setValid(new Set(Array.isArray(d?.ids) ? d.ids : []));
      })
      .catch(() => {
        if (active) setValid(new Set(queue.ids));
      });
    return () => {
      active = false;
    };
  }, [queue]);

  // The current lead is always kept, even after its stage changed, so the count
  // and position do not jump under the user mid-session.
  const displayQueue = useMemo(() => {
    if (!valid) return queue.ids;
    return queue.ids.filter((id) => valid.has(id) || id === currentId);
  }, [queue.ids, valid, currentId]);

  const currentIndex = displayQueue.indexOf(currentId);
  const prevId = currentIndex > 0 ? displayQueue[currentIndex - 1] : null;
  const nextId =
    currentIndex >= 0 && currentIndex < displayQueue.length - 1
      ? displayQueue[currentIndex + 1]
      : null;

  const go = useCallback(
    (id: number | null) => {
      if (id == null || !key) return;
      router.push(leadQueueHref(id, key, navQs));
    },
    [key, navQs, router]
  );

  const showPosition = currentIndex >= 0 && displayQueue.length > 1;

  return (
    <div className="flex items-center gap-2">
      {showPosition && (
        <span className="hidden text-[11px] font-semibold text-soft sm:inline">
          Lead {currentIndex + 1} of {displayQueue.length} in {queue.stageLabel}
        </span>
      )}
      <button
        type="button"
        onClick={() => go(prevId)}
        disabled={!prevId}
        className={prevId ? navLinkCls : navDisabledCls}
        aria-label="Previous lead in this stage"
      >
        ← Previous
      </button>
      <button
        type="button"
        onClick={() => go(nextId)}
        disabled={!nextId}
        className={nextId ? navLinkCls : navDisabledCls}
        aria-label="Next lead in this stage"
      >
        Next →
      </button>
    </div>
  );
}
