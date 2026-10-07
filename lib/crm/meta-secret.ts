import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Facebook access tokens are bearer credentials for the Page's entire lead
 * history, so they are encrypted at rest rather than stored as plain text in a
 * column that a routine `SELECT *` or a database backup would expose.
 *
 * AES-256-GCM, keyed from `CRM_META_TOKEN_SECRET`. The tag is authenticated, so
 * a tampered ciphertext fails to decrypt rather than returning garbage that would
 * then be sent to Graph as a token.
 *
 * If the dedicated secret is not set, the key is derived from `JWT_SECRET` so a
 * deployment that already has one working secret does not start erroring on
 * every sync - but a separate `CRM_META_TOKEN_SECRET` is strongly preferred, and
 * the UI says so, because rotating `JWT_SECRET` to log everyone out would
 * otherwise silently invalidate every stored Page token.
 */

const PREFIX = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function encryptionSecret(): string {
  const dedicated = process.env.CRM_META_TOKEN_SECRET?.trim();
  if (dedicated) return dedicated;
  return process.env.JWT_SECRET || "patang-future-homes-crm-secret-key-2024";
}

function keyFor(secret: string): Buffer {
  return createHash("sha256").update(`crm-meta-token:${secret}`).digest();
}

/** True when tokens are protected by a secret of their own. Surfaced in the UI. */
export function hasDedicatedTokenSecret(): boolean {
  return !!process.env.CRM_META_TOKEN_SECRET?.trim();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, keyFor(encryptionSecret()), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  try {
    const [, ivRaw, tagRaw, dataRaw] = parts;
    const decipher = createDecipheriv(ALGO, keyFor(encryptionSecret()), Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key, or a ciphertext written under a previous secret. Either way the
    // caller has to treat the connection as needing a fresh handshake, which is
    // what returning null leads to.
    return null;
  }
}

/**
 * The OAuth `state` value, signed rather than stored server-side.
 *
 * Facebook redirects back to the callback from its own origin, which makes the
 * redirect cross-site. The session cookie is `SameSite=Strict` and so is NOT
 * sent on that navigation - the callback cannot rely on it. This value is
 * therefore the only thing tying the redirect back to the admin who started it,
 * and it has to be unforgeable: it is HMAC'd over the admin's user id and an
 * expiry, so a leaked URL cannot be replayed into somebody else's connection.
 */
export const OAUTH_STATE_COOKIE = "meta_oauth_state";

export const OAUTH_STATE_TTL_SECONDS = 15 * 60;

export function signOAuthState(payload: { userId: number; issuedAt: number }): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHash("sha256").update(`crm-meta-state:${body}`).update(encryptionSecret()).digest("base64url");
  return `${body}.${mac}`;
}

const STATE_TTL_MS = OAUTH_STATE_TTL_SECONDS * 1000;

export function verifyOAuthState(state: string | null | undefined): number | null {
  if (!state) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const mac = state.slice(dot + 1);
  const expected = createHash("sha256").update(`crm-meta-state:${body}`).update(encryptionSecret()).digest("base64url");
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqualString(mac, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      userId: number;
      issuedAt: number;
    };
    if (!Number.isInteger(parsed.userId) || typeof parsed.issuedAt !== "number") return null;
    if (Date.now() - parsed.issuedAt > STATE_TTL_MS) return null;
    return parsed.userId;
  } catch {
    return null;
  }
}

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}
