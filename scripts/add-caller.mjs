// Adds a new caller account to the CRM. The CRM has no create-user API or UI
// (app/crm/api/team/route.ts is GET + PATCH only, and the only user inserts are
// the seeds in lib/crm/db.ts), so a new teammate is created with this script.
//
// Details come from the environment so nothing personal is committed to git:
//
//   NAME="Sohan Rajput" \
//   EMAIL="sohan@patangfuturehomes.com" \
//   PHONE="917249138197" \
//   WEEK_OFF="Tuesday" \
//   node scripts/add-caller.mjs
//
// Optional:
//   TEMP_PASSWORD  initial password. Omit to have one generated and printed.
//                  Either way the account is created with must_change_password=1,
//                  so proxy.ts forces a change on first login.
//   BASE_SALARY    monthly base. Omit to leave NULL, matching the current team.
//   BACKUP_PATH    override the pre-write backup path.
//
//   DRY_RUN=1        validate and print the plan, write nothing
//   CRM_DB_PATH=...  target another database, e.g. the live VPS one
//
//   CRM_DB_PATH=/var/lib/patang-crm/crm.db node scripts/add-caller.mjs
//   DRY_RUN=1 CRM_DB_PATH=/var/lib/patang-crm/crm.db node scripts/add-caller.mjs
//
// Idempotent: if a user with the same email or name already exists the script
// reports the existing account and exits 0 without writing. No leads are
// touched - the new caller starts with an empty queue.

import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const DB_PATH = process.env.CRM_DB_PATH || "data/crm.db";
const DRY_RUN = process.env.DRY_RUN === "1";

const NAME = (process.env.NAME || "").trim();
const EMAIL = (process.env.EMAIL || "").trim().toLowerCase();
const PHONE = (process.env.PHONE || "").trim() || null;
const WEEK_OFF = (process.env.WEEK_OFF || "").trim() || null;
const TEMP_PASSWORD = process.env.TEMP_PASSWORD || null;
const BASE_SALARY = process.env.BASE_SALARY ? Number(process.env.BASE_SALARY) : null;

// Must match lib/crm/attendance.ts DAY_NAMES - app/crm/api/team/route.ts:70
// rejects anything else when an admin edits the week-off later.
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function fail(message) {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

if (!NAME) fail("NAME is required, e.g. NAME=\"Sohan Rajput\"");
if (!EMAIL) fail("EMAIL is required, e.g. EMAIL=\"sohan@patangfuturehomes.com\"");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) fail(`EMAIL "${EMAIL}" is not a valid address`);
if (WEEK_OFF && !DAY_NAMES.includes(WEEK_OFF)) {
  fail(`WEEK_OFF must be one of ${DAY_NAMES.join(", ")} (got "${WEEK_OFF}")`);
}
if (BASE_SALARY !== null && !Number.isInteger(BASE_SALARY)) {
  fail(`BASE_SALARY must be a whole number (got "${process.env.BASE_SALARY}")`);
}

const password = TEMP_PASSWORD || randomBytes(9).toString("base64url");
if (TEMP_PASSWORD && TEMP_PASSWORD.length < 8) {
  console.log("warning: TEMP_PASSWORD is under 8 characters.");
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const byEmail = db
  .prepare("select id, name, email, role, active from users where lower(email) = ?")
  .get(EMAIL);
const byName = db
  .prepare("select id, name, email, role, active from users where lower(name) = ?")
  .get(NAME.toLowerCase());

if (byEmail || byName) {
  const existing = byEmail || byName;
  console.log(`${existing.name} already exists (id ${existing.id}, ${existing.role}, active ${existing.active}) - nothing to do.`);
  db.close();
  process.exit(0);
}

// Must match db.ts:44 and db.ts:459 - an old database may predate the column.
const userCols = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
const hasMustChange = userCols.has("must_change_password");
if (!hasMustChange) {
  console.log("note: users.must_change_password is missing on this database; the first-login change will not be forced.");
}

const activeCallersBefore = db
  .prepare("select id, name from users where role = 'caller' and active = 1 order by id")
  .all();
const unassigned = db
  .prepare("select count(*) n from leads where assigned_caller_id is null and deleted_at is null")
  .get().n;

console.log(`database   : ${DB_PATH}`);
console.log(`new caller : ${NAME} <${EMAIL}>${PHONE ? ` · ${PHONE}` : ""}`);
console.log(`week off   : ${WEEK_OFF || "(unset - the app falls back to its default, Tuesday)"}`);
console.log(`base salary: ${BASE_SALARY ?? "(unset)"}`);
console.log(`password   : ${TEMP_PASSWORD ? "from TEMP_PASSWORD" : "generated below"}`);
console.log(`callers    : ${activeCallersBefore.length} active before -> ${activeCallersBefore.length + 1} after`);
console.log(`queue      : starts empty; ${unassigned} lead(s) are currently unassigned and stay that way`);

if (DRY_RUN) {
  console.log("\nDRY RUN - no writes, no backup. Nothing has been changed.");
  db.close();
  process.exit(0);
}

const BACKUP_PATH = process.env.BACKUP_PATH || `${DB_PATH}.backup-before-add-caller`;
if (existsSync(BACKUP_PATH)) {
  console.log(`\nbackup already exists, keeping it: ${BACKUP_PATH}`);
} else {
  db.exec(`VACUUM INTO '${BACKUP_PATH.replace(/'/g, "''")}'`);
  console.log(`\nbackup written: ${BACKUP_PATH}`);
}

const hash = bcrypt.hashSync(password, 10);
const now = new Date().toISOString();

const insert = hasMustChange
  ? `insert into users (name, email, password_hash, role, phone, active, week_off_day, base_salary, must_change_password, created_at)
     values (?, ?, ?, 'caller', ?, 1, ?, ?, 1, ?)`
  : `insert into users (name, email, password_hash, role, phone, active, week_off_day, base_salary, created_at)
     values (?, ?, ?, 'caller', ?, 1, ?, ?, ?)`;

const run = db.transaction(() =>
  db.prepare(insert).run(NAME, EMAIL, hash, PHONE, WEEK_OFF, BASE_SALARY, ...(hasMustChange ? [now] : []))
);
const { lastInsertRowid } = run();

const check = db
  .prepare("select id, name, email, role, active, phone, week_off_day, base_salary, must_change_password from users where id = ?")
  .get(lastInsertRowid);
const activeCallersAfter = db
  .prepare("select count(*) n from users where role = 'caller' and active = 1")
  .get().n;

console.log(`\ncreated: id ${check.id} · ${check.name} <${check.email}> · role ${check.role} · active ${check.active}`);
console.log(`active callers: ${activeCallersBefore.length} -> ${activeCallersAfter}`);
console.log(`leads assigned to ${check.name}: 0 (queue starts empty)`);

if (!TEMP_PASSWORD) {
  console.log(`\ntemporary password (printed once, not stored in plain text):\n  ${password}`);
  console.log("share it over a channel the new caller can read privately.");
}
console.log(
  "\nnote: resolveDefaultCallerId (lib/crm/leads.ts:102) hands the next website enquiry\n" +
    "to the active caller with the fewest open leads, so new leads will start going to\n" +
    "this account immediately. Restart the app if callers do not appear in the roster."
);

db.close();
