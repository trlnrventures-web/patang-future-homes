import webpush from "web-push";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";

type Db = ReturnType<typeof getDb>;

/**
 * Alerts a caller that a lead phoned in, which is the one event they cannot
 * see from inside the app: an inbound call arrives while the CRM is in the
 * background, so without a push it is only noticed on the next manual check.
 *
 * VAPID keys are generated once and kept in crm_settings, because regenerating
 * them would silently invalidate every existing subscription.
 */
const VAPID_KEY_NAME = "push_vapid_keys";

type VapidKeys = { publicKey: string; privateKey: string };

function loadVapidKeys(db: Db): VapidKeys | null {
  const row = db
    .select()
    .from(schema.crmSettings)
    .where(eq(schema.crmSettings.key, VAPID_KEY_NAME))
    .get();
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as VapidKeys;
    if (parsed?.publicKey && parsed?.privateKey) return parsed;
  } catch {
    // Unparseable: regenerate below rather than failing every send.
  }
  return null;
}

export function getOrCreateVapidKeys(): VapidKeys {
  const db = getDb();
  const existing = loadVapidKeys(db);
  if (existing) return existing;

  const created = webpush.generateVAPIDKeys();
  const now = new Date().toISOString();
  db.insert(schema.crmSettings)
    .values({
      key: VAPID_KEY_NAME,
      value: JSON.stringify(created),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.crmSettings.key,
      set: { value: JSON.stringify(created), updatedAt: now },
    })
    .run();
  return created;
}

export function getPublicVapidKey(): string {
  return getOrCreateVapidKeys().publicKey;
}

export type PushMessage = {
  title: string;
  body: string;
  /** Where tapping the notification should take the user. */
  url: string;
  tag?: string;
  /** Keep the notification on screen until the user acts on it. */
  requireInteraction?: boolean;
  /** Vibration pattern (ms) for devices that honour it. */
  vibrate?: number[];
};

/**
 * Sends to every live subscription for a user and retires the ones the push
 * service has rejected. A 404 or 410 means the browser dropped that
 * subscription — it is gone for good, so keeping it would fail every future
 * send for this user and hide the ones that still work.
 *
 * Never throws. A failed notification must not roll back the call that caused
 * it, which is already committed by the time this runs.
 */
export async function notifyUser(userId: number, message: PushMessage): Promise<{
  sent: number;
  retired: number;
}> {
  const db = getDb();
  const subs = db
    .select()
    .from(schema.pushSubscriptions)
    .where(
      and(eq(schema.pushSubscriptions.userId, userId), isNull(schema.pushSubscriptions.disabledAt))
    )
    .all();
  if (subs.length === 0) return { sent: 0, retired: 0 };

  const keys = loadVapidKeys(db);
  if (!keys) return { sent: 0, retired: 0 };
  webpush.setVapidDetails("mailto:ops@patangfuturehomes.com", keys.publicKey, keys.privateKey);

  const payload = JSON.stringify(message);
  let sent = 0;
  let retired = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        db.update(schema.pushSubscriptions)
          .set({ disabledAt: new Date().toISOString() })
          .where(eq(schema.pushSubscriptions.id, sub.id))
          .run();
        retired++;
      } else {
        console.warn(`[crm] push to user ${userId} failed:`, statusCode ?? error);
      }
    }
  }
  return { sent, retired };
}
