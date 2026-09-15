import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";

const DB_PATH =
  process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  ensureDataDir();
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

function createTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'caller',
      phone TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      whatsapp_number TEXT,
      email TEXT,
      source TEXT NOT NULL DEFAULT 'meta',
      campaign_name TEXT,
      ad_set_name TEXT,
      ad_name TEXT,
      form_name TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      original_project TEXT,
      original_message TEXT,
      location TEXT,
      budget TEXT,
      budget_min INTEGER,
      budget_max INTEGER,
      bhk TEXT,
      purpose TEXT,
      timeline TEXT,
      preferred_project TEXT,
      family_requirements TEXT,
      loan_required INTEGER,
      other_preferences TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      lead_score INTEGER DEFAULT 0,
      next_follow_up TEXT,
      next_action TEXT,
      concern TEXT,
      first_call_at TEXT,
      first_response_time_seconds INTEGER,
      sla_status TEXT,
      attempt_count INTEGER DEFAULT 0,
      last_attempt_at TEXT,
      next_attempt_at TEXT,
      assigned_caller_id INTEGER,
      assigned_sm_id INTEGER,
      assigned_at TEXT,
      assigned_by INTEGER,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS crm_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      notes TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      scheduled_for TEXT NOT NULL,
      purpose TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      completed_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS site_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      project_id TEXT,
      sm_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      meeting_point TEXT,
      family_attending TEXT,
      transport_requirement TEXT,
      status TEXT NOT NULL DEFAULT 'proposed',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS post_visit_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL,
      lead_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      interest TEXT,
      liked_property TEXT,
      main_objection TEXT,
      expected_budget TEXT,
      other_projects TEXT,
      next_action TEXT,
      next_follow_up TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      body TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      is_personal INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL,
      updated_by INTEGER,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS message_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      template_id INTEGER,
      category TEXT,
      rendered_message TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      project_id TEXT,
      unit TEXT,
      bhk TEXT,
      booking_date TEXT NOT NULL,
      booking_amount INTEGER,
      total_value INTEGER,
      sm_id INTEGER NOT NULL,
      lead_source TEXT,
      campaign_name TEXT,
      status TEXT NOT NULL DEFAULT 'initiated',
      cancellation_reason TEXT,
      floor TEXT,
      carpet_area TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS negotiations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      project_id TEXT,
      unit TEXT,
      bhk TEXT,
      assigned_sm_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'negotiation_started',
      expected_price INTEGER,
      quoted_price INTEGER,
      final_discussed_price INTEGER,
      booking_amount_discussed INTEGER,
      unit_preference TEXT,
      floor_preference TEXT,
      facing_preference TEXT,
      payment_preference TEXT,
      loan_requirement TEXT,
      objections TEXT,
      competing_projects TEXT,
      notes TEXT,
      lost_reason TEXT,
      next_action TEXT,
      next_action_at TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'other',
      project TEXT,
      objective TEXT,
      start_date TEXT,
      end_date TEXT,
      budget INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      external_id TEXT,
      external_platform TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS campaign_spend (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      spend INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      impressions INTEGER,
      reach INTEGER,
      clicks INTEGER,
      leads INTEGER,
      external_ad_set_id TEXT,
      external_ad_set_name TEXT,
      external_ad_id TEXT,
      external_ad_name TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );

    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_caller ON leads(assigned_caller_id);
    CREATE INDEX IF NOT EXISTS idx_leads_sm ON leads(assigned_sm_id);
    CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
    CREATE INDEX IF NOT EXISTS idx_message_logs_lead ON message_logs(lead_id);
    CREATE INDEX IF NOT EXISTS idx_follow_ups_lead ON follow_ups(lead_id);
    CREATE INDEX IF NOT EXISTS idx_site_visits_lead ON site_visits(lead_id);
    CREATE INDEX IF NOT EXISTS idx_negotiations_lead ON negotiations(lead_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_lead ON bookings(lead_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_sm ON bookings(sm_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_platform ON campaigns(platform);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_campaign_spend_campaign ON campaign_spend(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_spend_date ON campaign_spend(date);
    CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
    CREATE INDEX IF NOT EXISTS idx_leads_campaign_name ON leads(campaign_name);
    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
  `);

  migrateLeads(sqlite);
  migrateBookings(sqlite);
}

function migrateLeads(sqlite: Database.Database) {
  const cols = sqlite.prepare("PRAGMA table_info(leads)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  const additions: Array<[string, string]> = [
    ["next_action", "TEXT"],
    ["concern", "TEXT"],
    ["first_call_at", "TEXT"],
    ["first_response_time_seconds", "INTEGER"],
    ["sla_status", "TEXT"],
    ["attempt_count", "INTEGER DEFAULT 0"],
    ["last_attempt_at", "TEXT"],
    ["next_attempt_at", "TEXT"],
    ["assigned_at", "TEXT"],
    ["assigned_by", "INTEGER"],
  ];
  for (const [name, decl] of additions) {
    if (!have.has(name)) {
      sqlite.exec(`ALTER TABLE leads ADD COLUMN ${name} ${decl}`);
    }
  }
  seedSettings(sqlite);
}

function migrateBookings(sqlite: Database.Database) {
  const cols = sqlite.prepare("PRAGMA table_info(bookings)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  const additions: Array<[string, string]> = [
    ["status", "TEXT NOT NULL DEFAULT 'initiated'"],
    ["cancellation_reason", "TEXT"],
    ["floor", "TEXT"],
    ["carpet_area", "TEXT"],
    ["updated_at", "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, decl] of additions) {
    if (!have.has(name)) {
      sqlite.exec(`ALTER TABLE bookings ADD COLUMN ${name} ${decl}`);
    }
  }
}

function seedSettings(sqlite: Database.Database) {
  const count = sqlite.prepare("SELECT COUNT(*) AS c FROM crm_settings").get() as { c: number };
  if (count.c > 0) return;
  const now = new Date().toISOString();
  const settings = {
    sla_first_response_min: "5",
    budget_ranges: '["under_25","25_40","40_60","60_85","85_plus"]',
    matching_weights: '{"budget":30,"location":20,"bhk":15,"timeline":15,"purpose":10,"preferences":10}',
    no_response_schedule: '{"1":0,"2":240,"3":1440,"4":4320,"5":10080}',
  };
  const insert = sqlite.prepare("INSERT INTO crm_settings (key, value, updated_at) VALUES (?, ?, ?)");
  for (const [key, value] of Object.entries(settings)) {
    insert.run(key, value, now);
  }
}

export function getDb() {
  if (!_db) {
    _db = createDb();
    const sqlite = _db.$client as unknown as Database.Database;
    createTables(sqlite);
    seedData();
  }
  return _db;
}

function seedData() {
  const db = _db!;
  const sqlite = db.$client as unknown as Database.Database;

  const userCount = sqlite.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  if (userCount.c === 0) {
    const hash = bcrypt.hashSync("admin123", 10);
    const now = new Date().toISOString();

    const insertUser = sqlite.prepare(
      "INSERT INTO users (name, email, password_hash, role, phone, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)"
    );

    insertUser.run("Admin", "admin@patangfuturehomes.com", hash, "admin", "917249138197", now);
    insertUser.run("Priti Tiwari", "priti@patangfuturehomes.com", hash, "caller", "917249138197", now);
    insertUser.run("Aatish Kini", "aatish@patangfuturehomes.com", hash, "sales_manager", "917249138197", now);
    insertUser.run("Sajan Mishra", "sajan@patangfuturehomes.com", hash, "sales_manager", "917249138197", now);
    insertUser.run("Vishrut Jain", "vishrut@patangfuturehomes.com", hash, "sales_manager", "917249138197", now);
    insertUser.run("Kirit Godaniya", "kirit@patangfuturehomes.com", hash, "sales_manager", "917249138197", now);
  }

  seedMessageTemplates(sqlite);
  ensureMarketingUser(sqlite);
}

function ensureMarketingUser(sqlite: Database.Database) {
  const email = "marketing@patangfuturehomes.com";
  const existing = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return;
  const hash = bcrypt.hashSync("marketing123", 10);
  const now = new Date().toISOString();
  sqlite
    .prepare(
      "INSERT INTO users (name, email, password_hash, role, phone, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)"
    )
    .run("Marketing Team", email, hash, "marketing", "917249138197", now);
}

function seedMessageTemplates(sqlite: Database.Database) {
  const templates = [
    // FIRST CONTACT
    { name: "First Contact - Meta Lead", category: "first_contact", body: "Hi {{name}} sir, Patang Future Homes se call ho raha hai. Aapne Vasai West property ke liye enquiry ki thi. Aapki requirement thodi samajh leta hoon, phir uske according suitable options bata deta hoon." },
    { name: "First Contact - Website Lead", category: "first_contact", body: "Hi {{name}} sir, Patang Future Homes se baat ho rahi hai. Humari website pe aapki property enquiry aayi thi. Aap kis area mein dekh rahe ho aur budget kitna hai?" },

    // MISSED CALL
    { name: "Missed Call Follow-up", category: "missed_call", body: "Hi {{name}} sir, aapse call connect ho nahi paaya. Kya aap bata sakte kab free rahega? Main us time pe call kar leta hoon." },
    { name: "Missed Call - Retry", category: "missed_call", body: "{{name}} sir, abhi aapka miss call aaya tha Patang Future Homes se. Property ke baare mein kuch baat karni thi. Kab convenient rahega aap?" },

    // NO ANSWER
    { name: "No Answer - Try Again", category: "no_answer", body: "Hi {{name}} sir, kuch der pehle call kiya tha but connect nahi ho paaya. Aap bata sakte kab reachable rahoge? Property options shortlist kiye hain, share karna chahta hoon." },
    { name: "No Answer - WhatsApp", category: "no_answer", body: "Hi {{name}} sir, Patang Future Homes se call kiya tha but aap busy lag rahe the. Koi baat nahi. Aapki requirement ke according Vasai West mein kuch options hain. Jab free ho tab bataiye, details share kar deta hoon." },

    // REQUIREMENT CONFIRMATION
    { name: "Requirement Confirmation", category: "requirement_confirmation", body: "Hi {{name}} sir, aapki requirement confirm kar leta hoon:\n\nLocation: {{location}}\nBudget: {{budget}}\nConfig: {{bhk}} BHK\nTimeline: {{timeline}}\n\nYe sahi hai ya koi change hai?" },
    { name: "Requirement - Budget Check", category: "requirement_confirmation", body: "{{name}} sir, aapka budget {{budget}} hai aur {{bhk}} BHK chahiye Vasai West mein. Aapko loan ki zaroorat hogi kya? Aur koi specific location preference hai?" },

    // PROPERTY OPTION
    { name: "Property Option Share", category: "property_option", body: "Hi {{name}} sir, aapki requirement ke according {{project}} mein ek accha option hai:\n\n{{bhk}} BHK\nBudget: {{budget}}\nLocation: {{location}}\n\nAgar interested ho toh site visit fix kar sakte hain." },
    { name: "Property Option - New Listing", category: "property_option", body: "{{name}} sir, aapki requirement ke according ek naya option aaya hai — {{project}}, {{location}} mein. {{bhk}} BHK, {{budget}} range mein. Details share karu?" },

    // ALTERNATIVE PROJECT
    { name: "Alternative Project Suggestion", category: "alternative_project", body: "Hi {{name}} sir, agar {{original_project}} aapki requirement mein fit nahi aa raha toh koi issue nahi. Aapke {{budget}} budget aur {{bhk}} BHK requirement ke according Vasai West mein kuch aur options bhi check kiye hain." },
    { name: "Alternative Project - New Option", category: "alternative_project", body: "{{name}} sir, aapne pehle {{original_project}} mein interest dikhaya tha. Uske alawa Vasai West mein {{project}} bhi dekh sakte ho — {{bhk}} BHK, {{budget}} range mein, aur location bhi acchi hai." },

    // BUDGET ALTERNATIVE
    { name: "Budget Alternative", category: "budget_alternative", body: "Hi {{name}} sir, agar {{original_project}} ka budget thoda zyada lag raha hai toh koi issue nahi. Aapke budget ke according Vasai West mein aur bhi options available hain. Main 2-3 suitable options bata deta hoon." },
    { name: "Budget Alternative - Lower Range", category: "budget_alternative", body: "{{name}} sir, aapki requirement ke hisaab se {{budget}} range mein Vasai West mein acche options mil rahe hain. {{bhk}} BHK, ready possession bhi available hai kuch projects mein. Details chahiye?" },

    // FOLLOW-UP
    { name: "Follow-up - General", category: "follow_up", body: "Hi {{name}} sir, aapki Vasai West property requirement ke regarding follow-up kar raha hoon. Aapke budget aur requirement ke according kuch options shortlist kiye hain. Aap chaho toh main details share kar deta hoon." },
    { name: "Follow-up - After Discussion", category: "follow_up", body: "{{name}} sir, jo options discuss kiye the uske baare mein socha? Koi update hai toh bataiye, aur koi naya option bhi dekh raha hoon aapke liye." },
    { name: "Follow-up - Value Based", category: "follow_up", body: "{{name}} sir, ek useful update hai — Vasai West mein abhi kuch projects mein festive offer chal raha hai. Agar aap abhi decide kar lete ho toh acchi deal mil sakti hai. Discuss karein?" },

    // SITE VISIT PROPOSAL
    { name: "Site Visit Proposal", category: "site_visit_proposal", body: "Hi {{name}} sir, aapki {{project}} site visit schedule kar sakte hain. Aapko kaun sa din convenient rahega? Main uss din ke liye slot fix kar deta hoon." },
    { name: "Site Visit - Multiple Options", category: "site_visit_proposal", body: "{{name}} sir, aapke liye 2-3 projects shortlist kiye hain. Ek saath 2 projects bhi dekh sakte ho ek din mein. Kab free ho aap?" },

    // SITE VISIT CONFIRMATION
    { name: "Site Visit Confirmation", category: "site_visit_confirmation", body: "Hi {{name}} sir, aapki {{project}} site visit {{visit_date}} ko {{visit_time}} par confirm ho gayi hai. Meeting point: {{location}}. Aap nikalne se pehle ek baar confirm kar dijiyega." },
    { name: "Site Visit - Quick Confirm", category: "site_visit_confirmation", body: "{{name}} sir, {{project}} ki site visit {{visit_time}} par hai. Please confirm kar dijiye ki aap aa rahe ho." },

    // DAY-BEFORE VISIT REMINDER
    { name: "Day Before Visit Reminder", category: "day_before_reminder", body: "Hi {{name}} sir, kal aapki {{project}} ki site visit hai. Please yaad rakhiyega. Agar koi change ho toh bata dijiye, hum adjust kar lenge." },
    { name: "Day Before - Detailed", category: "day_before_reminder", body: "{{name}} sir, kal {{visit_date}} ko {{project}} ki site visit scheduled hai {{visit_time}} par. Location: {{location}}. Koi questions ho toh poochh sakte ho." },

    // SAME-DAY VISIT REMINDER
    { name: "Same Day Visit Reminder", category: "same_day_reminder", body: "Hi {{name}} sir, aaj {{project}} ki site visit hai. {{visit_time}} par aana hai. Nikalne se pehle ek baar message kar dijiye." },
    { name: "Same Day - Quick", category: "same_day_reminder", body: "{{name}} sir, aaj ki site visit yaad rahe? {{project}} — {{visit_time}}. Main wahan milunga." },

    // POST-VISIT
    { name: "Post Visit - Feedback", category: "post_visit", body: "Hi {{name}} sir, aaj {{project}} ki site visit ho gayi. Kaisa laga aapko? Koi feedback hai toh bataiye, aage kya karna hai wo discuss kar lete hain." },
    { name: "Post Visit - Next Step", category: "post_visit", body: "{{name}} sir, site visit ke baare mein socha? Agar pasand aaya hai toh aage ka process bata deta hoon. Koi doubt hai toh clear kar lete hain." },

    // NEGOTIATION
    { name: "Negotiation - Best Price", category: "negotiation", body: "{{name}} sir, aapke budget ke hisaab se developer se baat ki hai. Best possible price mil raha hai. Agar aap ready ho toh final kar sakte hain." },
    { name: "Negotiation - Limited Time", category: "negotiation", body: "{{name}} sir, {{project}} mein abhi acchi deal aa rahi hai. Ye price limited time ke liye hai. Agar interested ho toh jaldi discuss kar lete hain." },

    // NURTURE
    { name: "Nurture - Monthly Update", category: "nurture", body: "Hi {{name}} sir, Patang Future Homes se update — Vasai West mein kuch naye projects aa rahe hain aur kuch existing mein price revision bhi ho sakta hai. Agar abhi bhi property dekh rahe ho toh bataiye." },
    { name: "Nurture - Festival Offer", category: "nurture", body: "{{name}} sir, festive season mein Vasai West ke kuch projects mein special offers chal rahe hain. Agar abhi bhi soch rahe ho toh ek baar discuss kar lete hain." },
  ];

  const now = new Date().toISOString();
  const insert = sqlite.prepare(
    "INSERT INTO message_templates (name, category, body, active, is_personal, created_by, created_at) VALUES (?, ?, ?, 1, 0, 1, ?)"
  );

  for (const t of templates) {
    insert.run(t.name, t.category, t.body, now);
  }
}