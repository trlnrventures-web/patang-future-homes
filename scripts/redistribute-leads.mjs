import Database from "better-sqlite3";
const db = new Database("data/crm.db");

const EXCLUDE = new Set(["visit_done", "booked", "revisit_scheduled"]);
const sms = db.prepare("SELECT id, name FROM users WHERE role='sales_manager' AND active=1 ORDER BY id").all();
console.log("SMs:", sms.map((s) => s.name).join(", "));

const cols = db.prepare("PRAGMA table_info(leads)").all().map((c) => c.name);
const hasDeletedAt = cols.includes("deleted_at");
const leads = hasDeletedAt
  ? db.prepare("SELECT id, status, assigned_sm_id FROM leads WHERE deleted_at IS NULL").all()
  : db.prepare("SELECT id, status, assigned_sm_id FROM leads").all();
const eligible = leads.filter((l) => !EXCLUDE.has(l.status));
console.log("eligible leads:", eligible.length);

// open counts
const counts = new Map(sms.map((s) => [s.id, 0]));
for (const l of eligible) {
  if (l.assigned_sm_id != null && counts.has(l.assigned_sm_id)) counts.set(l.assigned_sm_id, counts.get(l.assigned_sm_id) + 1);
}

const now = new Date().toISOString();
const upd = db.prepare("UPDATE leads SET assigned_sm_id=?, assigned_caller_id=?, assigned_at=?, assigned_by=?, updated_at=? WHERE id=?");
let moved = 0;
// sort eligible by id for determinism
eligible.sort((a, b) => a.id - b.id);
for (const l of eligible) {
  // pick SM with fewest open leads
  let pick = sms[0].id;
  let best = Infinity;
  for (const s of sms) {
    const c = counts.get(s.id) ?? 0;
    if (c < best) { best = c; pick = s.id; }
  }
  if (l.assigned_sm_id !== pick) moved++;
  upd.run(pick, pick, now, 1, now, l.id);
  counts.set(pick, (counts.get(pick) ?? 0) + 1);
}
console.log("moved:", moved);
console.log("final counts:", Object.fromEntries(counts));
db.close();
