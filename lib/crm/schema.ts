import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", {
    enum: ["admin", "sales_head", "sales_manager", "caller", "marketing"],
  })
    .notNull()
    .default("caller"),
  phone: text("phone"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  resetRequestedAt: text("reset_requested_at"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(false),
  lastLoginAt: text("last_login_at"),
  weekOffDay: text("week_off_day"),
  baseSalary: integer("base_salary"),
  // Opt-in read access to the whole lead book, for staff who work follow-up on
  // leads an SM owns. It widens visibility only: it never grants assignment,
  // deletion or any other write, and it leaves lead ownership untouched.
  seeAllLeads: integer("see_all_leads", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull().default(""),
  // Email password reset. Only the SHA-256 of the emailed token is stored, so a
  // database leak does not hand out working reset links. `usedAt` is what makes
  // a link single-use: the token is burned whether or not the reset succeeds.
  passwordResetTokenHash: text("password_reset_token_hash"),
  passwordResetExpiresAt: text("password_reset_expires_at"),
  passwordResetUsedAt: text("password_reset_used_at"),
});

export const attendance = sqliteTable("attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  date: text("date").notNull(),
  dayType: text("day_type", {
    enum: ["full_day", "half_day", "holiday", "left_job", "week_off", "present"],
  })
    .notNull()
    .default("full_day"),
  mode: text("mode", { enum: ["office", "field_duty"] })
    .notNull()
    .default("office"),
  fieldDutyReason: text("field_duty_reason"),
  checkinTime: text("checkin_time"),
  checkoutTime: text("checkout_time"),
  checkinLat: text("checkin_lat"),
  checkinLng: text("checkin_lng"),
  checkinDistanceM: integer("checkin_distance_m"),
  checkoutLat: text("checkout_lat"),
  checkoutLng: text("checkout_lng"),
  checkoutDistanceM: integer("checkout_distance_m"),
  createdAt: text("created_at").notNull().default(""),
});

export const leaveRequests = sqliteTable("leave_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  rejectionReason: text("rejection_reason"),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: text("decided_at"),
  createdAt: text("created_at").notNull().default(""),
});

export const leadMentions = sqliteTable("lead_mentions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  mentionedById: integer("mentioned_by_id")
    .notNull()
    .references(() => users.id),
  noteId: integer("note_id"),
  noteSnippet: text("note_snippet"),
  createdAt: text("created_at").notNull().default(""),
});

/**
 * The shared team feed behind the CRM's Notes tab. Deliberately its own table
 * rather than `activities` rows of `type = 'note'`: activities are lead-timeline
 * events that every report, leaderboard and incentive query counts, and they
 * require a lead. A handover note is often about no lead at all, so the two
 * cannot share storage without NULL lead ids leaking into those counts.
 */
export const teamNotes = sqliteTable("team_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  // Optional: a note may be about a specific lead, or be general team info.
  leadId: integer("lead_id").references(() => leads.id),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(""),
});

export const loginAttempts = sqliteTable("login_attempts", {
  // The key a user types at the login screen is either their email or their
  // phone, so one bucket per account has to be able to hold either form. For a
  // known account this holds that account's canonical email (resolved from
  // whichever identifier was typed), which keeps phone and email attempts
  // sharing a single 5-attempt budget instead of doubling it.
  identifier: text("identifier").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  lockedUntil: text("locked_until"),
  updatedAt: text("updated_at"),
});

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  /** A second number the customer can be reached on; genuinely separate from WhatsApp. */
  secondaryPhone: text("secondary_phone"),
  whatsappNumber: text("whatsapp_number"),
  email: text("email"),
  source: text("source", {
    enum: ["meta", "facebook", "google", "website", "walk_in", "referral", "other", "Meta"],
  })
    .notNull()
    .default("meta"),
  campaignId: text("campaign_id"),
  adSetId: text("ad_set_id"),
  adId: text("ad_id"),
  campaignName: text("campaign_name"),
  adSetName: text("ad_set_name"),
  adName: text("ad_name"),
  formName: text("form_name"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  originalProject: text("original_project"),
  originalMessage: text("original_message"),
  location: text("location"),
  sublocation: text("sublocation"),
  budget: text("budget"),
  budgetMin: integer("budget_min"),
  budgetMax: integer("budget_max"),
  bhk: text("bhk"),
  purpose: text("purpose", {
    enum: ["self_use", "investment", "both"],
  }),
  timeline: text("timeline", {
    enum: ["immediate", "1_3_months", "3_6_months", "6_plus_months", "exploring"],
  }),
  preferredProject: text("preferred_project"),
  familyRequirements: text("family_requirements"),
  loanRequired: integer("loan_required", { mode: "boolean" }),
  otherPreferences: text("other_preferences"),
  notes: text("notes"),
  status: text("status", {
    enum: [
      "new", "calling", "connected", "initial_contact", "qualified", "assigned",
      "follow_up", "plan_hold", "visit_proposed", "visit_booked", "visit_confirmed",
      "visit_done", "negotiation", "booked", "nurture", "lost",
      "invalid", "dnc", "no_response",
    ],
  })
    .notNull()
    .default("new"),
  /** When the lead last entered its current status — drives "days in stage". */
  stageChangedAt: text("stage_changed_at"),
  leadScore: integer("lead_score").default(0),
  nextFollowUp: text("next_follow_up"),
  nextAction: text("next_action"),
  concern: text("concern"),
  firstCallAt: text("first_call_at"),
  firstResponseTimeSeconds: integer("first_response_time_seconds"),
  slaStatus: text("sla_status", {
    enum: ["within_sla", "approaching_sla", "overdue", "no_call", "n/a"],
  }),
  attemptCount: integer("attempt_count").default(0),
  lastAttemptAt: text("last_attempt_at"),
  nextAttemptAt: text("next_attempt_at"),
  assignedCallerId: integer("assigned_caller_id"),
  assignedSmId: integer("assigned_sm_id"),
  assignedAt: text("assigned_at"),
  assignedBy: integer("assigned_by"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
  deletedAt: text("deleted_at"),
  reactivatedAt: text("reactivated_at"),
  reactivatedFrom: text("reactivated_from"),
});

export const crmSettings = sqliteTable("crm_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at"),
});

/**
 * A Facebook Page the CRM can pull leads from, established by one admin's OAuth
 * handshake.
 *
 * The tokens are stored encrypted, never in the clear, and are never returned by
 * any API route - the UI is told only whether a connection is healthy. The
 * columns are nullable so a disconnect can destroy the secrets in place while
 * keeping the row, which preserves the record of which Page was connected and by
 * whom after the tokens are gone.
 */
export const metaConnections = sqliteTable("meta_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pageId: text("page_id").notNull().unique(),
  pageName: text("page_name").notNull(),
  /**
   * The CRM admin who performed the handshake. Facebook tokens belong to a
   * person, and revoking access is done on that person's Facebook account, so the
   * row has to remember who to point at when a token dies.
   */
  connectedByUserId: integer("connected_by_user_id")
    .notNull()
    .references(() => users.id),
  /** Facebook user id behind the handshake, for the app's own diagnostics. */
  metaUserId: text("meta_user_id"),
  encryptedUserToken: text("encrypted_user_token"),
  encryptedPageToken: text("encrypted_page_token"),
  /**
   * Page tokens derived from a long-lived user token do not expire on their own,
   * but they die with the user token. This is that user token's expiry, and it
   * is what the health indicator counts down to.
   */
  userTokenExpiresAt: text("user_token_expires_at"),
  status: text("status", { enum: ["connected", "needs_refresh", "disconnected"] })
    .notNull()
    .default("connected"),
  lastVerifiedAt: text("last_verified_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

/**
 * Per-form configuration: which CRM field each Meta question feeds, which
 * project the form belongs to, and who the resulting lead is assigned to.
 *
 * The assignment lives here rather than in code so an admin can move a form to a
 * different Sales Manager without a deploy. `last_synced_cursor` is the
 * `created_time` of the newest lead already ingested, so a poll only asks for
 * what came after it.
 */
export const metaFormMappings = sqliteTable("meta_form_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  formId: text("form_id").notNull().unique(),
  pageId: text("page_id").notNull(),
  formName: text("form_name").notNull(),
  /**
   * Pre-set rather than mapped: one Lead Ad form belongs to one project almost
   * always, so asking the admin to map a question to it every time is busywork.
   */
  project: text("project"),
  callerId: integer("caller_id").references(() => users.id),
  smId: integer("sm_id").references(() => users.id),
  /**
   * Meta question key -> CRM field name, or the literal "ignore". The keys come
   * from the form's own question schema, so this is written by the mapping screen
   * and read by the sync job.
   */
  fieldMap: text("field_map", { mode: "json" }).$type<Record<string, string>>(),
  /** Off until an admin explicitly turns it on, so connecting imports nothing. */
  syncEnabled: integer("sync_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  lastSyncedAt: text("last_synced_at"),
  lastSyncedCursor: text("last_synced_cursor"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

/**
 * One row per form per poll, so the admin can see the integration is alive
 * without reading server logs. Failures are recorded rather than thrown: a form
 * that errors must not stop the other four from syncing.
 */
export const metaSyncRuns = sqliteTable("meta_sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  formId: text("form_id"),
  formName: text("form_name"),
  status: text("status", { enum: ["ok", "warning", "error", "skipped"] })
    .notNull()
    .default("ok"),
  leadsFetched: integer("leads_fetched").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  reactivatedCount: integer("reactivated_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  message: text("message"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull().default(""),
});

/**
 * Every leadgen id already ingested, so a repeated poll is a no-op instead of a
 * duplicate. The cursor alone cannot guarantee that: Graph's `since` filter has
 * one-second granularity, so two leads submitted in the same second can both be
 * returned again on the next poll.
 */
export const metaIngestedLeads = sqliteTable("meta_ingested_leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadgenId: text("leadgen_id").notNull().unique(),
  formId: text("form_id").notNull(),
  leadId: integer("lead_id").references(() => leads.id),
  ingestedAt: text("ingested_at").notNull(),
  createdAt: text("created_at").notNull().default(""),
});

export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type", {
    enum: [
      "call", "call_connected", "call_no_answer", "call_busy",
      "call_wrong_number", "call_back", "call_not_interested", "call_other",
      "call_switched_off", "call_number_invalid", "call_whatsapp_only",
      "call_language_barrier", "call_incoming", "call_missed", "whatsapp", "note",
      "status_change", "qualification", "assignment", "follow_up",
      "visit_proposed", "visit_booked", "visit_confirmed", "visit_done",
      "visit_no_show", "visit_cancelled", "post_visit_feedback",
      "booking", "booking_created", "booking_confirmed", "booking_cancelled",
      "negotiation_started", "negotiation_updated", "negotiation_lost",
      "objection_added", "competing_project", "alternative_selected",
      "message_generated", "message_copied",
      "message_whatsapp_opened",
      "concern", "requirement_changed",
      "tag_generated", "tag_copied",
      // Written by /crm/api/office-hours when a masked number is revealed.
      "contact_reveal",
    ],
  }).notNull(),
  notes: text("notes"),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull().default(""),
});

/**
 * One row per dial attempt. There is no telephony provider wired up, so a
 * session is opened by the UI the moment the caller taps Call and closed when
 * the outcome is saved. Duration is measured server side between the two
 * timestamps, never reported by the client, so a stalled tab cannot invent
 * talk time.
 */
export const callSessions = sqliteTable("call_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  /** The activity this attempt resolved into, when an outcome was logged. */
  activityId: integer("activity_id").references(() => activities.id),
  number: text("number"),
  channel: text("channel", { enum: ["phone", "whatsapp"] })
    .notNull()
    .default("phone"),
  /**
   * Who placed the call. Inbound only exists once something outside the browser
   * can observe the phone's call log — a telephony webhook or a native app.
   */
  direction: text("direction", { enum: ["outbound", "inbound"] })
    .notNull()
    .default("outbound"),
  /** Where the caller dialled from, so the log can be read back per screen. */
  source: text("source", {
    enum: ["call_queue", "lead_detail", "lead_card", "dashboard", "manual", "webhook", "native_app"],
  })
    .notNull()
    .default("call_queue"),
  /** Which integration produced the row, when it did not come from our own UI. */
  provider: text("provider"),
  /** The provider's own id for this call, kept for tracing back to their logs. */
  providerCallId: text("provider_call_id"),
  /**
   * `provider:providerCallId`, unique when present. Webhooks retry, and a
   * retried delivery must not become a second call in the log, so the whole
   * write is keyed on this instead of on the call id alone.
   */
  dedupeKey: text("dedupe_key"),
  status: text("status", {
    enum: ["in_progress", "ringing", "completed", "missed", "abandoned"],
  })
    .notNull()
    .default("in_progress"),
  /** The call_* activity type the attempt resolved to. */
  outcome: text("outcome"),
  startedAt: text("started_at").notNull().default(""),
  answeredAt: text("answered_at"),
  endedAt: text("ended_at"),
  durationSeconds: integer("duration_seconds"),
  /** Where the recording lives, once the provider has finished processing it. */
  recordingUrl: text("recording_url"),
  createdAt: text("created_at").notNull().default(""),
});

/**
 * A device that has opted into call notifications. One row per browser
 * profile, so the same user on a phone and a laptop holds two rows and can
 * disable either.
 */
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  /** Cleared rather than deleted when the push service rejects the endpoint. */
  disabledAt: text("disabled_at"),
  createdAt: text("created_at").notNull().default(""),
});

export const followUps = sqliteTable("follow_ups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  scheduledFor: text("scheduled_for").notNull(),
  purpose: text("purpose"),
  status: text("status", {
    enum: ["pending", "completed", "missed", "rescheduled"],
  })
    .notNull()
    .default("pending"),
  completedAt: text("completed_at"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
});

export const siteVisits = sqliteTable("site_visits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  projectId: text("project_id"),
  smId: integer("sm_id")
    .notNull()
    .references(() => users.id),
  date: text("date").notNull(),
  time: text("time").notNull(),
  meetingPoint: text("meeting_point"),
  familyAttending: text("family_attending"),
  transportRequirement: text("transport_requirement"),
  status: text("status", {
    enum: [
      "proposed", "booked", "confirmed", "arrived",
      "visit_done", "no_show", "cancelled", "rescheduled",
    ],
  })
    .notNull()
    .default("proposed"),
  notes: text("notes"),
  propertyShown: text("property_shown"),
  recommendedProperties: text("recommended_properties"),
  propertiesShown: text("properties_shown"),
  doneAt: text("done_at"),
  createdAt: text("created_at").notNull().default(""),
});

export const postVisitFeedback = sqliteTable("post_visit_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  visitId: integer("visit_id")
    .notNull()
    .references(() => siteVisits.id),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  interest: text("interest", { enum: ["hot", "warm", "cold"] }),
  likedProperty: text("liked_property", { enum: ["yes", "no", "maybe"] }),
  mainObjection: text("main_objection", {
    enum: [
      "price", "location", "flat_size", "amenities",
      "possession", "family", "loan", "comparing", "other",
    ],
  }),
  expectedBudget: text("expected_budget"),
  otherProjects: text("other_projects"),
  nextAction: text("next_action"),
  nextFollowUp: text("next_follow_up"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
});

export const messageTemplates = sqliteTable("message_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  body: text("body").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  isPersonal: integer("is_personal", { mode: "boolean" }).notNull().default(false),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at"),
});

export const messageLogs = sqliteTable("message_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  templateId: integer("template_id").references(() => messageTemplates.id),
  category: text("category"),
  renderedMessage: text("rendered_message").notNull(),
  action: text("action", {
    enum: ["generated", "copied", "whatsapp_opened", "edited"],
  }).notNull(),
  createdAt: text("created_at").notNull().default(""),
});

export const negotiations = sqliteTable("negotiations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  projectId: text("project_id"),
  unit: text("unit"),
  bhk: text("bhk"),
  assignedSmId: integer("assigned_sm_id")
    .notNull()
    .references(() => users.id),
  status: text("status", {
    enum: [
      "negotiation_started", "price_discussion", "unit_discussion",
      "family_decision", "loan_process", "ready_to_book",
      "on_hold", "negotiation_lost", "booked",
    ],
  })
    .notNull()
    .default("negotiation_started"),
  expectedPrice: integer("expected_price"),
  quotedPrice: integer("quoted_price"),
  finalDiscussedPrice: integer("final_discussed_price"),
  bookingAmountDiscussed: integer("booking_amount_discussed"),
  unitPreference: text("unit_preference"),
  floorPreference: text("floor_preference"),
  facingPreference: text("facing_preference"),
  paymentPreference: text("payment_preference"),
  loanRequirement: text("loan_requirement"),
  objections: text("objections", { mode: "json" }).$type<string[]>(),
  competingProjects: text("competing_projects", { mode: "json" }).$type<string[]>(),
  notes: text("notes"),
  lostReason: text("lost_reason"),
  nextAction: text("next_action"),
  nextActionAt: text("next_action_at"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const campaigns = sqliteTable("campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  platform: text("platform", {
    enum: ["meta", "facebook", "google", "organic", "website", "referral", "other"],
  })
    .notNull()
    .default("other"),
  project: text("project"),
  objective: text("objective"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  budget: integer("budget"),
  status: text("status", {
    enum: ["active", "paused", "completed", "draft"],
  })
    .notNull()
    .default("active"),
  notes: text("notes"),
  externalId: text("external_id"),
  externalPlatform: text("external_platform"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const campaignSpend = sqliteTable("campaign_spend", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  date: text("date").notNull(),
  spend: integer("spend").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  impressions: integer("impressions"),
  reach: integer("reach"),
  clicks: integer("clicks"),
  leads: integer("leads"),
  externalAdSetId: text("external_ad_set_id"),
  externalAdSetName: text("external_ad_set_name"),
  externalAdId: text("external_ad_id"),
  externalAdName: text("external_ad_name"),
  createdAt: text("created_at").notNull().default(""),
});

export const bookings = sqliteTable("bookings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  projectId: text("project_id"),
  unit: text("unit"),
  bhk: text("bhk"),
  bookingDate: text("booking_date").notNull(),
  bookingAmount: integer("booking_amount"),
  totalValue: integer("total_value"),
  smId: integer("sm_id")
    .notNull()
    .references(() => users.id),
  leadSource: text("lead_source"),
  campaignName: text("campaign_name"),
  status: text("status", {
    enum: ["initiated", "confirmed", "cancelled"],
  })
    .notNull()
    .default("initiated"),
  cancellationReason: text("cancellation_reason"),
  floor: text("floor"),
  carpetArea: text("carpet_area"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const incentivePayments = sqliteTable("incentive_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  month: text("month").notNull(),
  role: text("role").notNull(),
  amount: integer("amount").notNull(),
  /**
   * The booking this payment settles. NULL is a legacy month-total row written
   * before incentives were tracked per booking; those still mark the whole month
   * paid, so old history keeps reading correctly.
   */
  bookingId: integer("booking_id").references(() => bookings.id),
  paidBy: integer("paid_by").references(() => users.id),
  paidAt: text("paid_at").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
});

export const weekOffDecisions = sqliteTable("week_off_decisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  date: text("date").notNull(),
  decision: text("decision", { enum: ["taken_off", "worked"] }).notNull(),
  leaveBanked: integer("leave_banked", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(""),
});

/**
 * Consumption of a banked credit. The credit itself is the `week_off_decisions`
 * row with `leave_banked = 1` - its `date` is the earned date, so a credit has
 * no separate ledger to drift out of sync. This table only answers "has this
 * credit been spent", which the decisions table could not.
 */
export const leaveCreditUsages = sqliteTable("leave_credit_usages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  creditId: integer("credit_id")
    .notNull()
    .references(() => weekOffDecisions.id),
  usedOn: text("used_on").notNull(),
  leaveRequestId: integer("leave_request_id").references(() => leaveRequests.id),
  createdAt: text("created_at").notNull().default(""),
});

export const salaryReports = sqliteTable("salary_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  month: text("month").notNull(),
  baseSalary: integer("base_salary").notNull(),
  daysPresent: integer("days_present").notNull().default(0),
  halfDays: integer("half_days").notNull().default(0),
  daysLate: integer("days_late").notNull().default(0),
  daysAbsent: integer("days_absent").notNull().default(0),
  leaveDays: integer("leave_days").notNull().default(0),
  leaveDaysBankCovered: integer("leave_days_bank_covered").notNull().default(0),
  leaveDaysDeductible: integer("leave_days_deductible").notNull().default(0),
  weekOffsTaken: integer("week_offs_taken").notNull().default(0),
  weekOffsWorkedBanked: integer("week_offs_worked_banked").notNull().default(0),
  holidaysInMonth: integer("holidays_in_month").notNull().default(0),
  incentiveEarned: integer("incentive_earned").notNull().default(0),
  deductions: integer("deductions").notNull().default(0),
  netPaid: integer("net_paid").notNull().default(0),
  paymentStatus: text("payment_status", { enum: ["pending", "paid"] })
    .notNull()
    .default("pending"),
  paymentDate: text("payment_date"),
  generatedBy: integer("generated_by").references(() => users.id),
  releasedAt: text("released_at"),
  releasedBy: integer("released_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

export const reactivationAlerts = sqliteTable("reactivation_alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectSlug: text("project_slug").notNull(),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  userId: integer("user_id").references(() => users.id),
  matchScore: integer("match_score").default(0),
  dismissed: integer("dismissed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(""),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  action: text("action").notNull(),
  actorUserId: integer("actor_user_id").references(() => users.id),
  targetUserId: integer("target_user_id").references(() => users.id),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  summary: text("summary").notNull().default(""),
  details: text("details").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
});

export const companyHolidays = sqliteTable("company_holidays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  removedBy: integer("removed_by").references(() => users.id),
  removedAt: text("removed_at"),
});

/**
 * An unacknowledged in-app "new lead" alert for one caller. Persistent so the
 * popup survives a reload or a second tab, and acknowledged rather than deleted
 * so the same alert is never raised twice.
 */
export const leadAlerts = sqliteTable("lead_alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  kind: text("kind", { enum: ["new", "reactivated"] })
    .notNull()
    .default("new"),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  acknowledgedAt: text("acknowledged_at"),
  createdAt: text("created_at").notNull().default(""),
});

/**
 * Integration webhook logs for debugging. Captures every webhook receipt
 * with its status, provider, and raw payload when needed.
 */
export const integrationLogs = sqliteTable("integration_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(),
  webhookType: text("webhook_type"),
  status: text("status", {
    enum: ["received", "processed", "duplicate_matched", "reactivated", "failed"],
  }).notNull(),
  leadgenId: text("leadgen_id"),
  formId: text("form_id"),
  pageId: text("page_id"),
  leadId: integer("lead_id").references(() => leads.id),
  message: text("message"),
  rawPayload: text("raw_payload"),
  createdAt: text("created_at").notNull().default(""),
});
