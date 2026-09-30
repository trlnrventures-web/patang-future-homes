// Assigns Priti Tiwari as the caller on every lead that has no caller, so she can
// see and work the whole pipeline. She is the only caller on the team, so this
// fills the null pool rather than taking leads away from anyone.
//
// Caller-only assignment: it does NOT touch assigned_sm_id, status, next_action
// or stage_changed_at, because the SM side of each lead is already correct and
// resetting status would drag working leads backwards.
//
// assigned_at is deliberately left alone. reports.ts counts a sales manager's
// "assigned" metric by assigned_at inside the report window, so stamping it now
// would retroactively inflate the current period for whoever owns the SM side.
//
// Idempotent: re-running is a no-op once no lead has a null caller.
//
//   node scripts/assign-all-leads-to-priti.mjs
//   DRY_RUN=1 node scripts/assign-all-leads-to-priti.mjs
//   CRM_DB_PATH=/var/lib/patang-crm/crm.db node scripts/assign-all-leads-to-priti.mjs
//
// Mirrors the caller branch of app/crm/api/leads/[id]/route.ts (assigned_caller_id,
// assigned_at, assigned_by) plus one "assignment" activity row per lead, and writes
// a single audit_log entry summarising the bulk change.

import Database from "better-sqlite3";

const DB_PATH = process.env.CRM_DB_PATH || "data/crm.db";
const DRY_RUN = process.env.DRY_RUN === "1";
const CALLER_EMAIL = "priti@patangfuturehomes.com";
const ACTOR_EMAIL = "admin@patangfuturehomes.com";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const caller = db
  .prepare("select id, name, email, role, active from users where email = ?")
  .get(CALLER_EMAIL);

if (!caller) {
  console.error(`No user with email ${CALLER_EMAIL}. Nothing to do.`);
  process.exit(1);
}
if (caller.role !== "caller") {
  console.error(`${caller.name} has role "${caller.role}", expected "caller". Refusing.`);
  process.exit(1);
}

const actor = db
  .prepare("select id, name, email, role from users where email = ?")
  .get(ACTOR_EMAIL);

if (!actor) {
  console.error(`No actor with email ${ACTOR_EMAIL}. Nothing to do.`);
  process.exit(1);
}

const pool = db
  .prepare(
    `select id, name, status, assigned_caller_id, assigned_sm_id, deleted_at
       from leads where assigned_caller_id is null`
  )
  .all();

const already = db
  .prepare("select count(*) n from leads where assigned_caller_id = ?")
  .get(caller.id).n;

const byStatus = new Map();
for (const l of pool) {
  const k = l.deleted_at ? `${l.status} (deleted)` : l.status;
  byStatus.set(k, (byStatus.get(k) || 0) + 1);
}

console.log(`caller  : ${caller.name} (id ${caller.id}, ${caller.role}, active=${caller.active})`);
console.log(`actor   : ${actor.name} (id ${actor.id})`);
console.log(`already hers : ${already}`);
console.log(`to assign    : ${pool.length}`);

if (pool.length === 0) {
  console.log("\nNothing to do - every lead already has a caller.");
  process.exit(0);
}

console.log("\nby status:");
for (const [status, n] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${status}: ${n}`);
}

const noSm = pool.filter((l) => l.assigned_sm_id == null).length;
console.log(`\nnote: ${noSm} of these have no SM either; they stay unowned by an SM.`);

if (DRY_RUN) {
  console.log("\nDRY RUN - no writes.");
  process.exit(0);
}

const now = new Date().toISOString();

// Caller-only: assigned_sm_id, status, next_action and stage_changed_at are
// intentionally not written, and assigned_at keeps its existing value.
const updateLead = db.prepare(
  `update leads
      set assigned_caller_id = ?, assigned_by = ?, updated_at = ?
    where id = ? and assigned_caller_id is null`
);
const insertActivity = db.prepare(
  `insert into activities (lead_id, user_id, type, notes, created_at)
   values (?, ?, 'assignment', ?, ?)`
);
const insertAudit = db.prepare(
  `insert into audit_log (category, action, actor_user_id, target_user_id, entity_type, entity_id, summary, details, created_at)
   values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const run = db.transaction(() => {
  let updated = 0;
  for (const lead of pool) {
    const res = updateLead.run(caller.id, actor.id, now, lead.id);
    if (res.changes === 0) continue;
    updated += 1;
    insertActivity.run(lead.id, actor.id, `Assigned: Caller → ${caller.name}`, now);
  }
  insertAudit.run(
    "lead",
    "lead_bulk_assign_caller",
    actor.id,
    caller.id,
    "user",
    caller.id,
    `Assigned ${updated} lead(s) with no caller to ${caller.name}`,
    JSON.stringify({
      caller: { id: caller.id, name: caller.name },
      actor: { id: actor.id, name: actor.name },
      leadsUpdated: updated,
      byStatus: Object.fromEntries(byStatus),
    }),
    now
  );
  return updated;
});

const updated = run();

console.log(`\nupdated ${updated} lead(s) -> ${caller.name}`);

const verify = {
  nullCallers: db
    .prepare("select count(*) n from leads where assigned_caller_id is null")
    .get().n,
  hers: db
    .prepare("select count(*) n from leads where assigned_caller_id = ?")
    .get(caller.id).n,
  total: db.prepare("select count(*) n from leads").get().n,
  smIntact: db
    .prepare("select count(*) n from leads where assigned_sm_id is not null")
    .get().n,
  activities: db
    .prepare(
      "select count(*) n from activities where type = 'assignment' and notes like ?"
    )
    .get(`%${caller.name}%`).n,
};

console.log("\nverify:");
console.log(`  leads with no caller : ${verify.nullCallers}`);
console.log(`  leads now hers       : ${verify.hers} of ${verify.total}`);
console.log(`  leads with an SM     : ${verify.smIntact} (unchanged by this script)`);
console.log(`  assignment activities: ${verify.activities}`);

if (verify.nullCallers !== 0) {
  console.error("\nWARNING: some leads still have no caller.");
  process.exit(1);
}
console.log("\ndone.");
