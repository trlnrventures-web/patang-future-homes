import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";
import { randomBytes } from "node:crypto";
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
      created_at TEXT NOT NULL DEFAULT '',
      password_reset_token_hash TEXT,
      password_reset_expires_at TEXT,
      password_reset_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      identifier TEXT PRIMARY KEY,
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
      campaign_id TEXT,
      ad_set_id TEXT,
      ad_id TEXT,
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
      stage_changed_at TEXT,
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

    CREATE TABLE IF NOT EXISTS meta_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id TEXT NOT NULL UNIQUE,
      page_name TEXT NOT NULL,
      connected_by_user_id INTEGER NOT NULL,
      meta_user_id TEXT,
      encrypted_user_token TEXT,
      encrypted_page_token TEXT,
      user_token_expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'connected',
      last_verified_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (connected_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS meta_form_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id TEXT NOT NULL UNIQUE,
      page_id TEXT NOT NULL,
      form_name TEXT NOT NULL,
      project TEXT,
      caller_id INTEGER,
      sm_id INTEGER,
      field_map TEXT,
      sync_enabled INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT,
      last_synced_cursor TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (caller_id) REFERENCES users(id),
      FOREIGN KEY (sm_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS meta_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id TEXT,
      form_name TEXT,
      status TEXT NOT NULL DEFAULT 'ok',
      leads_fetched INTEGER NOT NULL DEFAULT 0,
      created_count INTEGER NOT NULL DEFAULT 0,
      duplicates INTEGER NOT NULL DEFAULT 0,
      reactivated_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      message TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS meta_ingested_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leadgen_id TEXT NOT NULL UNIQUE,
      form_id TEXT NOT NULL,
      lead_id INTEGER,
      ingested_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS integration_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      webhook_type TEXT,
      status TEXT NOT NULL,
      leadgen_id TEXT,
      form_id TEXT,
      page_id TEXT,
      lead_id INTEGER,
      message TEXT,
      raw_payload TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (lead_id) REFERENCES leads(id)
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

    CREATE TABLE IF NOT EXISTS call_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      activity_id INTEGER,
      number TEXT,
      channel TEXT NOT NULL DEFAULT 'phone',
      direction TEXT NOT NULL DEFAULT 'outbound',
      source TEXT NOT NULL DEFAULT 'call_queue',
      provider TEXT,
      provider_call_id TEXT,
      dedupe_key TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress',
      outcome TEXT,
      started_at TEXT NOT NULL DEFAULT '',
      answered_at TEXT,
      ended_at TEXT,
      duration_seconds INTEGER,
      recording_url TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (activity_id) REFERENCES activities(id)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      disabled_at TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id)
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
      day_type TEXT NOT NULL DEFAULT 'full_day',
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

    CREATE TABLE IF NOT EXISTS team_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lead_id INTEGER,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );
    CREATE INDEX IF NOT EXISTS idx_team_notes_created_at ON team_notes(created_at);
    CREATE INDEX IF NOT EXISTS idx_team_notes_user ON team_notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_team_notes_lead ON team_notes(lead_id);

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

    -- A banked credit is the week_off_decisions row itself (leave_banked = 1),
    -- so the earned date is already stored and there is nothing to backfill.
    -- This table records only the *consumption* of those credits, which nothing
    -- tracked before: the balance a staff member can actually spend is the
    -- earned credits minus the ones spent here, so the unique index on
    -- credit_id is what stops a credit being spent against two leave days.
    CREATE TABLE IF NOT EXISTS leave_credit_usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      credit_id INTEGER NOT NULL,
      used_on TEXT NOT NULL,
      leave_request_id INTEGER,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (credit_id) REFERENCES week_off_decisions(id),
      FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_credit_usages_credit ON leave_credit_usages(credit_id);
    CREATE INDEX IF NOT EXISTS idx_leave_credit_usages_user ON leave_credit_usages(user_id);

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
      released_at TEXT,
      released_by INTEGER,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (generated_by) REFERENCES users(id),
      FOREIGN KEY (released_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_salary_reports_user_month ON salary_reports(user_id, month);

    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_caller ON leads(assigned_caller_id);
    CREATE INDEX IF NOT EXISTS idx_leads_sm ON leads(assigned_sm_id);
    CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
    -- The call_sessions indexes are created by migrateCallSessions instead of
    -- here: one of them is on a column that does not exist in the shape this
    -- table first shipped with, and a failing statement aborts the whole exec
    -- above, taking the database with it.
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
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
    CREATE INDEX IF NOT EXISTS idx_meta_mappings_page ON meta_form_mappings(page_id);
    CREATE INDEX IF NOT EXISTS idx_meta_mappings_sync ON meta_form_mappings(sync_enabled);
    CREATE INDEX IF NOT EXISTS idx_meta_sync_runs_started ON meta_sync_runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_meta_ingested_form ON meta_ingested_leads(form_id);
    CREATE INDEX IF NOT EXISTS idx_integration_logs_provider ON integration_logs(provider);
    CREATE INDEX IF NOT EXISTS idx_integration_logs_status ON integration_logs(status);
    CREATE INDEX IF NOT EXISTS idx_integration_logs_leadgen ON integration_logs(leadgen_id);
    CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON integration_logs(created_at);
  `);

  migrateLeads(sqlite);
  migrateBookings(sqlite);
  migrateUsers(sqlite);
  migrateLoginAttempts(sqlite);
  migratePhoneIdentifiers(sqlite);
  migrateSiteVisits(sqlite);
  migrateMessageTemplates(sqlite);
  migrateAttendance(sqlite);
  migrateSalaryReports(sqlite);
  migrateIncentives(sqlite);
  migrateOfficeHoursDefaults(sqlite);
  migrateCallSessions(sqlite);
  migratePushSubscriptions(sqlite);
}

/**
 * `call_sessions` first shipped with only the columns the in-app dialer needed.
 * The inbound/recording columns arrived later and were added here rather than
 * by editing the CREATE TABLE, because a deployment may already have booted
 * the old shape. New columns are nullable or defaulted, so an existing row
 * keeps working and reads as outbound with no recording.
 */
function migrateCallSessions(sqlite: Database.Database) {
  if (!sqlite.prepare("PRAGMA table_info(call_sessions)").all().length) return;
  const cols = sqlite.prepare("PRAGMA table_info(call_sessions)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  const additions: Array<[string, string]> = [
    ["direction", "TEXT NOT NULL DEFAULT 'outbound'"],
    ["provider", "TEXT"],
    ["provider_call_id", "TEXT"],
    ["dedupe_key", "TEXT"],
    ["answered_at", "TEXT"],
    ["recording_url", "TEXT"],
  ];
  for (const [name, decl] of additions) {
    if (!have.has(name)) {
      sqlite.exec(`ALTER TABLE call_sessions ADD COLUMN ${name} ${decl}`);
    }
  }

  // Only safe once every column above exists, which is why these are not part
  // of the bulk DDL block: `CREATE INDEX` on a missing column throws, and that
  // would abort the whole statement batch the first time an older database is
  // opened.
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_call_sessions_lead ON call_sessions(lead_id);
    CREATE INDEX IF NOT EXISTS idx_call_sessions_activity ON call_sessions(activity_id);
    CREATE INDEX IF NOT EXISTS idx_call_sessions_user_status ON call_sessions(user_id, status);
  `);

  migrateCallSessionsDedupeIndex(sqlite);
}

/**
 * The dedupe key has to be unique for the index to do any work: without it, two
 * concurrent deliveries of the same webhook both pass the "already recorded?"
 * check and the caller gets billed for one call twice.
 *
 * `CREATE UNIQUE INDEX IF NOT EXISTS` above is a silent no-op when an index of
 * the same name already exists, and an earlier build created this one
 * non-unique — so the index is inspected and rebuilt rather than assumed. Any
 * duplicates that build left behind are collapsed to the earliest row, which is
 * the one whose activity was created first and therefore already referenced.
 */
function migrateCallSessionsDedupeIndex(sqlite: Database.Database) {
  const idx = sqlite
    .prepare("PRAGMA index_list(call_sessions)")
    .all() as { name: string; unique: number }[];
  const existing = idx.find((i) => i.name === "idx_call_sessions_dedupe");
  if (existing && !existing.unique) {
    sqlite.exec("DROP INDEX idx_call_sessions_dedupe");
  }

  // Collapsed to the earliest row, which is the one whose activity was created
  // first and is therefore the one already referenced.
  //
  // The outer `dedupe_key IS NOT NULL` is essential, not defensive. Attempts
  // dialled from the app have no provider and no dedupe key, so the subquery
  // below returns nothing for them — and `id NOT IN (empty set)` is true for
  // every row, which would silently delete the entire in-app call history on
  // every deploy. The null check is what keeps those rows.
  sqlite.exec(`
    DELETE FROM call_sessions
    WHERE dedupe_key IS NOT NULL
      AND id NOT IN (
        SELECT MIN(id) FROM call_sessions
        WHERE dedupe_key IS NOT NULL
        GROUP BY dedupe_key
      )
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_call_sessions_dedupe ON call_sessions(dedupe_key)
      WHERE dedupe_key IS NOT NULL
  `);
}

function migratePushSubscriptions(sqlite: Database.Database) {
  if (!sqlite.prepare("PRAGMA table_info(push_subscriptions)").all().length) return;
  const cols = sqlite.prepare("PRAGMA table_info(push_subscriptions)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("disabled_at")) {
    sqlite.exec("ALTER TABLE push_subscriptions ADD COLUMN disabled_at TEXT");
  }
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
  if (!have.has("password_reset_token_hash")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN password_reset_token_hash TEXT");
  }
  if (!have.has("password_reset_expires_at")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN password_reset_expires_at TEXT");
  }
  if (!have.has("password_reset_used_at")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN password_reset_used_at TEXT");
  }
  if (!have.has("see_all_leads")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN see_all_leads INTEGER NOT NULL DEFAULT 0");
  }
}

/**
 * The lockout bucket key used to be named `email` because email was the only
 * way in. It is now the normalized identifier a user typed, or the account's
 * canonical email once that identifier has been resolved to a known account.
 * Renaming rather than adding a column keeps the existing primary key, so no
 * attempt history is lost and no duplicate-key window opens during deploys.
 */
function migrateLoginAttempts(sqlite: Database.Database) {
  const cols = sqlite.prepare("PRAGMA table_info(login_attempts)").all() as {
    name: string;
  }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("email")) return;
  if (!have.has("identifier")) {
    sqlite.exec("ALTER TABLE login_attempts RENAME COLUMN email TO identifier");
  }
}

/**
 * Phone became a login identifier, which means it now has to identify a single
 * account. It never did: the seed wrote the same number into every account and
 * the live data ended up with "Admin" and "Marketing Team" sharing
 * 917249138197. A duplicate would make "who is logging in" ambiguous, so
 * duplicates are cleared back to NULL (the owner re-enters it in Team Manager)
 * and a partial unique index then guarantees it cannot happen again. SQLite
 * treats NULLs as distinct in a unique index, so un-set phones never collide.
 */
function migratePhoneIdentifiers(sqlite: Database.Database) {
  const dupes = sqlite
    .prepare(
      `SELECT phone FROM users WHERE phone IS NOT NULL AND phone <> ''
       GROUP BY phone HAVING COUNT(*) > 1`
    )
    .all() as { phone: string }[];

  for (const { phone } of dupes) {
    // Keep the lowest id (the original owner of the number) and clear the rest.
    const cleared = sqlite
      .prepare(
        `UPDATE users SET phone = NULL
         WHERE phone = ? AND id NOT IN (SELECT MIN(id) FROM users WHERE phone = ?)`
      )
      .run(phone, phone).changes;
    console.warn(
      `[crm] phone ${phone} was shared by multiple accounts; cleared from ${cleared} account(s).`
    );
  }

  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone)");
}

function migrateAttendance(sqlite: Database.Database) {
  const cols = sqlite.prepare("PRAGMA table_info(attendance)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("day_type")) {
    sqlite.exec("ALTER TABLE attendance ADD COLUMN day_type TEXT NOT NULL DEFAULT 'full_day'");
  }
}

function migrateSalaryReports(sqlite: Database.Database) {
  const cols = sqlite.prepare("PRAGMA table_info(salary_reports)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("half_days")) {
    sqlite.exec("ALTER TABLE salary_reports ADD COLUMN half_days INTEGER NOT NULL DEFAULT 0");
  }
  // A salary report is invisible to the employee until released_at is set, so an
  // admin can review the figures first without staff seeing them change.
  if (!have.has("released_at")) {
    sqlite.exec("ALTER TABLE salary_reports ADD COLUMN released_at TEXT");
  }
  if (!have.has("released_by")) {
    sqlite.exec("ALTER TABLE salary_reports ADD COLUMN released_by INTEGER");
  }
}

/**
 * Payments move from one row per person per month to one row per booking per
 * role, so a payment needs to point at the booking it settles. NULL booking_id
 * is the legacy month-total row and stays valid: it still marks the whole month
 * paid for anyone who was paid before this column existed.
 */
function migrateIncentives(sqlite: Database.Database) {
  const cols = sqlite.prepare("PRAGMA table_info(incentive_payments)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("booking_id")) {
    sqlite.exec("ALTER TABLE incentive_payments ADD COLUMN booking_id INTEGER");
  }
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_incentive_payments_booking ON incentive_payments(booking_id)"
  );
}

/**
 * Office hours moved to 10:30-19:30 with Tuesday as a week-off, so the working
 * days are Mon/Wed-Sun rather than Mon-Sat.
 *
 * The stored value wins over the code default, which means an install that
 * already has an `office_hours` row would keep masking on the old window
 * forever with no visible way to tell why. So an untouched default is rewritten
 * here. A row an admin has actually edited is left alone - quietly reverting a
 * deliberate setting is worse than leaving it stale, and the Settings page shows
 * the current window either way.
 *
 * The comparison is on the fields the old default set, so the rewrite is
 * naturally idempotent: once rewritten, the value no longer matches and this
 * never fires again.
 */
function migrateOfficeHoursDefaults(sqlite: Database.Database) {
  const OLD_DEFAULT = {
    days: [1, 2, 3, 4, 5, 6],
    startMin: 600,
    endMin: 1140,
    enabled: true,
    timezone: "Asia/Kolkata",
  };
  const NEW_DEFAULT = {
    days: [0, 1, 3, 4, 5, 6],
    startMin: 630,
    endMin: 1170,
    enabled: true,
    timezone: "Asia/Kolkata",
    weekOffDay: "Tuesday",
  };

  const row = sqlite
    .prepare("SELECT value FROM crm_settings WHERE key = 'office_hours'")
    .get() as { value: string } | undefined;
  if (!row?.value) return;

  let stored: Record<string, unknown>;
  try {
    stored = JSON.parse(row.value) as Record<string, unknown>;
  } catch {
    return; // unparseable: leave it for an admin to fix in Settings
  }

  const sameAsOld =
    JSON.stringify([...(stored.days as number[] ?? [])].sort()) ===
      JSON.stringify([...OLD_DEFAULT.days].sort()) &&
    stored.startMin === OLD_DEFAULT.startMin &&
    stored.endMin === OLD_DEFAULT.endMin &&
    stored.enabled === OLD_DEFAULT.enabled &&
    (stored.weekOffDay == null || stored.weekOffDay === "Tuesday");

  if (!sameAsOld) return;

  sqlite
    .prepare("UPDATE crm_settings SET value = ?, updated_at = ? WHERE key = 'office_hours'")
    .run(JSON.stringify(NEW_DEFAULT), new Date().toISOString());
  console.warn(
    "[crm] office hours still held the pre-10:30 Mon-Sat default; updated to 10:30-19:30, Mon/Wed-Sun with Tuesday as week-off."
  );
}

function migrateLeads(sqlite: Database.Database) {
  const cols = sqlite.prepare("PRAGMA table_info(leads)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  const additions: Array<[string, string]> = [
    ["next_action", "TEXT"],
    ["stage_changed_at", "TEXT"],
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
    ["reactivated_at", "TEXT"],
    ["reactivated_from", "TEXT"],
  ];
  for (const [name, decl] of additions) {
    if (!have.has(name)) {
      sqlite.exec(`ALTER TABLE leads ADD COLUMN ${name} ${decl}`);
    }
  }
  backfillStageChangedAt(sqlite);
  seedSettings(sqlite);
}

/**
 * Leads created before `stage_changed_at` existed fall back to `created_at`, which
 * badly overstates how long they have sat in their current stage. Recover the real
 * value from the lead's most recent `status_change` activity.
 */
function backfillStageChangedAt(sqlite: Database.Database) {
  if (!sqlite.prepare("PRAGMA table_info(activities)").all().length) return;
  sqlite.exec(`
    UPDATE leads
    SET stage_changed_at = COALESCE(
      (
        SELECT MAX(a.created_at) FROM activities a
        WHERE a.lead_id = leads.id AND a.type = 'status_change'
      ),
      created_at
    )
    WHERE stage_changed_at IS NULL
  `);
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
    const now = new Date().toISOString();

    const insertUser = sqlite.prepare(
      "INSERT INTO users (name, email, password_hash, role, phone, active, must_change_password, created_at) VALUES (?, ?, ?, ?, NULL, 1, 1, ?)"
    );

    // Every account gets its own unguessable password and is flagged
    // must_change_password=1, so nobody - including whoever runs the deploy -
    // ends up holding a credential that reaches the CRM. An admin enters it
    // once, is forced onto /crm/change-password, and picks their own.
    //
    // Phone is left NULL: a real number belongs to a real person and is added
    // in Team Manager. Seeding a placeholder would collide, and phone is a
    // login identifier now, so a shared placeholder would be ambiguous.
    const bootstrap = [
      ["Admin", "admin@patangfuturehomes.com", "admin"],
      ["Priti Tiwari", "priti@patangfuturehomes.com", "caller"],
      ["Aatish Kini", "aatish@patangfuturehomes.com", "sales_manager"],
      ["Vishrut Jain", "vishrut@patangfuturehomes.com", "sales_manager"],
      ["Kirit Godaniya", "kirit@patangfuturehomes.com", "sales_manager"],
      ["Akshar Patel", "akshar@patangfuturehomes.com", "sales_manager"],
    ] as const;

    for (const [name, email, role] of bootstrap) {
      insertUser.run(name, email, bcrypt.hashSync(randomPassword(24), 10), role, now);
    }

    // Set default base salaries
    sqlite.exec("UPDATE users SET base_salary = 25000 WHERE role = 'caller'");
    sqlite.exec("UPDATE users SET base_salary = 30000 WHERE role = 'sales_manager'");
    sqlite.exec("UPDATE users SET base_salary = 50000 WHERE role = 'admin'");
  }

  seedMessageTemplates(sqlite);
  ensureMarketingUser(sqlite);
}

// Alphanumeric only: enough entropy to be safe while staying easy to read aloud
// and paste into a chat client that mangles symbols. "l", "I", "O" and "0/1"
// are dropped so the alphabet cannot be misread when transcribed by hand.
const PASSWORD_ALPHABET =
  "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Rejection sampling rather than `byte % alphabet.length`, which would bias the
 * first 256 % 57 = 28 characters of the alphabet. One-time bootstrap
 * credentials are still credentials.
 */
function randomPassword(length: number): string {
  const limit = Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte < limit) out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

function ensureMarketingUser(sqlite: Database.Database) {
  const email = "marketing@patangfuturehomes.com";
  const existing = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return;
  sqlite
    .prepare(
      "INSERT INTO users (name, email, password_hash, role, phone, active, must_change_password, created_at) VALUES (?, ?, ?, ?, NULL, 1, 1, ?)"
    )
    .run(
      "Marketing Team",
      email,
      bcrypt.hashSync(randomPassword(24), 10),
      "marketing",
      new Date().toISOString()
    );
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