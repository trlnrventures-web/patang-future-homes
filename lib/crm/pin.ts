import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

// A 4-digit PIN is only 10,000 values, so it is a weak secret by construction.
// The hash below is not what makes it safe - an offline attacker would exhaust
// the space in milliseconds. What makes it safe is the hard account lock after
// PIN_MAX_ATTEMPTS wrong tries, which only an admin can clear, plus the fact
// that the PIN is used together with a phone/email that names the account.
// The hash still earns its place: it keeps the stored form from handing the
// PIN to anyone who reads the database file, and it keeps the login comparison
// constant-time rather than a plain string equality.

export const PIN_LENGTH = 4;
export const PIN_MAX_ATTEMPTS = 5;

const PIN_RE = new RegExp(`^\\d{${PIN_LENGTH}}$`);

export function isValidPinFormat(value: string): boolean {
  return PIN_RE.test(value);
}

export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, 10);
}

export function verifyPin(pin: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  return bcrypt.compareSync(pin, hash);
}

/**
 * A random 4-digit PIN that is not already in `taken`. The PIN space is tiny,
 * so a rare `pin` shared by two people is possible in principle - and it would
 * make the admin's "read it off the Team screen" workflow ambiguous - so the
 * caller passes the pins already in use and this avoids them. Returns "" only
 * when all 10,000 values are taken, which a team this size will never hit.
 */
export function generatePin(taken: Set<string> = new Set()): string {
  for (let i = 0; i < 10000; i++) {
    const pin = (randomBytes(2).readUInt16BE(0) % 10000)
      .toString()
      .padStart(PIN_LENGTH, "0");
    if (!taken.has(pin)) return pin;
  }
  return "";
}
