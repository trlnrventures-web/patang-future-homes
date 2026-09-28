/**
 * Calling-hours and follow-up scheduling helpers.
 *
 * Pure date math with no database access, so it is safe to import from both
 * server routes and client components (see the `inbox-shared.ts` note about
 * `better-sqlite3` not being browser-bundlable).
 *
 * The organization's calling day is fixed to IST (UTC+05:30).
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** The hour/minute a new calling day opens. */
export const CALL_DAY_START_HOUR = 9;
export const CALL_DAY_START_MIN = 30;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC ms -> "YYYY-MM-DDTHH:mm" IST wall clock, for <input type="datetime-local">. */
export function istLocalInputValue(ms: number): string {
  const ist = new Date(ms + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" IST wall clock -> UTC ms. NaN when malformed. */
export function istLocalInputToMs(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return NaN;
  return (
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) -
    IST_OFFSET_MS
  );
}

/** The IST calendar date ("YYYY-MM-DD") that `ms` falls on. */
export function istDateKey(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function isSameIstDay(a: number, b: number): boolean {
  return istDateKey(a) === istDateKey(b);
}

/**
 * The opening slot of the calling day AFTER `ms` (09:30 IST the next day).
 *
 * A lead that has just been called must not drop back into today's queue, so
 * every automatically chosen follow-up rolls forward to the next morning
 * instead. A follow-up the caller types in by hand is left untouched — only
 * machine-picked times go through here.
 */
export function nextCallingDayStartMs(ms: number): number {
  const ist = new Date(ms + IST_OFFSET_MS);
  return (
    Date.UTC(
      ist.getUTCFullYear(),
      ist.getUTCMonth(),
      ist.getUTCDate() + 1,
      CALL_DAY_START_HOUR,
      CALL_DAY_START_MIN
    ) - IST_OFFSET_MS
  );
}

/**
 * Machine-picked follow-up time, guaranteed to fall on a later IST day.
 *
 * `gapMinutes` is the preferred delay; when that would still land on the day of
 * the call, the next calling morning is used instead.
 */
export function autoFollowUpMs(gapMinutes: number, now = Date.now()): number {
  const target = now + gapMinutes * 60000;
  return isSameIstDay(target, now) ? nextCallingDayStartMs(now) : target;
}
