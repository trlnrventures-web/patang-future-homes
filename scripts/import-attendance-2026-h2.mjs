// Imports Jul-Sep 2026 attendance from the "Attendance Upload" workbook into
// the CRM, preserving the sheet's per-person day types.
//
// Per your decisions:
//   - Sajan Mishra is skipped entirely (his user row was removed, so his
//     July-September history is not restored).
//   - Aatish Kini is on approved leave for 25 Sep 2026 and starts checking in
//     daily from 26 Sep, so 26-30 Sep are left for live check-in.
//
// Day types recorded per person: present, week_off, holiday, half_day.
// "Present" days carry no clock time in the sheet, so they are stored with
// day_type='present' rather than a fabricated check-in time. The 8 dated
// Aatish entries in September keep their real check-in times.
//
// Idempotent: clears the target date range for the four imported people and
// re-inserts, so it is safe to re-run after a correction.
//
//   node scripts/import-attendance-2026-h2.mjs
//   DRY_RUN=1 node scripts/import-attendance-2026-h2.mjs
//   CRM_DB_PATH=/var/lib/patang-crm/crm.db node scripts/import-attendance-2026-h2.mjs

import Database from "better-sqlite3";
import { existsSync } from "node:fs";

const DB_PATH = process.env.CRM_DB_PATH || "data/crm.db";
const DRY_RUN = process.env.DRY_RUN === "1";

const IMPORT_START = "2026-07-01";
const IMPORT_END = "2026-09-30";
const ADMIN_ID = 1;

const spec = (...parts) => {
  const out = [];
  for (const [code, count] of parts) for (let i = 0; i < count; i++) out.push(code);
  return out;
};

const P = "P", WO = "WO", HO = "HO", HD = "HD";

// Dates are IST wall-clock; the DB stores UTC ISO strings.
function istToUtcIso(date, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.parse(`${date}T00:00:00+05:30`) + (h * 60 + m) * 60000).toISOString();
}

const DATA = {
  "2026-07": {
    Kirit:   spec([P, 5], [WO, 3], [P, 8], [WO, 1], [P, 14]),
    Aatish:  spec([P, 5], [WO, 3], [P, 13], [HO, 1], [WO, 1], [P, 8]),
    Vishrut: spec([HO, 5], [WO, 4], [P, 22]),
    Priti:   spec([P, 5], [WO, 3], [P, 13], [WO, 2], [P, 8]),
  },
  "2026-08": {
    Kirit:   spec([P, 3], [WO, 1], [P, 13], [WO, 1], [P, 7], [WO, 1], [P, 1], [WO, 1], [P, 3]),
    Aatish:  spec([P, 2], [WO, 1], [P, 6], [WO, 1], [P, 1], [WO, 1], [P, 9], [WO, 1], [P, 2], [HO, 1], [HD, 1], [P, 1], [HD, 1], [P, 3]),
    Vishrut: spec([P, 17], [WO, 2], [P, 4], [HD, 1], [WO, 1], [P, 2], [WO, 1], [P, 3]),
    Priti:   spec([P, 10], [WO, 1], [P, 20]),
  },
  "2026-09": {
    Kirit:   spec([WO, 1], [P, 6], [WO, 1], [P, 6], [WO, 1], [P, 7], [HO, 3]),
    Aatish:  spec([WO, 1], [P, 1], [WO, 1], ["P 13:10", 1], ["P 14:35", 1], [P, 2], [WO, 1], [P, 4],
                  ["P 14:13", 1], ["P 13:24", 1], ["P 14:11", 1], ["P 12:55", 1], ["P 13:57", 1], ["P 13:47", 1], [P, 6]),
    Vishrut: spec([P, 7], [WO, 1], [P, 6], [WO, 1], [HD, 1], [P, 1], [WO, 1], [P, 7]),
    Priti:   spec([P, 7], [WO, 5], [P, 9], [WO, 1], [P, 3]),
  },
};

const LAST_FILLED_DAY = { "2026-07": 31, "2026-08": 31, "2026-09": 25 };

// Aatish has no attendance row for 25 Sep: that day is the approved leave below.
const EXPECT_OVERRIDE = { "2026-09|Aatish": 24 };

const toRow = (code) => {
  if (code === WO) return { dayType: "week_off", checkinTime: null };
  if (code === HO) return { dayType: "holiday", checkinTime: null };
  if (code === HD) return { dayType: "half_day", checkinTime: null };
  if (code === P) return { dayType: "present", checkinTime: null };
  const m = /^P (\d{2}):(\d{2})$/.exec(code);
  if (!m) throw new Error(`unrecognised day code: ${code}`);
  return { dayType: "full_day", checkinTime: `${m[1]}:${m[2]}` };
};

const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

const cols = (t) => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
if (!cols("attendance").has("day_type")) {
  console.log("migration: adding attendance.day_type");
  if (!DRY_RUN) db.exec("ALTER TABLE attendance ADD COLUMN day_type TEXT NOT NULL DEFAULT 'full_day'");
}
if (!cols("salary_reports").has("half_days")) {
  console.log("migration: adding salary_reports.half_days");
  if (!DRY_RUN) db.exec("ALTER TABLE salary_reports ADD COLUMN half_days INTEGER NOT NULL DEFAULT 0");
}

const users = db.prepare("SELECT id, name FROM users WHERE active = 1").all();
const idByName = Object.fromEntries(users.map((u) => [u.name.split(" ")[0], u.id]));
const wanted = ["Kirit", "Aatish", "Vishrut", "Priti"];
const missing = wanted.filter((w) => !idByName[w]);
if (missing.length) {
  console.error(`FATAL: no active user for ${missing.join(", ")}`);
  process.exit(1);
}

const plan = [];
for (const [month, people] of Object.entries(DATA)) {
  for (const person of wanted) {
    const codes = people[person];
    const want = EXPECT_OVERRIDE[`${month}|${person}`] ?? LAST_FILLED_DAY[month];
    if (codes.length !== want) {
      console.error(`FATAL: ${month} ${person} has ${codes.length} entries, expected ${want}`);
      process.exit(1);
    }
    codes.forEach((code, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`;
      const { dayType, checkinTime } = toRow(code);
      plan.push({
        userId: idByName[person],
        person,
        date,
        dayType,
        checkinTime: checkinTime ? istToUtcIso(date, checkinTime) : null,
      });
    });
  }
}

const BACKUP_PATH =
  process.env.BACKUP_PATH || `${DB_PATH}.backup-before-attendance-import`;
if (existsSync(BACKUP_PATH)) {
  console.log(`\nbackup already exists, keeping it: ${BACKUP_PATH}`);
} else {
  db.exec(`VACUUM INTO '${BACKUP_PATH.replace(/'/g, "''")}'`);
  console.log(`\nbackup written: ${BACKUP_PATH}`);
}

const now = new Date().toISOString();
const leave = { userId: idByName.Aatish, date: "2026-09-25" };

console.log(`\nplan: ${plan.length} attendance rows for ${wanted.join(", ")}`);
const byType = {};
for (const r of plan) byType[r.dayType] = (byType[r.dayType] || 0) + 1;
console.log("  " + Object.entries(byType).map(([k, v]) => `${k}=${v}`).join("  "));
console.log(`  + 1 approved leave for Aatish on ${leave.date}`);
const timed = plan.filter((r) => r.checkinTime).length;
console.log(`  ${timed} rows carry a real check-in time`);

if (DRY_RUN) {
  console.log("\nDRY RUN - no changes written");
  for (const month of Object.keys(DATA)) {
    console.log(`\n${month}`);
    for (const person of wanted) {
      const rows = plan.filter((r) => r.person === person && r.date.startsWith(month));
      const t = {};
      for (const r of rows) t[r.dayType] = (t[r.dayType] || 0) + 1;
      console.log(`  ${person.padEnd(8)} ${Object.entries(t).map(([k, v]) => `${k}=${v}`).join(" ")}`);
    }
  }
  process.exit(0);
}

const ids = plan.map((r) => r.userId);
const placeholders = ids.map(() => "?").join(",");
const cleared = db.prepare(
  `DELETE FROM attendance WHERE user_id IN (${placeholders}) AND date BETWEEN ? AND ?`
).run(...ids, IMPORT_START, IMPORT_END).changes;
db.prepare(
  `DELETE FROM leave_requests WHERE user_id = ? AND start_date = ? AND end_date = ?`
).run(leave.userId, leave.date, leave.date);
console.log(`\ncleared ${cleared} existing attendance row(s) in range`);

db.prepare(`UPDATE users SET week_off_day = 'Tuesday' WHERE id IN (${placeholders})`).run(...ids);
console.log("week_off_day set to 'Tuesday' for the imported people");

const ins = db.prepare(
  `INSERT INTO attendance (user_id, date, day_type, mode, checkin_time, created_at)
   VALUES (?, ?, ?, 'office', ?, ?)`
);
const run = db.transaction(() => {
  for (const r of plan) ins.run(r.userId, r.date, r.dayType, r.checkinTime, now);
  db.prepare(
    `INSERT INTO leave_requests (user_id, start_date, end_date, reason, status, decided_by, decided_at, created_at)
     VALUES (?, ?, ?, ?, 'approved', ?, ?, ?)`
  ).run(leave.userId, leave.date, leave.date, "On leave", ADMIN_ID, now, now);
});
run();

const total = db.prepare("SELECT COUNT(*) AS c FROM attendance").get().c;
const inRange = db.prepare(
  `SELECT COUNT(*) AS c FROM attendance WHERE date BETWEEN ? AND ?`
).get(IMPORT_START, IMPORT_END).c;
const fk = db.prepare("PRAGMA foreign_key_check").all();
const integrity = db.prepare("PRAGMA integrity_check").get();

console.log(`\ninserted ${plan.length} rows`);
console.log(`  attendance total=${total}  in Jul-Sep range=${inRange}`);
console.log(`  foreign_key_check: ${fk.length ? JSON.stringify(fk) : "clean"}`);
console.log(`  integrity_check: ${integrity.integrity_check}`);

console.log("\nper-person summary");
for (const person of wanted) {
  const rows = db.prepare(
    `SELECT substr(date,1,7) AS m, day_type, COUNT(*) AS c
     FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ?
     GROUP BY 1,2 ORDER BY 1,2`
  ).all(idByName[person], IMPORT_START, IMPORT_END);
  const byMonth = {};
  for (const r of rows) (byMonth[r.m] ??= {})[r.day_type] = r.c;
  console.log(`  ${person} (id ${idByName[person]})`);
  for (const [m, t] of Object.entries(byMonth)) {
    const totalDays = Object.values(t).reduce((a, b) => a + b, 0);
    console.log(`    ${m}  total=${totalDays}  ` + Object.entries(t).map(([k, v]) => `${k}=${v}`).join(" "));
  }
}

db.close();
