/**
 * One-off data correction for four existing bookings (June–August 2026).
 *
 * The four leads were marked "booked" through the legacy lead-status flow, so
 * their booking month was derived from leads.updated_at. That produced the wrong
 * month for Mahesh Tallreja (September instead of July) and left Siddesh Raut
 * uncounted for August. This script backfills a proper confirmed booking row per
 * lead with the accurate booking date + Sales Manager, sets the Caller on the
 * lead (caller incentives are derived from leads.assigned_caller_id), records the
 * property type on the lead and booking, and logs a correction note.
 *
 * Idempotent: safe to run repeatedly. A booking is upserted per lead and the
 * correction activity is only inserted once.
 *
 * Usage:
 *   node scripts/correct-bookings-2026.mjs            # apply
 *   DRY_RUN=1 node scripts/correct-bookings-2026.mjs  # preview only
 *   CRM_DB_PATH=/var/lib/patang-crm/crm.db node scripts/correct-bookings-2026.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH =
  process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const DRY_RUN = process.env.DRY_RUN === "1";

const CORRECTION_MARKER =
  "Booking data corrected: date, SM, and property type updated to reflect actual sale";

const CORRECTIONS = [
  {
    name: "M Vartak",
    phone: "9004508813",
    bookingDate: "2026-06-20",
    sm: "Vishrut Jain",
    caller: "Priti Tiwari",
    propertyType: "Shop",
    detail:
      "Original enquiry was recorded as Luxembourg (flat); corrected to a Shop purchase.",
  },
  {
    name: "Mahesh Tallreja",
    phone: "7385378133",
    bookingDate: "2026-07-29",
    sm: "Aatish Kini",
    caller: "Priti Tiwari",
    propertyType: "2 BHK Resale",
    detail: "Purchased a 2 BHK resale unit at Dattani Vertex.",
  },
  {
    name: "Ruchita Shah",
    phone: "9819485653",
    bookingDate: "2026-08-08",
    sm: "Kirit Godaniya",
    caller: "Priti Tiwari",
    propertyType: "Resale",
    detail: "Purchased a resale property at Dattani Vertex (broker Piyush).",
  },
  {
    name: "Siddesh Raut",
    phone: "9028871687",
    bookingDate: "2026-08-16",
    sm: "Kirit Godaniya",
    caller: "Priti Tiwari",
    propertyType: null,
    detail: "Booking date and Sales Manager corrected; property type not specified.",
  },
];

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function istMonthKey(value) {
  const d = new Date(value);
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

const digits = (s) => String(s || "").replace(/\D/g, "");

const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

const usersByName = new Map(
  db.prepare("select id, name, role from users").all().map((u) => [u.name, u])
);
const admin =
  db.prepare("select id from users where role = 'admin' order by id limit 1").get() ||
  null;

const allLeads = db.prepare("select * from leads").all();

function findLead(phone) {
  const target = digits(phone).slice(-10);
  return allLeads.find((l) => digits(l.phone).slice(-10) === target);
}

const smLadder = [
  { threshold: 1, rate: 5000 },
  { threshold: 2, rate: 7000 },
  { threshold: 3, rate: 10000 },
  { threshold: 4, rate: 12000 },
  { threshold: 5, rate: 15000 },
];
const callerLadder = [
  { threshold: 1, rate: 2000 },
  { threshold: 5, rate: 2500 },
  { threshold: 10, rate: 3000 },
];

function rateFor(ladder, count) {
  if (count <= 0) return 0;
  for (let i = ladder.length - 1; i >= 0; i--) {
    if (count >= ladder[i].threshold) return ladder[i].rate;
  }
  return 0;
}

/** Mirrors lib/crm/incentives.ts confirmedBookingsForMonth + ladder math. */
function incentiveReport(month) {
  const leads = db
    .prepare("select id, status, assigned_sm_id, assigned_caller_id, created_at, updated_at from leads")
    .all();
  const allConfirmed = db
    .prepare("select id, lead_id, sm_id, booking_date, status from bookings")
    .all()
    .filter((b) => b.status === "confirmed");
  const bookings = allConfirmed.filter(
    (b) => istMonthKey(b.booking_date) === month
  );

  const counted = new Set(allConfirmed.map((b) => b.lead_id));
  const callerByLead = new Map(leads.map((l) => [l.id, l.assigned_caller_id]));
  const rows = [
    ...bookings.map((b) => ({ smId: b.sm_id, callerId: callerByLead.get(b.lead_id) ?? null })),
    ...leads
      .filter((l) => l.status === "booked" && !counted.has(l.id))
      .filter((l) => istMonthKey(l.updated_at || l.created_at) === month)
      .map((l) => ({ smId: l.assigned_sm_id, callerId: l.assigned_caller_id })),
  ];

  const smCounts = new Map();
  const callerCounts = new Map();
  for (const r of rows) {
    if (r.smId != null) smCounts.set(r.smId, (smCounts.get(r.smId) ?? 0) + 1);
    if (r.callerId != null) callerCounts.set(r.callerId, (callerCounts.get(r.callerId) ?? 0) + 1);
  }

  const nameOf = (id) => usersByName.get([...usersByName.keys()].find((n) => usersByName.get(n).id === id))?.name ?? `#${id}`;
  const sm = [...smCounts.entries()].map(([id, count]) => ({
    id,
    name: nameOf(id),
    count,
    rate: rateFor(smLadder, count),
    total: count * rateFor(smLadder, count),
  }));
  const caller = [...callerCounts.entries()].map(([id, count]) => ({
    id,
    name: nameOf(id),
    count,
    rate: rateFor(callerLadder, count),
    total: count * rateFor(callerLadder, count),
  }));
  return { month, bookings: rows.length, sm, caller };
}

console.log(`DB: ${DB_PATH}`);
console.log(DRY_RUN ? "MODE: DRY RUN (no writes)\n" : "MODE: APPLY\n");

for (const c of CORRECTIONS) {
  const lead = findLead(c.phone);
  if (!lead) {
    console.warn(`!! Lead not found for ${c.name} (${c.phone}) — skipped`);
    continue;
  }
  const sm = usersByName.get(c.sm);
  const caller = usersByName.get(c.caller);
  if (!sm || !caller) {
    console.warn(`!! Missing user (SM=${c.sm}, Caller=${c.caller}) — skipped`);
    continue;
  }

  const now = new Date().toISOString();
  const bookingIso = new Date(`${c.bookingDate}T00:00:00.000Z`).toISOString();
  const existingBooking = db
    .prepare("select id from bookings where lead_id = ?")
    .get(lead.id);

  console.log(
    `${DRY_RUN ? "[dry] " : ""}${c.name} (lead #${lead.id}): ` +
      `booking ${c.bookingDate} → SM ${sm.name} (${sm.id}), Caller ${caller.name} (${caller.id}), ` +
      `type ${c.propertyType ?? "(unchanged)"}, booking row ${existingBooking ? `update #${existingBooking.id}` : "insert"}`
  );

  if (DRY_RUN) continue;

  db.prepare(
    `update leads
       set assigned_sm_id = ?, assigned_caller_id = ?, status = 'booked',
           bhk = coalesce(?, bhk), updated_at = ?
     where id = ?`
  ).run(sm.id, caller.id, c.propertyType, now, lead.id);

  const bookingNotes = `Corrected booking record — ${c.detail}`;
  if (existingBooking) {
    db.prepare(
      `update bookings
         set booking_date = ?, sm_id = ?, bhk = coalesce(?, bhk),
             status = 'confirmed', notes = ?, updated_at = ?
       where id = ?`
    ).run(bookingIso, sm.id, c.propertyType, bookingNotes, now, existingBooking.id);
  } else {
    db.prepare(
      `insert into bookings
         (lead_id, project_id, unit, bhk, booking_date, sm_id, status, notes, created_at, updated_at)
       values (?, null, null, ?, ?, ?, 'confirmed', ?, ?, ?)`
    ).run(lead.id, c.propertyType, bookingIso, sm.id, bookingNotes, now, now);
  }

  const alreadyLogged = db
    .prepare("select id from activities where lead_id = ? and type = 'note' and notes = ?")
    .get(lead.id, CORRECTION_MARKER);
  if (!alreadyLogged) {
    db.prepare(
      `insert into activities (lead_id, user_id, type, notes, metadata, created_at)
       values (?, ?, 'note', ?, ?, ?)`
    ).run(
      lead.id,
      admin?.id ?? caller.id,
      CORRECTION_MARKER,
      JSON.stringify({
        correction: true,
        bookingDate: c.bookingDate,
        salesManager: c.sm,
        caller: c.caller,
        propertyType: c.propertyType,
        detail: c.detail,
      }),
      now
    );
  }
}

console.log("\n=== Incentive breakdown (June–September 2026) ===");
for (const month of ["2026-06", "2026-07", "2026-08", "2026-09"]) {
  const r = incentiveReport(month);
  console.log(`\n${month}  (${r.bookings} confirmed booking${r.bookings === 1 ? "" : "s"})`);
  if (r.sm.length === 0) console.log("  SM:     —");
  for (const e of r.sm) {
    console.log(`  SM:     ${e.name} — ${e.count} booking(s) × ₹${e.rate.toLocaleString("en-IN")} = ₹${e.total.toLocaleString("en-IN")}`);
  }
  if (r.caller.length === 0) console.log("  Caller: —");
  for (const e of r.caller) {
    console.log(`  Caller: ${e.name} — ${e.count} unit(s) × ₹${e.rate.toLocaleString("en-IN")} = ₹${e.total.toLocaleString("en-IN")}`);
  }
}

db.close();
console.log("\nDone.");
