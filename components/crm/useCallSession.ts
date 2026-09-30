"use client";

import { useCallback, useEffect, useState } from "react";
import { durationSecondsBetween } from "@/lib/crm/call-sessions-shared";

type Channel = "phone" | "whatsapp";
type Source = "call_queue" | "lead_detail";

/**
 * Opens a server-side attempt the moment the caller taps Call and keeps a live
 * readout of how long they have been on the call. The elapsed count is derived
 * from the timestamp the server returned, not from a local start time, so what
 * the caller sees is the same duration that gets stored.
 *
 * The session is closed by the outcome POST, not here: an attempt that nobody
 * ever logged an outcome for is abandoned server side on the next tap instead
 * of being silently completed.
 */
export function useCallSession(leadId: number | null, source: Source) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [trackedLeadId, setTrackedLeadId] = useState(leadId);

  // Queue and detail screens both move on to a different lead, so the live
  // timer must not follow them to the next card. Resetting during render rather
  // than in an effect keeps it to the same commit as the lead change.
  if (leadId !== trackedLeadId) {
    setTrackedLeadId(leadId);
    setSessionId(null);
    setStartedAt(null);
    setElapsed(0);
  }

  const clear = useCallback(() => {
    setSessionId(null);
    setStartedAt(null);
    setElapsed(0);
  }, []);

  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(
      () => setElapsed(durationSecondsBetween(startedAt, new Date().toISOString())),
      1000
    );
    return () => window.clearInterval(id);
  }, [startedAt]);

  const begin = useCallback(
    async (channel: Channel, number?: string) => {
      if (!leadId) return;
      // The dial itself is the OS's job, so this is fire-and-forget: a failed
      // open only costs the duration, and the outcome still gets logged.
      try {
        const res = await fetch("/crm/api/call-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId, channel, source, number }),
        });
        if (!res.ok) return;
        const data = await res.json();
        setSessionId(data.id ?? null);
        setStartedAt(data.startedAt ?? null);
        setElapsed(
          data.startedAt ? durationSecondsBetween(data.startedAt, new Date().toISOString()) : 0
        );
      } catch {
        // Offline, or the request was cut short by the dialer taking over.
      }
    },
    [leadId, source]
  );

  return {
    /** Sent with the outcome POST, which is what closes and times the attempt. */
    sessionId,
    elapsed,
    running: sessionId != null,
    begin,
    clear,
  };
}
