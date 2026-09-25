// Removes the Sajan Mishra sales_manager account and randomly distributes the
// unassigned lead pool across the remaining active sales managers.
//
// Idempotent: re-running is a no-op once Sajan is gone and leads are assigned.
//
//   node scripts/remove-sajan-distribute-leads.mjs
//   DRY_RUN=1 node scripts/remove-sajan-distribute-leads.mjs
//   CRM_DB_PATH=/var/lib/patang-crm/crm.db node scripts/remove-sajan-distribute-leads.mjs
//
// Assignment mirrors app/crm/api/leads/bulk/route.ts (action: assign_sm):
// assigned_sm_id, assigned_at, assigned_by, status, next_action, updated_at,
// plus one "assignment" activity row per lead.

import Database from "better-sqlite3";

const DB_PATH = process.env.CRM_DB_PATH || "data/crm.db";
const DRY_RUN = process.env.DRY_RUN === "1";
const REMOVE_NAME = "Sajan Mishra";
const ACTOR_EMAIL = "admin@patangfuturehomes.com";

// Every table/column that must not reference the departing user.
const BLOCKING_REFS = [
  ["attendance", "user_id"],
  ["leave_requests", "user_id"],
  ["leave_requests", "decided_by"],
  ["lead_mentions", "user_id"],
  ["lead_mentions", "mentioned_by_id"],
  ["incentive_payments", "user_id"],
  ["incentive_payments", "paid_by"],
  ["week_off_decisions", "user_id"],
  ["salary_reports", "user_id"],
  ["salary_reports", "generated_by"],
  ["reactivation_alerts", "user_id"],
  ["audit_log", "actor_user_id"],
  ["audit_log", "target_user_id"],
  ["company_holidays", "created_by"],
  ["company_holidays", "removed_by"],
  ["activities", "user_id"],
  ["follow_ups", "user_id"],
  ["site_visits", "sm_id"],
  ["post_visit_feedback", "user_id"],
  ["message_templates", "created_by"],
  ["message_templates", "updated_by"],
  ["message_logs", "user_id"],
  ["negotiations", "assigned_sm_id"],
  ["bookings", "sm_id"],
  ["leads", "assigned_sm_id"],
  ["leads", "assigned_caller_id"],
  ["leads", "assigned_by"],
];

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const departing = db
  .prepare("select id, name, email, role, active from users where name = ?")
  .get(REMOVE_NAME);

if (!departing) {
  console.log(`${REMOVE_NAME} not found - nothing to do.`);
  process.exit(0);
}
if (departing.role !== "sales_manager") {
  throw new Error(`${REMOVE_NAME} has unexpected role "${departing.role}". Aborting.`);
}

const blockers = [];
for (const [table, column] of BLOCKING_REFS) {
  const n = db.prepare(`select count(*) n from ${table} where ${column} = ?`).get(departing.id).n;
  if (n) blockers.push(`${table}.${column}=${n}`);
}
if (blockers.length) {
  throw new Error(
    `${REMOVE_NAME} is still referenced (${blockers.join(", ")}). ` +
      "Reassign or reassign-to-null these rows before deleting the account."
  );
}

const actor = db.prepare("select id, name from users where email = ?").get(ACTOR_EMAIL);
if (!actor) throw new Error(`actor ${ACTOR_EMAIL} not found`);

const sms = db
  .prepare(
    "select id, name from users where role = 'sales_manager' and active = 1 and id != ? order by id"
  )
  .all(departing.id);
if (!sms.length) throw new Error("no active sales manager available to receive leads");

const unassigned = db
  .prepare("select id, name, status from leads where assigned_sm_id is null and deleted_at is null")
  .all();

console.log(`departing : ${departing.name} (id ${departing.id}, ${departing.role})`);
console.log(`actor     : ${actor.name} (id ${actor.id})`);
console.log(`receivers : ${sms.map((s) => `${s.name} (id ${s.id})`).join(", ")}`);
console.log(`leads     : ${unassigned.length} unassigned`);

if (DRY_RUN) {
  const plan = new Map(sms.map((s) => [s.id, 0]));
  for (let i = 0; i < unassigned.length; i++) plan.set(sms[i % sms.length].id, plan.get(sms[i % sms.length].id) + 1);
  console.log("\nDRY RUN - no writes. Plan:");
  for (const s of sms) console.log(`  ${s.name}: +${plan.get(s.id)} leads`);
  process.exit(0);
}

// Randomized round-robin: shuffle the pool so the deal order is random, then hand
// out one lead at a time in a cycle so the split stays even.
for (let i = unassigned.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [unassigned[i], unassigned[j]] = [unassigned[j], unassigned[i]];
}

const now = new Date().toISOString();
const updateLead = db.prepare(
  `update leads
      set assigned_sm_id = ?, assigned_at = ?, assigned_by = ?,
          status = 'assigned', next_action = 'sm_follow_up', updated_at = ?
    where id = ?`
);
const insertActivity = db.prepare(
  `insert into activities (lead_id, user_id, type, notes, created_at)
   values (?, ?, 'assignment', ?, ?)`
);

const counts = new Map(sms.map((s) => [s.id, 0]));

const run = db.transaction(() => {
  unassigned.forEach((lead, i) => {
    const sm = sms[i % sms.length];
    updateLead.run(sm.id, now, actor.id, now, lead.id);
    insertActivity.run(lead.id, actor.id, `Assigned: SM → ${sm.name}`, now);
    counts.set(sm.id, counts.get(sm.id) + 1);
  });
  const removed = db.prepare("delete from users where id = ?").run(departing.id);
  return removed.changes;
});

const removed = run();

console.log("\nassigned:");
for (const s of sms) console.log(`  ${s.name}: +${counts.get(s.id)} leads`);
console.log(`\nremoved ${REMOVE_NAME}: ${removed} user row(s) deleted`);

const check = db.prepare("select count(*) n from leads where assigned_sm_id is null and deleted_at is null").get();
console.log(`remaining unassigned leads: ${check.n}`);
const orphan = db
  .prepare(
    `select count(*) n from leads l
      where l.assigned_sm_id is not null
        and not exists (select 1 from users u where u.id = l.assigned_sm_id)`
  )
  .get().n;
console.log(`leads pointing at a missing user: ${orphan}`);

db.close();
