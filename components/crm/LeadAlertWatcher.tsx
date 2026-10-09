"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * In-app new-lead popup. Polls the caller's unread alerts and, when one lands,
 * shows a card and plays a short chime.
 *
 * Polling (rather than a socket) keeps this dependency-free and works across
 * every open tab: the alert lives in the database, so a reload or a second tab
 * cannot lose it, and acknowledging it here clears it everywhere on the next
 * poll. The chime is a bundled file; autoplay rules mean it must be unlocked by
 * the first user gesture, so the listeners below prime it once.
 */
type LeadAlert = {
  id: number;
  leadId: number;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
};

const POLL_MS = 15000;
const MUTE_KEY = "crm_alert_muted";

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function LeadAlertWatcher() {
  const router = useRouter();
  const [queue, setQueue] = useState<LeadAlert[]>([]);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownIds = useRef<Set<number>>(new Set());

  // Restore the mute preference once on mount. Deferred out of the effect body
  // so the initial write is not a synchronous setState during render commit.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setMuted(localStorage.getItem(MUTE_KEY) === "1");
      } catch {
        // localStorage unavailable (private mode); stay unmuted.
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const playChime = useCallback(() => {
    if (muted) return;
    const el = audioRef.current;
    if (!el) return;
    try {
      el.currentTime = 0;
      void el.play().catch(() => {});
    } catch {
      // Autoplay blocked; the popup itself still communicates the alert.
    }
  }, [muted]);

  // Prime audio on the first user gesture so a later alert can play without one.
  useEffect(() => {
    const unlock = () => {
      const el = audioRef.current;
      if (el) {
        el.muted = true;
        el.play()
          .then(() => {
            el.pause();
            el.currentTime = 0;
            el.muted = false;
          })
          .catch(() => {
            el.muted = false;
          });
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch("/crm/api/alerts", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { alerts?: LeadAlert[] };
        const incoming = (data.alerts ?? []).filter((a) => !knownIds.current.has(a.id));
        if (incoming.length === 0) return;
        incoming.forEach((a) => knownIds.current.add(a.id));
        setQueue((prev) => {
          const existing = new Set(prev.map((p) => p.id));
          return [...prev, ...incoming.filter((a) => !existing.has(a.id))];
        });
        playChime();
      } catch {
        // Network hiccup: try again on the next tick.
      }
    };

    void poll();
    const id = setInterval(() => {
      if (!stopped) void poll();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [playChime]);

  const ack = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    setQueue((prev) => prev.filter((a) => !ids.includes(a.id)));
    try {
      await fetch("/crm/api/alerts/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // The alert stays unread server-side and reappears on the next poll.
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const current = queue[0];

  return (
    <>
      <audio ref={audioRef} src="/sounds/new-lead.wav" preload="auto" className="hidden" />
      {current && (
        <div className="fixed inset-x-3 bottom-20 z-50 md:inset-x-auto md:bottom-6 md:right-6 md:w-96">
          <div className="rounded-2xl border border-primary/30 bg-white p-4 shadow-xl shadow-navy/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-navy">{current.title}</p>
                <p className="mt-0.5 truncate text-sm text-muted">{current.body}</p>
                <p className="mt-0.5 text-[11px] text-soft">
                  {timeLabel(current.createdAt)}
                  {queue.length > 1 ? ` - ${queue.length - 1} more` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? "Unmute new-lead alerts" : "Mute new-lead alerts"}
                title={muted ? "Unmute alert sound" : "Mute alert sound"}
                className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted hover:text-navy"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void ack([current.id]);
                  router.push(`/crm/leads/${current.leadId}`);
                }}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-secondary"
              >
                View lead
              </button>
              <button
                type="button"
                onClick={() => void ack([current.id])}
                className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-primary/5"
              >
                Dismiss
              </button>
              {queue.length > 1 && (
                <button
                  type="button"
                  onClick={() => void ack(queue.map((a) => a.id))}
                  className="ml-auto rounded-xl px-2 py-2 text-sm font-semibold text-muted hover:text-navy"
                >
                  Dismiss all
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
