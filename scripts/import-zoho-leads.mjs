// Imports the Zoho Bigin lead export into the CRM, matching on phone number.
//
// Idempotent: re-running makes no further changes, because every write is
// "only when the target field is still empty" and every created row (lead,
// site visit, import note) is guarded by an existence check.
//
//   node scripts/import-zoho-leads.mjs
//   DRY_RUN=1 node scripts/import-zoho-leads.mjs
//   CRM_DB_PATH=/var/lib/patang-crm/crm.db CSV_PATH=/tmp/leads_update.csv \
//     node scripts/import-zoho-leads.mjs
//
// Deliberate choices, all confirmed with the business owner:
//
// - Status is FILLED IN ONLY. A lead that has already been worked in the CRM
//   keeps its current status; Zoho never demotes a progressed lead.
// - Due dates are NOT set. next_follow_up stays null so nothing imported lands
//   in the call queue as instantly-overdue and swamps the callers' day.
// - Agents are resolved against the users table by name AND role. Sajan Mishra
//   was removed from the CRM on purpose (scripts/remove-sajan-distribute-leads.mjs)
//   and his leads were redistributed, so those rows are reported, not re-assigned.
// - Zoho timestamps are IST wall clock and are converted to UTC ISO, matching
//   istDayRange() in lib/crm/reports.ts.

import Database from "better-sqlite3";
import fs from "node:fs";

const DB_PATH = process.env.CRM_DB_PATH || "data/crm.db";
const CSV_PATH = process.env.CSV_PATH || "C:/Users/WIN11/Downloads/leads_update.csv";
const DRY_RUN = process.env.DRY_RUN === "1";
const ACTOR_EMAIL = process.env.ACTOR_EMAIL || "admin@patangfuturehomes.com";

const IST_SUFFIX = "+05:30";

// ---------------------------------------------------------------- CSV parsing

/** RFC 4180 parser: handles quoted fields containing commas, quotes and newlines. */
function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ------------------------------------------------------------------- Mappings

/** Zoho stage -> CRM status, ordered by how far the lead has progressed. */
const STAGE_TO_STATUS = {
  "new lead": { status: "new", rank: 0 },
  contacted: { status: "calling", rank: 1 },
  "property search": { status: "qualified", rank: 2 },
  "property shared": { status: "follow_up", rank: 3 },
  "site visit scheduled": { status: "visit_booked", rank: 4 },
  "site visit completed": { status: "visit_done", rank: 5 },
  "plan hold": { status: "negotiation", rank: 6 },
  "token / booking": { status: "booked", rank: 7 },
  // Terminal: ranks below everything so a merge never prefers it.
  "closed lost": { status: "lost", rank: -1 },
};

const SOURCE_MAP = {
  "facebook ads": "facebook",
  whatsapp: "whatsapp",
  instagram: "instagram",
  houssed: "houssed",
  "99acres": "99acres",
  referral: "referral",
};

const LOCATION_MAP = {
  "vasai west": "vasai_west",
  "vasai east": "vasai_east",
  naigaon: "naigaon",
  nalasopara: "nalasopara",
  virar: "virar",
};

/** Only a lead still sitting at `new` is considered untouched. */
const UNTOUCHED_STATUSES = new Set(["new"]);

// -------------------------------------------------------------------- Helpers

const digits = (v) => (v || "").replace(/\D/g, "");
/** Last 10 digits, so "+919819485653", "9819485653" and "09819485653" all agree. */
const phoneKey = (v) => digits(v).slice(-10);

/** "2026-06-05 16:35:33" (IST wall clock) -> "2026-06-05T11:05:33.000Z". */
function istToIso(value) {
  const raw = (value || "").trim();
  if (!raw) return null;
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + IST_SUFFIX);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** "2026-06-17 17:56:53" -> { date: "2026-06-17", time: "17:56" }. */
function splitVisitStamp(value) {
  const raw = (value || "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(raw);
  return m ? { date: m[1], time: m[2] } : null;
}

const isBlank = (v) => !v || !String(v).trim();

/**
 * Columns are added by hand-rolled ALTERs inside getDb() (lib/crm/db.ts), which
 * this script bypasses by opening the database directly. Add anything we write
 * that is missing, so the import works against a database the app has not
 * booted since the column was introduced.
 *
 * This is the one write DRY_RUN still performs: the statements below are
 * prepared (and therefore validated) even when nothing is applied, so the
 * column has to exist. It is a nullable, additive migration that mirrors what
 * the app does on its own first boot, and no lead data is touched.
 */
function ensureColumn(table, column, type) {
  const has = db.prepare(`pragma table_info(${table})`).all().some((c) => c.name === column);
  if (has) return false;
  db.exec(`alter table ${table} add column ${column} ${type}`);
  console.log(`schema: added ${table}.${column} ${type} (pending migration, applied in dry run too)`);
  return true;
}

// ----------------------------------------------------------------------- Main

if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const actor = db.prepare("select id, name from users where email = ?").get(ACTOR_EMAIL);
if (!actor) throw new Error(`actor ${ACTOR_EMAIL} not found`);

ensureColumn("leads", "stage_changed_at", "TEXT");

const fallbackSm =
  db.prepare("select id, name from users where role = 'sales_manager' and active = 1 order by id").get() ||
  actor;

// Agents are matched on name; role decides which assignment column is written.
// Zoho records one of the SMs as just "Vishrut", so an exact miss falls back to
// a first-name match, but only when that is unambiguous.
const users = db.prepare("select id, name, role, active from users").all();
const agentByName = new Map(users.map((u) => [u.name.trim().toLowerCase(), u]));
const agentByFirstName = new Map();
for (const u of users) {
  const first = u.name.trim().toLowerCase().split(/\s+/)[0];
  if (!first) continue;
  if (agentByFirstName.has(first)) agentByFirstName.set(first, null); // ambiguous
  else agentByFirstName.set(first, u);
}

function findAgent(name) {
  const key = (name || "").trim().toLowerCase();
  if (!key) return { agent: null, via: null };
  const exact = agentByName.get(key);
  if (exact) return { agent: exact, via: "exact" };
  const first = agentByFirstName.get(key);
  if (first) return { agent: first, via: "first name" };
  return { agent: null, via: null };
}

const leads = db.prepare("select * from leads").all();
const leadByPhone = new Map();
for (const l of leads) {
  for (const k of [phoneKey(l.phone), phoneKey(l.whatsapp_number)]) {
    if (k.length === 10 && !leadByPhone.has(k)) leadByPhone.set(k, l);
  }
}

const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
const header = rows[0].map((h) => h.trim());
const col = Object.fromEntries(header.map((h, i) => [h, i]));
for (const required of ["bigin_deal_id", "name", "phone10", "stage", "created_at"]) {
  if (col[required] === undefined) throw new Error(`CSV is missing the "${required}" column`);
}

const bad = rows.slice(1).filter((r) => r.length !== header.length);
if (bad.length) throw new Error(`${bad.length} CSV row(s) have the wrong column count; aborting`);

const get = (r, name) => {
  const i = col[name];
  return i === undefined ? "" : (r[i] || "").trim();
};

const stats = {
  rows: rows.length - 1,
  merged: 0,
  matched: 0,
  created: 0,
  statusFilled: 0,
  statusKept: 0,
  agentAssigned: 0,
  agentConflict: 0,
  agentUnknown: 0,
  visitsCreated: 0,
  visitsSkipped: 0,
  notesCreated: 0,
  fieldsFilled: 0,
};

// Collapse rows that share a phone - Zoho holds them as separate deals but they
// are one person, and they match one CRM lead. Keep the furthest-advanced stage
// so a later "Closed Lost" cannot bury an earlier "Site Visit Completed".
const byPhone = new Map();
const skipped = { noPhone: [], unknownAgent: new Map(), badStage: [] };
const phoneCollisions = new Map();

for (const r of rows.slice(1)) {
  const name = get(r, "name");
  const stageKey = get(r, "stage").toLowerCase();
  const stage = STAGE_TO_STATUS[stageKey];
  const phone = phoneKey(get(r, "phone10"));

  if (!phone) {
    skipped.noPhone.push({ name: name || "(blank)", stage: get(r, "stage") });
    continue;
  }
  if (!stage) {
    skipped.badStage.push({ name, stage: get(r, "stage") });
    continue;
  }

  const prev = byPhone.get(phone);
  if (!prev) {
    byPhone.set(phone, { row: r, name, phone, stage, rank: stage.rank });
  } else {
    stats.merged++;
    phoneCollisions.set(phone, [
      ...(phoneCollisions.get(phone) || [{ name: prev.name, stage: get(prev.row, "stage") }]),
      { name, stage: get(r, "stage") },
    ]);
    // A completed visit outranks a lost deal, regardless of row order.
    if (stage.rank > prev.rank) {
      byPhone.set(phone, { row: r, name, phone, stage, rank: stage.rank });
    }
  }
}

const fieldFills = new Map();
const conflicts = [];
const agentAliases = [];
const pending = [];

// next_follow_up, next_action and attempt_count are pinned to "no action due":
// the owner asked for imported leads to stay out of the call queue.
const insertLead = db.prepare(
  `insert into leads
     (name, phone, whatsapp_number, email, source, location, preferred_project,
      status, stage_changed_at, next_follow_up, next_action, attempt_count,
      created_at, updated_at)
   values (?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, 0, ?, ?)`
);
const updateLead = db.prepare(
  `update leads set
     name = coalesce(?, name),
     email = coalesce(?, email),
     source = coalesce(?, source),
     location = coalesce(?, location),
     preferred_project = coalesce(?, preferred_project),
     assigned_caller_id = coalesce(assigned_caller_id, ?),
     assigned_sm_id = coalesce(assigned_sm_id, ?),
     status = ?, stage_changed_at = coalesce(stage_changed_at, ?),
     updated_at = ?
   where id = ?`
);
const insertVisit = db.prepare(
  `insert into site_visits (lead_id, project_id, sm_id, date, time, status, notes, done_at, created_at)
   values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const countVisits = db.prepare("select count(*) n from site_visits where lead_id = ?");
const countNotes = db.prepare(
  "select count(*) n from activities where lead_id = ? and type = 'note' and notes like 'Zoho Bigin import:%'"
);
const insertNote = db.prepare(
  "insert into activities (lead_id, user_id, type, notes, metadata, created_at) values (?, ?, 'note', ?, ?, ?)"
);

const actorJson = (r) =>
  JSON.stringify({
    source: "zoho_bigin",
    dealId: get(r, "bigin_deal_id"),
    contactId: get(r, "bigin_contact_id") || null,
    stage: get(r, "stage"),
    agent: get(r, "assigned_agent") || null,
    leadSource: get(r, "lead_source") || null,
    flags: get(r, "flags") ? get(r, "flags").split("|") : [],
  });

for (const entry of byPhone.values()) {
  const r = entry.row;
  const existing = leadByPhone.get(entry.phone);
  const now = new Date().toISOString();
  const createdAt = istToIso(get(r, "created_at"));

  // --- resolve the agent, by name and by role -------------------------------
  const agentName = get(r, "assigned_agent");
  const { agent, via } = findAgent(agentName);
  let callerId = null;
  let smId = null;
  if (!agentName) {
    // nothing to assign
  } else if (!agent) {
    stats.agentUnknown++;
    skipped.unknownAgent.set(agentName, (skipped.unknownAgent.get(agentName) || 0) + 1);
  } else if (agent.role === "caller") {
    callerId = agent.id;
  } else if (agent.role === "sales_manager") {
    smId = agent.id;
  } else {
    // marketing/admin own no leads; report instead of forcing an assignment.
    stats.agentUnknown++;
    const label = `${agentName} (${agent.role})`;
    skipped.unknownAgent.set(label, (skipped.unknownAgent.get(label) || 0) + 1);
  }
  if (agent && via === "first name") {
    agentAliases.push(`"${agentName}" resolved to ${agent.name}`);
  }

  let leadId;

  if (existing) {
    leadId = existing.id;
    stats.matched++;
    // Fill gaps only - never demote a lead the CRM has already progressed.
    let nextStatus = existing.status;
    if (UNTOUCHED_STATUSES.has(existing.status)) {
      nextStatus = entry.stage.status;
      stats.statusFilled++;
    } else {
      stats.statusKept++;
      if (existing.status !== entry.stage.status) {
        conflicts.push(
          `status: CRM "${existing.status}" kept, Zoho "${entry.stage.status}" (${entry.name || existing.name})`
        );
      }
    }

    // Report rather than overwrite assignments that are already made: the
    // Sajan redistribution in particular must not be undone by stale Zoho data.
    if (existing.assigned_sm_id && smId && existing.assigned_sm_id !== smId) {
      stats.agentConflict++;
      conflicts.push(
        `agent: lead ${existing.id} already has an SM, Zoho agent "${agentName}" not applied (${entry.name || existing.name})`
      );
      smId = null;
    }
    if (existing.assigned_caller_id && callerId && existing.assigned_caller_id !== callerId) {
      stats.agentConflict++;
      callerId = null;
    }
    if (callerId || smId) stats.agentAssigned++;

    const email = get(r, "email") || null;
    const source = SOURCE_MAP[(get(r, "lead_source") || "").toLowerCase()] || null;
    const locationRaw = (get(r, "location") || "").replace(/\s+/g, " ").toLowerCase();
    const location = LOCATION_MAP[locationRaw] || (locationRaw ? "other" : null);
    const project = get(r, "project") || null;

    const fills = [];
    if (isBlank(existing.email) && email) fills.push("email");
    if (isBlank(existing.source) && source) fills.push("source");
    if (isBlank(existing.location) && location) fills.push("location");
    if (isBlank(existing.preferred_project) && project) fills.push("preferred_project");
    for (const f of fills) {
      fieldFills.set(f, (fieldFills.get(f) || 0) + 1);
      stats.fieldsFilled++;
    }

    pending.push(() => {
      updateLead.run(
        !isBlank(existing.name) ? null : entry.name || null,
        isBlank(existing.email) ? email : null,
        isBlank(existing.source) ? source : null,
        isBlank(existing.location) ? location : null,
        isBlank(existing.preferred_project) ? project : null,
        callerId,
        smId,
        nextStatus,
        now,
        now,
        leadId
      );
    });
  } else {
    const email = get(r, "email") || null;
    const source = SOURCE_MAP[(get(r, "lead_source") || "").toLowerCase()] || null;
    const locationRaw = (get(r, "location") || "").replace(/\s+/g, " ").toLowerCase();
    const location = LOCATION_MAP[locationRaw] || (locationRaw ? "other" : null);
    const project = get(r, "project") || null;
    const phone = "+91" + entry.phone;

    stats.created++;
    stats.statusFilled++;
    if (callerId || smId) stats.agentAssigned++;

    pending.push(() => {
      // 11 placeholders: name, phone, whatsapp, email, source, location,
      // project, status, stage_changed_at, created_at, updated_at.
      const info = insertLead.run(
        entry.name || "(unnamed)",
        phone,
        phone,
        email,
        source,
        location,
        project,
        entry.stage.status,
        now,
        createdAt || now,
        now
      );
      leadId = Number(info.lastInsertRowid);
    });
  }

  // --- site visit history (does not affect the call queue) ------------------
  // site_visits.sm_id is NOT NULL, so fall back to an active SM when the Zoho
  // agent is unknown or is a caller rather than a sales manager.
  const visitSm = smId || fallbackSm.id;
  const scheduled = splitVisitStamp(get(r, "visit_scheduled_at"));
  const completed = splitVisitStamp(get(r, "visit_completed_at"));
  const project = get(r, "project") || null;

  // Decided now rather than inside the write, so a dry run reports real numbers.
  if (scheduled && (!existing || countVisits.get(existing.id).n === 0)) {
    stats.visitsCreated++;
    pending.push(() => {
      // A visit is only "done" when it happened on the day it was booked.
      const done = completed && completed.date === scheduled.date;
      insertVisit.run(
        leadId,
        project,
        visitSm,
        done ? completed.date : scheduled.date,
        done ? completed.time : scheduled.time,
        completed ? "visit_done" : "booked",
        get(r, "last_visit_note") || null,
        completed ? istToIso(get(r, "visit_completed_at")) : null,
        istToIso(get(r, "visit_scheduled_at")) || now
      );
    });
  } else if (scheduled) {
    stats.visitsSkipped++;
  }

  // --- provenance note (once per lead) --------------------------------------
  if (!existing || countNotes.get(existing.id).n === 0) {
    stats.notesCreated++;
    pending.push(() => {
      const bits = [
        `Zoho Bigin import: stage "${get(r, "stage")}"`,
        get(r, "lead_source") ? `via ${get(r, "lead_source")}` : null,
        get(r, "assigned_agent") ? `agent ${get(r, "assigned_agent")}` : null,
        get(r, "flags") ? `flags: ${get(r, "flags")}` : null,
      ].filter(Boolean);
      insertNote.run(leadId, actor.id, `${bits.join(" · ")}.`, actorJson(r), now);
    });
  }
}

// ------------------------------------------------------------------- Reporting

console.log(`db        : ${DB_PATH}`);
console.log(`csv       : ${CSV_PATH}`);
console.log(`mode      : ${DRY_RUN ? "DRY RUN (no lead data written)" : "WRITE"}`);
console.log(`actor     : ${actor.name} (id ${actor.id})`);
console.log(`csv rows  : ${stats.rows}`);
console.log(`dupe phone: ${stats.merged} collapsed`);
console.log(`matched   : ${stats.matched}`);
console.log(`created   : ${stats.created}`);
console.log(`status set: ${stats.statusFilled} | kept: ${stats.statusKept}`);
console.log(`agent set : ${stats.agentAssigned} | conflict: ${stats.agentConflict} | unknown: ${stats.agentUnknown}`);
console.log(`visits    : ${stats.visitsCreated} created, ${stats.visitsSkipped} already recorded`);
console.log(`notes     : ${stats.notesCreated}`);
console.log(`call queue: nothing scheduled (next_follow_up is never written)`);
if (fieldFills.size) {
  console.log("fields filled:");
  for (const [f, n] of fieldFills) console.log(`  ${f}: ${n}`);
}
if (agentAliases.length) {
  console.log("\nagent name aliases applied:");
  for (const a of new Set(agentAliases)) console.log(`  ${a}`);
}
if (phoneCollisions.size) {
  console.log(`\nREPORT - ${phoneCollisions.size} phone(s) appear on several Zoho deals, merged to one lead:`);
  for (const [phone, owners] of phoneCollisions) {
    console.log(`  ${phone}: ${owners.map((o) => `${o.name} [${o.stage}]`).join("  +  ")}`);
  }
}
if (skipped.noPhone.length) {
  console.log(`\nSKIPPED - no phone (${skipped.noPhone.length}), cannot be matched or called:`);
  for (const s of skipped.noPhone) console.log(`  ${s.name} | ${s.stage}`);
}
if (skipped.badStage.length) {
  console.log(`\nSKIPPED - unmapped stage (${skipped.badStage.length}):`);
  for (const s of skipped.badStage) console.log(`  ${s.name} | ${s.stage}`);
}
if (skipped.unknownAgent.size) {
  console.log(`\nREPORT - agent not in the users table, left unassigned:`);
  for (const [name, n] of skipped.unknownAgent) console.log(`  ${name}: ${n} lead(s)`);
}

// Status is the field most often already decided in the CRM, so group those
// conflicts by pair rather than printing one line per lead.
if (conflicts.length) {
  const statusPairs = new Map();
  let agentKept = 0;
  for (const c of conflicts) {
    const m = /^status: CRM "(\S+)" kept, Zoho "(\S+)"/.exec(c);
    if (m) {
      const k = `${m[1]} -> ${m[2]}`;
      statusPairs.set(k, (statusPairs.get(k) || 0) + 1);
    } else {
      agentKept++;
    }
  }
  console.log(`\nREPORT - ${conflicts.length} existing value(s) kept over the Zoho value:`);
  console.log("  status (CRM value kept, Zoho value ignored):");
  for (const [k, v] of [...statusPairs.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  if (agentKept) {
    console.log(`  assignment already present in the CRM, left alone: ${agentKept}`);
    console.log("    (this is what protects the Sajan Mishra redistribution from being undone)");
  }
}

if (DRY_RUN) {
  console.log("\nDRY RUN - no lead data was written.");
  db.close();
  process.exit(0);
}

db.transaction(() => {
  for (const step of pending) step();
})();

console.log("\nwritten.");
const after = db.prepare("select count(*) n from leads").get().n;
console.log(`leads total: ${after}`);
const orphan = db
  .prepare(
    `select count(*) n from leads l where l.assigned_sm_id is not null
       and not exists (select 1 from users u where u.id = l.assigned_sm_id)`
  )
  .get().n;
console.log(`leads pointing at a missing user: ${orphan}`);
const queued = db
  .prepare("select count(*) n from leads where deleted_at is null and next_follow_up is not null")
  .get().n;
console.log(`leads carrying a follow-up date: ${queued}`);

db.close();
