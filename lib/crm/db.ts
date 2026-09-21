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
      week_off_day TEXT,
      last_login_at TEXT,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      email TEXT PRIMARY KEY,
      failed_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      updated_at TEXT
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
      sublocation TEXT,
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
      property_shown TEXT,
      recommended_properties TEXT,
      properties_shown TEXT,
      done_at TEXT,
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

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'office',
      field_duty_reason TEXT,
      checkin_time TEXT,
      checkout_time TEXT,
      checkin_lat TEXT,
      checkin_lng TEXT,
      checkin_distance_m INTEGER,
      checkout_lat TEXT,
      checkout_lng TEXT,
      checkout_distance_m INTEGER,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      rejection_reason TEXT,
      decided_by INTEGER,
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS lead_mentions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      mentioned_by_id INTEGER NOT NULL,
      note_id INTEGER,
      note_snippet TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (mentioned_by_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
    CREATE INDEX IF NOT EXISTS idx_lead_mentions_user ON lead_mentions(user_id);
    CREATE INDEX IF NOT EXISTS idx_lead_mentions_lead ON lead_mentions(lead_id);

    CREATE TABLE IF NOT EXISTS incentive_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      role TEXT NOT NULL,
      amount INTEGER NOT NULL,
      paid_by INTEGER,
      paid_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (paid_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_incentive_payments_user_month ON incentive_payments(user_id, month);

    CREATE TABLE IF NOT EXISTS reactivation_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_slug TEXT NOT NULL,
      lead_id INTEGER NOT NULL,
      user_id INTEGER,
      match_score INTEGER DEFAULT 0,
      dismissed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_reactivation_alerts_user ON reactivation_alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_reactivation_alerts_project ON reactivation_alerts(project_slug);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_user_id INTEGER,
      target_user_id INTEGER,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (actor_user_id) REFERENCES users(id),
      FOREIGN KEY (target_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_category ON audit_log(category);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_user_id);

    CREATE TABLE IF NOT EXISTS company_holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT '',
      removed_by INTEGER,
      removed_at TEXT,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (removed_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_company_holidays_date ON company_holidays(date);

    CREATE TABLE IF NOT EXISTS week_off_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      decision TEXT NOT NULL,
      leave_banked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_week_off_decisions_user_date ON week_off_decisions(user_id, date);

    CREATE TABLE IF NOT EXISTS salary_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      base_salary INTEGER NOT NULL,
      days_present INTEGER NOT NULL DEFAULT 0,
      days_late INTEGER NOT NULL DEFAULT 0,
      days_absent INTEGER NOT NULL DEFAULT 0,
      leave_days INTEGER NOT NULL DEFAULT 0,
      leave_days_bank_covered INTEGER NOT NULL DEFAULT 0,
      leave_days_deductible INTEGER NOT NULL DEFAULT 0,
      week_offs_taken INTEGER NOT NULL DEFAULT 0,
      week_offs_worked_banked INTEGER NOT NULL DEFAULT 0,
      holidays_in_month INTEGER NOT NULL DEFAULT 0,
      incentive_earned INTEGER NOT NULL DEFAULT 0,
      deductions INTEGER NOT NULL DEFAULT 0,
      net_paid INTEGER NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      payment_date TEXT,
      generated_by INTEGER,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (generated_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_salary_reports_user_month ON salary_reports(user_id, month);

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
  migrateUsers(sqlite);
  migrateSiteVisits(sqlite);
  migrateMessageTemplates(sqlite);
}

function migrateUsers(sqlite: Database.Database) {
  const cols = sqlite.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("reset_requested_at")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN reset_requested_at TEXT");
  }
  if (!have.has("week_off_day")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN week_off_day TEXT");
  }
  if (!have.has("last_login_at")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
  }
  if (!have.has("must_change_password")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");
  }
  if (!have.has("base_salary")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN base_salary INTEGER");
  }
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
    ["sublocation", "TEXT"],
    ["deleted_at", "TEXT"],
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

function migrateSiteVisits(sqlite: Database.Database) {
  const cols = sqlite.prepare("PRAGMA table_info(site_visits)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("done_at")) {
    sqlite.exec("ALTER TABLE site_visits ADD COLUMN done_at TEXT");
  }
  if (!have.has("property_shown")) {
    sqlite.exec("ALTER TABLE site_visits ADD COLUMN property_shown TEXT");
  }
  if (!have.has("recommended_properties")) {
    sqlite.exec("ALTER TABLE site_visits ADD COLUMN recommended_properties TEXT");
  }
  if (!have.has("properties_shown")) {
    sqlite.exec("ALTER TABLE site_visits ADD COLUMN properties_shown TEXT");
  }
}

function seedSettings(sqlite: Database.Database) {
  const count = sqlite.prepare("SELECT COUNT(*) AS c FROM crm_settings").get() as { c: number };
  if (count.c > 0) return;
  const now = new Date().toISOString();
  const settings = {
    sla_first_response_min: "5",
    budget_ranges: '["under_25","25_40","40_60","60_85","85_plus"]',
    matching_weights: '{"subLocation":40,"location":20,"budget":25,"budgetPartial":10}',
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

    // Set default base salaries
    sqlite.exec("UPDATE users SET base_salary = 25000 WHERE role = 'caller'");
    sqlite.exec("UPDATE users SET base_salary = 30000 WHERE role = 'sales_manager'");
    sqlite.exec("UPDATE users SET base_salary = 50000 WHERE role = 'admin'");
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

function migrateMessageTemplates(sqlite: Database.Database) {
  const hasTemplates = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_templates'")
    .get();
  if (!hasTemplates) return;

  const LEGACY_CATEGORY_MAP: Record<string, string> = {
    missed_call: "first_contact",
    no_answer: "first_contact",
    requirement_confirmation: "follow_up",
    budget_alternative: "property_option",
    site_visit_proposal: "visit_confirmation",
    site_visit_confirmation: "visit_confirmation",
    day_before_reminder: "visit_reminder",
    same_day_reminder: "visit_reminder",
    negotiation: "follow_up",
    nurture: "follow_up",
    custom: "follow_up",
  };

  for (const [oldCategory, newCategory] of Object.entries(LEGACY_CATEGORY_MAP)) {
    sqlite
      .prepare("UPDATE message_templates SET category = ? WHERE category = ?")
      .run(newCategory, oldCategory);
    sqlite
      .prepare("UPDATE message_logs SET category = ? WHERE category = ?")
      .run(newCategory, oldCategory);
  }

  const legacySeedNames = [
    "First Contact - Meta Lead",
    "First Contact - Website Lead",
    "Missed Call Follow-up",
    "Missed Call - Retry",
    "No Answer - Try Again",
    "No Answer - WhatsApp",
    "Requirement Confirmation",
    "Requirement - Budget Check",
    "Property Option Share",
    "Property Option - New Listing",
    "Alternative Project Suggestion",
    "Alternative Project - New Option",
    "Budget Alternative",
    "Budget Alternative - Lower Range",
    "Follow-up - General",
    "Follow-up - After Discussion",
    "Follow-up - Value Based",
    "Site Visit Proposal",
    "Site Visit - Multiple Options",
    "Site Visit Confirmation",
    "Site Visit - Quick Confirm",
    "Day Before Visit Reminder",
    "Day Before - Detailed",
    "Same Day Visit Reminder",
    "Same Day - Quick",
    "Post Visit - Feedback",
    "Post Visit - Next Step",
    "Negotiation - Best Price",
    "Negotiation - Limited Time",
    "Nurture - Monthly Update",
    "Nurture - Festival Offer",
  ];
  const deleteSeed = sqlite.prepare(
    "DELETE FROM message_templates WHERE is_personal = 0 AND name = ?"
  );
  for (const name of legacySeedNames) {
    deleteSeed.run(name);
  }
}

function seedMessageTemplates(sqlite: Database.Database) {
  const templates = [
    {
      name: "First Contact",
      category: "first_contact",
      body: "Hi {{first_name}}, this is the team at Patang Future Homes. Thank you for your enquiry about a property in {{location}}. Could you share your exact requirement so we can shortlist the best options for you?",
    },
    {
      name: "Follow-up",
      category: "follow_up",
      body: "Hi {{first_name}}, I hope you are doing well. I was following up on your enquiry about a property in {{location}}. We have shortlisted a few suitable options and would be happy to share the details. When is a good time to connect?",
    },
    {
      name: "Property Option",
      category: "property_option",
      body: "Hi {{first_name}}, as per your requirement, we have a suitable option in {{project}}, {{location}}: {{bhk}} BHK within a budget of {{budget}}. Would you like to know more, or shall we schedule a site visit?",
    },
    {
      name: "Visit Confirmation",
      category: "visit_confirmation",
      body: "Hi {{first_name}}, your site visit to {{project}} is confirmed for {{visit_date}} at {{visit_time}}. The meeting point is {{location}}. Kindly confirm this at your end before you head out.",
    },
    {
      name: "Visit Reminder",
      category: "visit_reminder",
      body: "Hi {{first_name}}, a gentle reminder about your scheduled site visit to {{project}} on {{visit_date}} at {{visit_time}}, at {{location}}. Please let us know if there is any change in your plan.",
    },
    {
      name: "Post-Visit",
      category: "post_visit",
      body: "Hi {{first_name}}, thank you for visiting {{project}} today. We hope you liked what you saw. Please share your feedback and any questions you may have, so we can help with the next steps.",
    },
    {
      name: "Alternative Project",
      category: "alternative_project",
      body: "Hi {{first_name}}, since {{original_project}} may not fully match your requirement, we have also shortlisted a few other options in {{location}} within your budget of {{budget}}. Would you like us to share the details?",
    },
  ];

  const now = new Date().toISOString();
  const hasCategory = sqlite.prepare(
    "SELECT COUNT(*) AS c FROM message_templates WHERE is_personal = 0 AND category = ?"
  );
  const insert = sqlite.prepare(
    "INSERT INTO message_templates (name, category, body, active, is_personal, created_by, created_at) VALUES (?, ?, ?, 1, 0, 1, ?)"
  );

  for (const t of templates) {
    const existing = hasCategory.get(t.category) as { c: number };
    if (existing.c === 0) {
      insert.run(t.name, t.category, t.body, now);
    }
  }
}