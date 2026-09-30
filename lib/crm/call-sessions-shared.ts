/**
 * Call-duration helpers shared by the client and the server. Kept free of any
 * db import so a client component can format a duration without pulling
 * better-sqlite3 into the browser bundle.
 */

/** Activity types that represent a dial attempt rather than a note. */
export const CALL_ATTEMPT_TYPES = new Set<string>([
  "call",
  "call_connected",
  "call_no_answer",
  "call_busy",
  "call_wrong_number",
  "call_not_interested",
  "call_switched_off",
  "call_number_invalid",
  "call_whatsapp_only",
  "call_language_barrier",
  "call_incoming",
  "call_missed",
]);

export function isCallAttemptType(type: string | null | undefined, outcome?: unknown): boolean {
  if (!type) return false;
  if (CALL_ATTEMPT_TYPES.has(type)) return true;
  // The activities route has always accepted a generic `call` carrying an
  // `outcome` field, which is the same thing as a typed call attempt.
  return type === "call" && !!outcome;
}

/**
 * Whole seconds between two ISO timestamps. Clock skew between the browser and
 * the server is clamped to zero rather than producing a negative talk time.
 */
export function durationSecondsBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}

/**
 * "1m 05s" / "45s" / "1h 02m". A null duration means the attempt never produced
 * one, which reads as "—" rather than as zero: a genuine no-answer lookup is
 * not the same as an attempt that was never timed.
 */
export function formatCallDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
}
