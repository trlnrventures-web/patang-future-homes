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
  createdAt: text("created_at").notNull().default(""),
});

export const attendance = sqliteTable("attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  date: text("date").notNull(),
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

export const loginAttempts = sqliteTable("login_attempts", {
  email: text("email").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  lockedUntil: text("locked_until"),
  updatedAt: text("updated_at"),
});

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  whatsappNumber: text("whatsapp_number"),
  email: text("email"),
  source: text("source", {
    enum: ["meta", "facebook", "google", "website", "walk_in", "referral", "other"],
  })
    .notNull()
    .default("meta"),
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
      "new", "calling", "connected", "qualified", "assigned",
      "follow_up", "visit_proposed", "visit_booked", "visit_confirmed",
      "visit_done", "negotiation", "booked", "nurture", "lost",
      "invalid", "dnc", "no_response",
    ],
  })
    .notNull()
    .default("new"),
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
});

export const crmSettings = sqliteTable("crm_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at"),
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
      "call_wrong_number", "call_back", "whatsapp", "note",
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
    ],
  }).notNull(),
  notes: text("notes"),
  metadata: text("metadata"),
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
  paidBy: integer("paid_by").references(() => users.id),
  paidAt: text("paid_at").notNull().default(""),
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
