// Resets every CRM account to a fresh random password and flags it with
// must_change_password=1, so the next login lands on the blocking
// /crm/change-password screen instead of the dashboard.
//
// This is the recovery path for a suspected password leak: nobody keeps the
// password that was in use, and each person sets their own on first login.
// app/crm/api/auth/change-password/route.ts deliberately skips the
// current-password check when mustChangePassword is set, so a user who has
// lost their temporary password is not locked out - they only need any valid
// session, which they get by logging in once with the temporary one.
//
// Prints each generated password exactly once. Nothing is written to disk in
// plaintext and nothing personal is committed to git.
//
//   node scripts/reset-all-passwords.mjs
//   DRY_RUN=1 node scripts/reset-all-passwords.mjs
//   CRM_DB_PATH=/var/lib/patang-crm/crm.db node scripts/reset-all-passwords.mjs
//
// Optional:
//   USER_IDS=2,3,8   only these user ids (default: every active user)
//   BACKUP_PATH=...  override the pre-write backup path
//   PASSWORD_LENGTH  generated length, 12-64 (default 16)

import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";
import { randomInt } from "node:crypto";

const DB_PATH = process.env.CRM_DB_PATH || "data/crm.db";
const DRY_RUN = process.env.DRY_RUN === "1";
const BACKUP_PATH = process.env.BACKUP_PATH || `${DB_PATH}.backup-before-password-reset`;

// Alphanumeric only. Enough entropy at 16 chars (about 95 bits) while staying
// safe to read aloud, type, and paste into a chat client that eats symbols.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function fail(message) {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

function generatePassword(length) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

const LENGTH = process.env.PASSWORD_LENGTH ? Number(process.env.PASSWORD_LENGTH) : 16;
if (!Number.isInteger(LENGTH) || LENGTH < 12 || LENGTH > 64) {
  fail(`PASSWORD_LENGTH must be a whole number between 12 and 64 (got "${process.env.PASSWORD_LENGTH}")`);
}

const onlyIds = process.env.USER_IDS
  ? process.env.USER_IDS.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n))
  : null;
if (process.env.USER_IDS && onlyIds.length === 0) fail("USER_IDS was set but contained no valid ids");

const db = new Database(DB_PATH);
db.pragma("busy_timeout = 10000");

const userCols = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
if (!userCols.has("must_change_password")) {
  fail("users.must_change_password is missing on this database; cannot force a change");
}

const targets = onlyIds
  ? db.prepare(`select id, name, email, role, active from users where id in (${onlyIds.map(() => "?").join(",")})`).all(...onlyIds)
  : db.prepare("select id, name, email, role, active from users where active = 1 order by id").all();

if (targets.length === 0) fail("no matching users found - nothing to reset");
const inactive = targets.filter((t) => !t.active);
if (inactive.length > 0) {
  console.log(`note: ${inactive.length} of the selected user(s) are inactive; they will still be reset.`);
}

console.log(`database : ${DB_PATH}`);
console.log(`accounts : ${targets.length} will be reset to a new random password`);
console.log(`length   : ${LENGTH} characters, alphanumeric`);
console.log(`effect   : must_change_password=1, reset_requested_at=NULL`);
console.log(`next login: blocked on /crm/change-password until each person sets their own`);

if (DRY_RUN) {
  console.log("\nDRY RUN - no writes, no backup. Nothing has been changed.");
  db.close();
  process.exit(0);
}

if (existsSync(BACKUP_PATH)) {
  console.log(`\nbackup already exists, keeping it: ${BACKUP_PATH}`);
} else {
  db.exec(`VACUUM INTO '${BACKUP_PATH.replace(/'/g, "''")}'`);
  console.log(`\nbackup written: ${BACKUP_PATH}`);
}

// Hash before opening the transaction: bcrypt at cost 10 is deliberately slow
// and holding a write lock across it would stall live requests.
const planned = targets.map((t) => ({ ...t, password: generatePassword(LENGTH) }));
const hashed = planned.map((p) => ({ ...p, hash: bcrypt.hashSync(p.password, 10) }));

// A password reset invalidates whatever the login_attempts row was counting.
// Without this, someone who tripped the 5-attempt lockout stays locked out for
// the remainder of the 15 minutes even when typing the brand new password.
const hasAttempts = db
  .prepare("select 1 from sqlite_master where type = 'table' and name = 'login_attempts'")
  .get();
const emails = targets.map((t) => String(t.email).toLowerCase());
const clearAttempts = hasAttempts
  ? db.prepare(
      `update login_attempts set failed_count = 0, locked_until = null, updated_at = ? where lower(email) in (${emails.map(() => "?").join(",")})`
    )
  : null;
let clearedLockouts = 0;

const update = db.prepare(
  `update users set password_hash = ?, must_change_password = 1, reset_requested_at = null where id = ?`
);
const run = db.transaction(() => {
  for (const h of hashed) update.run(h.hash, h.id);
  if (clearAttempts) {
    clearedLockouts = clearAttempts.run(new Date().toISOString(), ...emails).changes;
  }
});
run();

console.log("\n--- new passwords, shown once ---");
for (const h of hashed) {
  console.log(`  ${h.name} <${h.email}> [${h.role}]`);
  console.log(`      ${h.password}`);
}

console.log("\n--- verification against the stored hashes ---");
let allGood = true;
for (const h of hashed) {
  const row = db.prepare("select password_hash, must_change_password from users where id = ?").get(h.id);
  const pwOk = bcrypt.compareSync(h.password, row.password_hash);
  const flagOk = row.must_change_password === 1;
  if (!pwOk || !flagOk) allGood = false;
  console.log(`  #${h.id} ${h.name}: password ${pwOk ? "ok" : "MISMATCH"}, mustChange ${flagOk ? "ok" : "FAILED"}`);
}
if (hasAttempts) {
  const stillLocked = db
    .prepare(
      `select count(*) c from login_attempts where locked_until is not null and locked_until > ? and lower(email) in (${emails.map(() => "?").join(",")})`
    )
    .get(new Date().toISOString(), ...emails).c;
  if (stillLocked !== 0) allGood = false;
  console.log(`\nlockouts cleared: ${clearedLockouts} row(s), still locked: ${stillLocked}`);
}
console.log(`\nold passwords: all invalidated (every hash was replaced)`);
console.log(allGood ? "\nPASSWORD RESET COMPLETE" : "\nVERIFICATION FAILED - do not announce these passwords");

if (allGood) {
  console.log("\nDistribute each password privately. On first login the person is sent to\n/crm/change-password and picks their own, so these stop being valid once used.");
}

db.close();
process.exit(allGood ? 0 : 1);
