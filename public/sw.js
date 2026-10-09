/*
 * Push handler for call alerts.
 *
 * Deliberately does not cache or intercept anything: this worker exists only to
 * receive push messages. Caching app routes from a service worker would serve
 * stale lead data to a caller working a live queue, which is worse than no
 * offline support at all.
 */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A malformed payload still deserves a notification; the defaults below are
    // enough for the user to know something arrived.
  }

  const title = payload.title || "Patang CRM";
  const options = {
    body: payload.body || "You have a new call alert.",
    icon: "/brand/icon-192.png",
    badge: "/brand/icon-192.png",
    tag: payload.tag || "crm-call",
    // An incoming call is only worth interrupting for if the CRM is not already
    // in front of the person, where they can see the same thing. New-lead alerts
    // set requireInteraction in their payload to stay until acknowledged.
    requireInteraction: payload.requireInteraction === true,
    vibrate: payload.vibrate || [200, 100, 200],
    data: { url: payload.url || "/crm" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/crm";

  // Reuse an open tab rather than stacking a new one on every alert.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(target) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
