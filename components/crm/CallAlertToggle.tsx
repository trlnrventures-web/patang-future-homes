"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Opt-in control for call alerts.
 *
 * Permission is never requested on load: browsers require a user gesture, and a
 * prompt nobody asked for is the fastest way to get denied permanently. This
 * button exists so the ask is deliberate.
 *
 * Three states are distinguished rather than two, because "denied" and "not
 * supported" need different words — a blocked browser cannot be fixed from
 * inside the page, while a dismissed prompt can be asked for again.
 */
type State = "unsupported" | "default" | "granted" | "denied" | "error";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  // Backed by a plain ArrayBuffer rather than the generic ArrayBufferLike, which
  // is what PushManager's applicationServerKey expects.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Looks for an existing subscription without registering anything.
 *
 * `navigator.serviceWorker.ready` is not usable here: it only settles once a
 * worker is registered, and the worker is registered inside `enable()`. Awaiting
 * it on a first visit would hang this lookup forever.
 */
async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export default function CallAlertToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      const permission = Notification.permission;
      if (permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const existing = await currentSubscription();
        if (cancelled) return;
        // Already subscribed: show it as on even if permission is still
        // "default", which is the normal state after granting.
        setState(existing ? "granted" : "default");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        setMessage("Your browser blocked notifications. Allow them in site settings to turn this on.");
        return;
      }

      // register() resolves only once the worker is active, so the returned
      // registration can be used straight away — no `ready` needed here.
      const registration = await navigator.serviceWorker.register("/sw.js");

      const { publicKey } = await fetch("/crm/api/push/subscribe").then((r) => r.json());
      if (!publicKey) throw new Error("missing VAPID key");

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const res = await fetch("/crm/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error("subscribe failed");

      setState("granted");
    } catch {
      setState("error");
      setMessage("Could not turn on call alerts on this device.");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        // Tell the server first, so the row is retired even if unsubscribe()
        // below is interrupted, then drop the local subscription.
        await fetch(`/crm/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
          method: "DELETE",
        });
        await subscription.unsubscribe();
      }
      setState("default");
    } catch {
      setMessage("Could not turn off call alerts on this device.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (state === "unsupported") return null;

  if (state === "denied") {
    return (
      <p className={compact ? "text-xs text-muted" : "text-sm text-muted"}>
        Call alerts are blocked for this site. Enable them in your browser settings to get
        notified when a lead calls in.
      </p>
    );
  }

  const on = state === "granted";

  return (
    <div>
      <button
        type="button"
        onClick={on ? disable : enable}
        disabled={busy}
        className={
          compact
            ? "text-sm font-semibold text-primary hover:underline disabled:opacity-50"
            : "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-navy transition-colors hover:border-primary/40 disabled:opacity-50"
        }
      >
        {busy ? "Saving..." : on ? "Call alerts on" : "Turn on call alerts"}
      </button>
      {message && <p className="mt-2 text-sm text-muted">{message}</p>}
    </div>
  );
}
