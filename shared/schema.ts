import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, decimal, real, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

export * from "./models/auth";
export * from "./models/chat";

import { users } from "./models/auth";

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  displayName: text("display_name"),
  groupNickname: text("group_nickname"),
  bio: text("bio"),
  age: integer("age"),
  gender: text("gender"),
  location: text("location"),
  personalityProfile: jsonb("personality_profile"),
  twinPersona: text("twin_persona"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  isPublic: boolean("is_public").default(false),
  profileVisibility: text("profile_visibility").default("public"),
  coverPhotoUrl: text("cover_photo_url"),
  cartoonPhotoUrl: text("cartoon_photo_url"),
  aboutMe: text("about_me"),
  aboutMeSource: text("about_me_source").default("user"),
  aboutMeUpdatedAt: timestamp("about_me_updated_at"),
  aboutSummary: text("about_summary"),
  personalitySummary: text("personality_summary"),
  isVerified: boolean("is_verified").default(false),
  verificationStatus: text("verification_status").default("unverified"),
  subscriptionTier: text("subscription_tier").default("free"),
  profileCompletionScore: integer("profile_completion_score").default(0),
  superMatchesRemaining: integer("super_matches_remaining").default(0),
  boostsRemaining: integer("boosts_remaining").default(0),
  twinQuestionsAnswered: integer("twin_questions_answered").default(0),
  locationLat: decimal("location_lat", { precision: 9, scale: 6 }),
  locationLng: decimal("location_lng", { precision: 9, scale: 6 }),
  locationName: text("location_name"),
  locationUpdatedAt: timestamp("location_updated_at"),
  showDistance: boolean("show_distance").default(true),
  maxDistanceKm: integer("max_distance_km").default(100),
  ageMinPreference: integer("age_min_preference").default(18),
  ageMaxPreference: integer("age_max_preference").default(65),
  prompts: jsonb("prompts"), // ProfilePrompt[] — see profilePromptsSchema
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("profiles_location_updated_at_idx").on(t.locationUpdatedAt),
  index("profiles_is_public_onboarding_idx").on(t.isPublic, t.onboardingCompleted),
]);

export const userPhotos = pgTable(
  "user_photos",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull().references(() => users.id),
    photoUrl: text("photo_url").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    isMainProfilePhoto: boolean("is_main_profile_photo").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    // Redesign: explicit roles. Exactly one 'cover' and one 'portrait' per user
    // (partial unique indexes below); everything else is 'gallery'. The cover is
    // the wide "where you are" band; the portrait is the tight "who you are"
    // print. Focal points are per-role because the same image crops differently
    // in a 21:9 band vs a 4:5 frame.
    role: text("role").notNull().default("gallery"), // 'cover' | 'portrait' | 'gallery'
    coverFocalX: real("cover_focal_x").notNull().default(0.5),
    coverFocalY: real("cover_focal_y").notNull().default(0.5),
    portraitFocalX: real("portrait_focal_x").notNull().default(0.5),
    portraitFocalY: real("portrait_focal_y").notNull().default(0.5),
    width: integer("width"),
    height: integer("height"),
  },
  (t) => [
    uniqueIndex("user_photos_one_cover_idx").on(t.userId).where(sql`${t.role} = 'cover'`),
    uniqueIndex("user_photos_one_portrait_idx").on(t.userId).where(sql`${t.role} = 'portrait'`),
  ],
);

export const photoRoleEnum = z.enum(["cover", "portrait", "gallery"]);
export const updatePhotoRoleSchema = z.object({ role: photoRoleEnum });
export const updatePhotoFocalSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  target: z.enum(["cover", "portrait"]),
});
export type PhotoRole = z.infer<typeof photoRoleEnum>;

// profiles.prompts — up to 3 short Q&A the twin can quote. UI picks the
// question from a bank; stored free-form so the bank can change without a
// migration.
export const profilePromptsSchema = z
  .array(
    z.object({
      q: z.string().trim().min(1).max(140),
      a: z.string().trim().max(400),
    }),
  )
  .max(3);
export type ProfilePrompt = { q: string; a: string };

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  user1Id: varchar("user1_id").notNull().references(() => users.id),
  user2Id: varchar("user2_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  compatibilityScore: integer("compatibility_score"),
  user1DeletedChat: boolean("user1_deleted_chat").default(false),
  user2DeletedChat: boolean("user2_deleted_chat").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const interviews = pgTable("interviews", {
  id: serial("id").primaryKey(),
  requesterId: varchar("requester_id").notNull().references(() => users.id),
  targetId: varchar("target_id").notNull().references(() => users.id),
  status: text("status").notNull().default("requested"),
  transcript: text("transcript"),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  ownerId: varchar("owner_id").references(() => users.id),
  iconUrl: text("icon_url"),
  bannerUrl: text("banner_url"),
  groupPhotoUrl: text("group_photo_url"),
  categoryTags: text("category_tags").array(),
  privacyMode: text("privacy_mode").notNull().default("open"),
  mediaEnabled: boolean("media_enabled").default(true),
  stickersEnabled: boolean("stickers_enabled").default(true),
  postingPermission: text("posting_permission").notNull().default("everyone"),
  mediaPermission: text("media_permission").notNull().default("everyone"),
  inviteDirectJoinEnabled: boolean("invite_direct_join_enabled").default(false),
  rulesText: text("rules_text"),
  canMembersEditInfo: boolean("can_members_edit_info").default(true),
  canMembersSendMessages: boolean("can_members_send_messages").default(true),
  canMembersAddOthers: boolean("can_members_add_others").default(true),
  maxMembers: integer("max_members").default(500),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  nickname: text("nickname"),
  role: text("role").notNull().default("member"),
  isMuted: boolean("is_muted").default(false),
  joinedAt: timestamp("joined_at").defaultNow(),
  lastSeenMessageId: integer("last_seen_message_id"),
});

export const groupJoinRequests = pgTable("group_join_requests", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at").defaultNow(),
  processedBy: varchar("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
});

export const groupInviteLinks = pgTable("group_invite_links", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  token: varchar("token").notNull().unique(),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
});

export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matches.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const groupMessages = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  nickname: text("nickname"),
  content: text("content").notNull(),
  contentType: text("content_type").notNull().default("text"),
  mediaUrl: text("media_url"),
  replyToMessageId: integer("reply_to_message_id"),
  isDeletedByAdmin: boolean("is_deleted_by_admin").default(false),
  deletedForEveryone: boolean("deleted_for_everyone").default(false),
  isStarred: boolean("is_starred").default(false),
  originalContent: text("original_content"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const starredMessages = pgTable("starred_messages", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => groupMessages.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  groupId: integer("group_id").notNull().references(() => groups.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const groupModerationLogs = pgTable("group_moderation_logs", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  messageId: integer("message_id"),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  reason: text("reason"),
  moderatedBy: varchar("moderated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const polls = pgTable("polls", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  messageId: integer("message_id").references(() => groupMessages.id),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  question: text("question").notNull(),
  allowMultiple: boolean("allow_multiple").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pollOptions = pgTable("poll_options", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => polls.id),
  text: text("text").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
});

export const pollVotes = pgTable("poll_votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => polls.id),
  optionId: integer("option_id").notNull().references(() => pollOptions.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messageReactions = pgTable("message_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => groupMessages.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  reaction: text("reaction").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const twinMemory = pgTable("twin_memory", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  role: text("role").notNull(),
  useForTraining: boolean("use_for_training").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const twinNotifications = pgTable("twin_notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  tier: text("tier").notNull(),
  status: text("status").notNull().default("active"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  status: text("status").notNull().default("pending"),
  stripeChargeId: varchar("stripe_charge_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const entitlements = pgTable("entitlements", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  quantity: integer("quantity").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const twinProfilesStructured = pgTable("twin_profiles_structured", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  topValues: text("top_values").array(),
  relationshipGoals: text("relationship_goals"),
  boundaries: text("boundaries"),
  humorStyle: text("humor_style"),
  communicationStyle: text("communication_style"),
  attachmentStyle: text("attachment_style"),
  interests: text("interests").array(),
  lifestylePatterns: text("lifestyle_patterns").array(),
  desiredPartnerTraits: text("desired_partner_traits").array(),
  twinToneProfile: jsonb("twin_tone_profile"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const twinMemoryFacts = pgTable("twin_memory_facts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  factText: text("fact_text").notNull(),
  source: text("source").default("chat"),
  sourceMessageIds: integer("source_message_ids").array(),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const twinMemorySummary = pgTable("twin_memory_summary", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  summaryText: text("summary_text").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  category: text("category").notNull(),
  answerType: text("answer_type").notNull().default("text"),
  options: jsonb("options"),
  isOnboardingQuestion: boolean("is_onboarding_question").default(false),
  weight: integer("weight").default(1),
  orderIndex: integer("order_index").default(0),
});

export const userAnswers = pgTable("user_answers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  questionId: integer("question_id").notNull().references(() => questions.id),
  answerText: text("answer_text"),
  selectedOptions: jsonb("selected_options"),
  ratingValue: integer("rating_value"),
  isPrivate: boolean("is_private").default(false),
  answeredAt: timestamp("answered_at").defaultNow(),
});

export const questionSchedule = pgTable("question_schedule", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  questionId: integer("question_id").notNull().references(() => questions.id),
  askedAt: timestamp("asked_at").defaultNow(),
  skippedAt: timestamp("skipped_at"),
  nextAskAt: timestamp("next_ask_at"),
});

export const stories = pgTable("stories", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const storyMedia = pgTable("story_media", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull().references(() => stories.id),
  type: text("type").notNull().default("image"),
  url: text("url"),
  textContent: text("text_content"),
  caption: text("caption"),
  orderIndex: integer("order_index").default(0),
});

export const storyLikes = pgTable("story_likes", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull().references(() => stories.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storyComments = pgTable("story_comments", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull().references(() => stories.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storyViews = pgTable("story_views", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull().references(() => stories.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  durationDays: integer("duration_days").notNull(),
  priceUsd: decimal("price_usd", { precision: 10, scale: 2 }).notNull(),
  weeklyEquivalent: decimal("weekly_equivalent", { precision: 10, scale: 2 }),
  isBestValue: boolean("is_best_value").default(false),
  features: text("features").array(),
  stripePriceId: varchar("stripe_price_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  eventType: text("event_type").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatRequests = pgTable("chat_requests", {
  id: serial("id").primaryKey(),
  requesterId: varchar("requester_id").notNull().references(() => users.id),
  targetId: varchar("target_id").notNull().references(() => users.id),
  groupId: integer("group_id").notNull().references(() => groups.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const blockedUsers = pgTable("blocked_users", {
  id: serial("id").primaryKey(),
  blockerId: varchar("blocker_id").notNull().references(() => users.id),
  blockedId: varchar("blocked_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Public waitlist requests from the marketing Landing page. No user account
// exists yet at this point — this is the pre-signup capture. The four "twin
// questions" are stored verbatim so the eventual onboarding can pre-fill.
export const inviteRequests = pgTable("invite_requests", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  intent: text("intent").notNull(),
  twinVoice: text("twin_voice").notNull(),
  oneTrueThing: text("one_true_thing").notNull(),
  room: text("room").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Growth, kept strictly separate from matching. A referral only ever grants
// PROFILE VIEWS (looking someone up), never an extra daily read.
export const referralCodes = pgTable("referral_codes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  code: text("code").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referrals = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    referrerUserId: varchar("referrer_user_id").notNull().references(() => users.id),
    invitedUserId: varchar("invited_user_id").notNull().references(() => users.id),
    code: text("code").notNull(),
    // pending  -> invited user signed up, not yet activated
    // qualified-> activation gate passed but reward capped/held
    // rewarded -> referrer has been granted their profile views
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
    qualifiedAt: timestamp("qualified_at"),
  },
  (t) => ({
    invitedIdx: uniqueIndex("referrals_invited_user_idx").on(t.invitedUserId),
  }),
);

export const profileViewGrants = pgTable("profile_view_grants", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(), // weekly | referral | ember
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referralClaimSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[2-9A-HJ-NP-Z]{8}$/, "That code is not valid"),
});

export type ReferralCode = typeof referralCodes.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type ProfileViewGrant = typeof profileViewGrants.$inferSelect;

export const dailyLikeCounts = pgTable("daily_like_counts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  count: integer("count").notNull().default(0),
});

// One row per (user, reminder kind). The in-app twin-readiness nudges are
// dismissible but time-boxed and per-user (not per-device) — `dismissedUntil`
// is set ~7 days out and the reminder returns after that.
export const reminderDismissals = pgTable("reminder_dismissals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(), // 'discover_readiness_strip'
  dismissedUntil: timestamp("dismissed_until").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  uniqueIndex("reminder_dismissals_user_kind_idx").on(t.userId, t.kind),
]);

export const REMINDER_KINDS = ["discover_readiness_strip"] as const;
export const reminderKindEnum = z.enum(REMINDER_KINDS);

// The minimum answered soul-mapping questions below which the twin is NOT
// generated and the twin layer shows as "not yet ready" rather than guessing.
export const MIN_TWIN_ANSWERS = 3;

export type ReminderDismissal = typeof reminderDismissals.$inferSelect;

// Small, hosted, in-person events attached to a group (or platform-hosted when
// groupId is null). seatModel drives allocation:
//   'open'    - unlimited, seatCount ignored
//   'capped'  - hard seatCount; overflow attendees land as 'waitlisted'
//   'curated' - seatCount required; joining creates a 'requested' row, never
//               'going' directly - the host (or a future resonance-based
//               allocator) promotes requests
// ── Events v2 taxonomy — fixed, closed lists. Hosts pick from these; a
// free-text `kind` would destroy filtering within a month.
export const EVENT_KINDS = [
  "music", "food", "outdoors", "sport", "film", "books", "art", "faith",
  "games", "making", "learning", "dancing", "volunteering", "nightlife", "wellness",
] as const;
export const EVENT_VIBES = ["quiet", "loud", "active", "seated", "outdoors", "late", "early"] as const;
export const EVENT_PLACE_TYPES = ["home", "bar", "restaurant", "outdoors", "venue", "studio", "sports"] as const;
export const EVENT_TIME_WINDOWS = ["morning", "afternoon", "evening", "late"] as const;
export const EVENT_ACCESS_NEEDS = ["step-free", "seated", "quiet-space"] as const;
export const EVENT_VISIBILITY = ["public", "group", "invite"] as const;

// ── Events v3 — venue media, contribution, safety ──
// Location tier is ALWAYS server-computed from placeId / address / the private
// toggle — a host can never declare their own tier.
export const EVENT_LOCATION_TIERS = ["venue_verified", "venue_public_unverified", "private_residence"] as const;
export const EVENT_COST_MODELS = ["free_hosted", "contribute", "pay_own_way"] as const;
export const HOST_VIDEO_STATUSES = ["none", "processing", "approved", "rejected"] as const;
export const PRIVATE_RESIDENCE_MIN_ATTENDEES = 4;
export const MAX_CONTRIBUTION = 200;

// Real venues, seeded and admin-confirmed. A host matching one of these gets
// the frictionless path (venue_verified) with no photo/video requirement.
export const places = pgTable("places", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  addressLine: text("address_line").notNull(),
  suburb: text("suburb").notNull(),
  city: text("city").notNull(),
  lat: decimal("lat", { precision: 9, scale: 6 }),
  lng: decimal("lng", { precision: 9, scale: 6 }),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});


export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groups.id),
  hostUserId: varchar("host_user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  venueName: text("venue_name"),
  suburb: text("suburb"),
  city: text("city"),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  seatModel: text("seat_model").notNull().default("open"),
  seatCount: integer("seat_count"),
  emberFirstPick: boolean("ember_first_pick").notNull().default(false),
  coverImageUrl: text("cover_image_url"),
  // draft | pending_review (a host's first event, held for a look) |
  // published | cancelled
  status: text("status").notNull().default("draft"),
  cancelReason: text("cancel_reason"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  // v2
  kind: text("kind"),                                     // one EVENT_KINDS value
  vibes: text("vibes").array(),
  placeType: text("place_type"),                          // one EVENT_PLACE_TYPES value
  lat: decimal("lat", { precision: 9, scale: 6 }),        // null → suburb centroid
  lng: decimal("lng", { precision: 9, scale: 6 }),
  isSober: boolean("is_sober").notNull().default(false),
  accessibility: text("accessibility").array(),
  ageMin: integer("age_min"),
  ageMax: integer("age_max"),
  createdByUserId: varchar("created_by_user_id").references(() => users.id), // null = seed/system
  visibility: text("visibility").notNull().default("public"), // public | group | invite
  // ── v3 ──
  locationTier: text("location_tier").notNull().default("venue_public_unverified"), // SERVER-computed, never client-set
  placeId: integer("place_id").references(() => places.id),
  addressLine: text("address_line"),        // full street address — disclosure-gated (see serializeEvent)
  costModel: text("cost_model").notNull().default("free_hosted"),
  contributionAmount: decimal("contribution_amount", { precision: 8, scale: 2 }),
  contributionCurrency: text("contribution_currency").notNull().default("USD"),
  contributionNote: text("contribution_note"),
  contactPhone: text("contact_phone"),      // NEVER in any list/detail payload; released via /contact only
  contactWhatsapp: text("contact_whatsapp"), // NEVER in any list/detail payload
  hostVideoUrl: text("host_video_url"),
  hostVideoPosterUrl: text("host_video_poster_url"),
  hostVideoDurationSec: integer("host_video_duration_sec"),
  hostVideoStatus: text("host_video_status").notNull().default("none"),
  hostVideoRejectReason: text("host_video_reject_reason"),
  minAttendees: integer("min_attendees"),    // forced to 4 for private_residence
  infoScore: integer("info_score").notNull().default(0), // computed — Events v3 Conversation Two
});

// Up to 6 per event. EXIF is stripped server-side on upload (mandatory — a
// host's home photo must not carry GPS). `url` is the 1600w webp; 480/960
// variants live at the same path with the width swapped.
export const eventPhotos = pgTable("event_photos", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => events.id),
  url: text("url").notNull(),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Audit: every time an attendee unlocks a host's contact number. The host sees
// this list on their manage screen; it is never exposed to anyone else.
export const eventContactViews = pgTable("event_contact_views", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => events.id),
  viewerUserId: varchar("viewer_user_id").notNull().references(() => users.id),
  viewedAt: timestamp("viewed_at").defaultNow(),
});

// One row per user. Created lazily on first /api/events/feed hit.
export const eventPreferences = pgTable("event_preferences", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  kinds: text("kinds").array(),
  vibes: text("vibes").array(),
  maxDistanceKm: integer("max_distance_km").notNull().default(15),
  placeTypes: text("place_types").array(),
  groupSizeMax: integer("group_size_max"),                // null = no preference
  daysOfWeek: integer("days_of_week").array(),            // 0-6, empty/null = any
  timeWindows: text("time_windows").array(),
  ageRangeMin: integer("age_range_min"),
  ageRangeMax: integer("age_range_max"),
  soberOnly: boolean("sober_only").notNull().default(false),
  accessibilityNeeds: text("accessibility_needs").array(),
  notifyOnGoodMatch: boolean("notify_on_good_match").notNull().default(true),
  notifyThreshold: integer("notify_threshold").notNull().default(82),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Distance is computed from these when an event has no explicit lat/lng.
// An event whose suburb isn't here is excluded from /feed (logged).
export const suburbCentroids = pgTable("suburb_centroids", {
  suburb: text("suburb").primaryKey(),
  city: text("city").notNull(),
  lat: decimal("lat", { precision: 9, scale: 6 }).notNull(),
  lng: decimal("lng", { precision: 9, scale: 6 }).notNull(),
});

// One alert per (user, event) ever — the unique index is the "never nag twice"
// guarantee. The rate windows (<=3 / 7d, <=1 / 24h, quiet hours) are enforced
// in server/services/twin-event-alerts.ts by reading sentAt.
export const twinAlertLog = pgTable("twin_alert_log", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  eventId: integer("event_id").notNull().references(() => events.id),
  fitScore: integer("fit_score").notNull(),
  template: text("template").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
}, (table) => [
  uniqueIndex("twin_alert_log_user_event_idx").on(table.userId, table.eventId),
]);

// One row per (event, user). The unique index is load-bearing: POST
// /api/events/:id/attend must be safe to call twice in a race (double-tap,
// retry) without creating two rows - see server/events.ts.
export const eventAttendees = pgTable("event_attendees", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => events.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("going"),
  createdAt: timestamp("created_at").defaultNow(),
  decidedAt: timestamp("decided_at"),
}, (table) => [
  uniqueIndex("event_attendees_event_user_idx").on(table.eventId, table.userId),
]);

export const insertTwinProfilesStructuredSchema = createInsertSchema(twinProfilesStructured).omit({
  id: true,
  updatedAt: true,
});

export const insertTwinMemoryFactSchema = createInsertSchema(twinMemoryFacts).omit({
  id: true,
  createdAt: true,
});

export const insertQuestionSchema = createInsertSchema(questions).omit({
  id: true,
});

export const insertUserAnswerSchema = createInsertSchema(userAnswers).omit({
  id: true,
  answeredAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertChatRequestSchema = createInsertSchema(chatRequests).omit({
  id: true,
  createdAt: true,
});

export const insertProfileSchema = createInsertSchema(profiles).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const seatModelEnum = z.enum(["open", "capped", "curated"]);
export const eventStatusEnum = z.enum(["draft", "pending_review", "published", "cancelled"]);
export const attendeeStatusEnum = z.enum(["going", "waitlisted", "requested", "declined", "cancelled"]);

export const insertEventSchema = createInsertSchema(events, {
  seatModel: seatModelEnum,
  status: eventStatusEnum,
}).omit({
  id: true,
  hostUserId: true,
  createdAt: true,
}).refine(
  (data) => data.seatModel === "open" || (data.seatCount != null && data.seatCount > 0),
  { message: "seatCount is required for capped and curated events", path: ["seatCount"] },
);

// PATCH allows a partial update, so the seatModel/seatCount cross-field rule
// above doesn't apply here (an update might touch neither field).
export const updateEventSchema = createInsertSchema(events, {
  seatModel: seatModelEnum,
  status: eventStatusEnum,
}).omit({
  id: true,
  hostUserId: true,
  createdAt: true,
}).partial();

// ── Events v2: preferences + search ──────────────────────────────────
export const eventKindEnum = z.enum(EVENT_KINDS);
export const eventVibeEnum = z.enum(EVENT_VIBES);
export const eventPlaceTypeEnum = z.enum(EVENT_PLACE_TYPES);
export const eventTimeWindowEnum = z.enum(EVENT_TIME_WINDOWS);
export const eventAccessEnum = z.enum(EVENT_ACCESS_NEEDS);
export const eventVisibilityEnum = z.enum(EVENT_VISIBILITY);
export const eventCostModelEnum = z.enum(EVENT_COST_MODELS);
export const eventLocationTierEnum = z.enum(EVENT_LOCATION_TIERS);
export const hostVideoStatusEnum = z.enum(HOST_VIDEO_STATUSES);

// PATCH /api/event-preferences — every field optional; arrays validated against
// the closed taxonomies; numeric bounds enforced.
export const updateEventPreferencesSchema = z.object({
  kinds: z.array(eventKindEnum).max(15),
  vibes: z.array(eventVibeEnum).max(7),
  maxDistanceKm: z.number().int().min(1).max(100),
  placeTypes: z.array(eventPlaceTypeEnum).max(7),
  groupSizeMax: z.number().int().min(2).max(500).nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7),
  timeWindows: z.array(eventTimeWindowEnum).max(4),
  ageRangeMin: z.number().int().min(18).max(99).nullable(),
  ageRangeMax: z.number().int().min(18).max(99).nullable(),
  soberOnly: z.boolean(),
  accessibilityNeeds: z.array(eventAccessEnum).max(3),
  notifyOnGoodMatch: z.boolean(),
  notifyThreshold: z.number().int().min(70).max(95),
}).partial();

// Query-param helpers: Express gives a bare string for one value, an array for
// repeated keys.
const arrayParam = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v == null ? undefined : Array.isArray(v) ? v : [v]), z.array(inner));
const boolParam = z.preprocess((v) => v === "true" || v === "1" || v === true, z.boolean());

// GET /api/events/search — explicit filters, ignores saved preferences.
export const eventSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  kind: arrayParam(eventKindEnum).optional(),
  placeType: arrayParam(eventPlaceTypeEnum).optional(),
  distanceKm: z.coerce.number().int().min(1).max(100).optional(),
  when: z.enum(["any", "week", "weekend", "month"]).optional(),
  sober: boolParam.optional(),
  stepFree: boolParam.optional(),
});

// POST /api/events — what a host is allowed to set. The server owns
// hostUserId, createdByUserId, status (first event -> pending_review), and
// lat/lng (derived from the suburb centroid). emberFirstPick is not
// host-settable here.
export const hostEventSchema = z
  .object({
    title: z.string().trim().min(4, "Give it a title").max(120),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    kind: eventKindEnum,
    vibes: z.array(eventVibeEnum).max(7).default([]),
    placeType: eventPlaceTypeEnum,
    venueName: z.string().trim().max(120).optional().or(z.literal("")),
    suburb: z.string().trim().min(2, "Which suburb?").max(80),
    city: z.string().trim().min(2, "Which city?").max(80),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional().nullable(),
    seatModel: seatModelEnum,
    seatCount: z.coerce.number().int().min(2).max(500).nullable().optional(),
    isSober: z.boolean().default(false),
    accessibility: z.array(eventAccessEnum).max(3).default([]),
    visibility: eventVisibilityEnum.default("public"),
    groupId: z.coerce.number().int().positive().nullable().optional(),
    // ── v3 — server owns locationTier / minAttendees / infoScore / hostVideo* ──
    placeId: z.coerce.number().int().positive().nullable().optional(),
    addressLine: z.string().trim().max(300).optional().or(z.literal("")),
    isPrivateAddress: z.boolean().default(false),
    costModel: eventCostModelEnum.default("free_hosted"),
    contributionAmount: z.coerce
      .number()
      .positive()
      .max(MAX_CONTRIBUTION, `Contributions over $${MAX_CONTRIBUTION} aren't allowed on VibeFlow.`)
      .nullable()
      .optional(),
    contributionNote: z.string().trim().max(200).optional().or(z.literal("")),
    contactPhone: z.string().trim().max(40).optional().or(z.literal("")),
    contactWhatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  })
  .refine((d) => d.seatModel === "open" || (d.seatCount != null && d.seatCount > 0), {
    message: "Set how many seats",
    path: ["seatCount"],
  })
  .refine((d) => !d.endsAt || d.endsAt.getTime() > d.startsAt.getTime(), {
    message: "End time has to be after the start",
    path: ["endsAt"],
  })
  .refine((d) => d.startsAt.getTime() > Date.now(), {
    message: "Pick a date in the future",
    path: ["startsAt"],
  })
  .refine((d) => d.costModel !== "contribute" || (d.contributionAmount != null && d.contributionAmount > 0), {
    message: "Set how much everyone chips in",
    path: ["contributionAmount"],
  });

// POST /api/events/:id/cancel — a reason attendees will see.
export const cancelEventSchema = z.object({
  reason: z.string().trim().min(3, "Tell people why").max(500),
});

export const twinVoiceEnum = z.enum(["Dry and direct", "Warm and curious", "Playful", "Measured"]);
export const inviteRoomEnum = z.enum([
  "Late Practice",
  "Sunday Trail",
  "Table for Six",
  "Not sure yet",
]);

export const insertInviteRequestSchema = createInsertSchema(inviteRequests, {
  email: z.string().trim().email().max(254),
  intent: z.string().trim().min(10, "Tell us a little more").max(2000),
  twinVoice: twinVoiceEnum,
  oneTrueThing: z.string().trim().min(10, "Tell us a little more").max(2000),
  room: inviteRoomEnum,
}).omit({
  id: true,
  status: true,
  createdAt: true,
});

export const insertMatchSchema = createInsertSchema(matches).omit({
  id: true,
  createdAt: true,
});

export const insertInterviewSchema = createInsertSchema(interviews).omit({
  id: true,
  createdAt: true,
});

export const insertGroupSchema = createInsertSchema(groups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDirectMessageSchema = createInsertSchema(directMessages).omit({
  id: true,
  createdAt: true,
});

export const insertGroupMessageSchema = createInsertSchema(groupMessages).omit({
  id: true,
  createdAt: true,
});

export const insertUserPhotoSchema = createInsertSchema(userPhotos).omit({
  id: true,
  createdAt: true,
});

export const insertTwinMemorySchema = createInsertSchema(twinMemory).omit({
  id: true,
  createdAt: true,
});

export const insertTwinNotificationSchema = createInsertSchema(twinNotifications).omit({
  id: true,
  createdAt: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPollSchema = createInsertSchema(polls).omit({
  id: true,
  createdAt: true,
});

export const insertPollOptionSchema = createInsertSchema(pollOptions).omit({
  id: true,
});

export const insertPollVoteSchema = createInsertSchema(pollVotes).omit({
  id: true,
  createdAt: true,
});

export const insertMessageReactionSchema = createInsertSchema(messageReactions).omit({
  id: true,
  createdAt: true,
});

export const insertStorySchema = createInsertSchema(stories).omit({
  id: true,
  createdAt: true,
});

export const insertStoryMediaSchema = createInsertSchema(storyMedia).omit({
  id: true,
});

export const insertStoryCommentSchema = createInsertSchema(storyComments).omit({
  id: true,
  createdAt: true,
});

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
});

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Match = typeof matches.$inferSelect;
export type Interview = typeof interviews.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type GroupJoinRequest = typeof groupJoinRequests.$inferSelect;
export type GroupInviteLink = typeof groupInviteLinks.$inferSelect;
export type DirectMessage = typeof directMessages.$inferSelect;
export type GroupMessage = typeof groupMessages.$inferSelect;
export type GroupModerationLog = typeof groupModerationLogs.$inferSelect;
export type UserPhoto = typeof userPhotos.$inferSelect;
export type TwinMemoryEntry = typeof twinMemory.$inferSelect;
export type TwinNotification = typeof twinNotifications.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;

export type Poll = typeof polls.$inferSelect;
export type PollOption = typeof pollOptions.$inferSelect;
export type PollVote = typeof pollVotes.$inferSelect;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type StarredMessage = typeof starredMessages.$inferSelect;

export type TwinProfileStructured = typeof twinProfilesStructured.$inferSelect;
export type InsertTwinProfileStructured = z.infer<typeof insertTwinProfilesStructuredSchema>;
export type TwinMemoryFact = typeof twinMemoryFacts.$inferSelect;
export type TwinMemorySummaryEntry = typeof twinMemorySummary.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type UserAnswer = typeof userAnswers.$inferSelect;
export type QuestionScheduleEntry = typeof questionSchedule.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type ChatRequest = typeof chatRequests.$inferSelect;
export type InsertChatRequest = z.infer<typeof insertChatRequestSchema>;
export type BlockedUser = typeof blockedUsers.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type DailyLikeCount = typeof dailyLikeCounts.$inferSelect;
export type InviteRequest = typeof inviteRequests.$inferSelect;
export type InsertInviteRequest = z.infer<typeof insertInviteRequestSchema>;
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type EventAttendee = typeof eventAttendees.$inferSelect;
export type EventPreferences = typeof eventPreferences.$inferSelect;
export type SuburbCentroid = typeof suburbCentroids.$inferSelect;
export type UpdateEventPreferences = z.infer<typeof updateEventPreferencesSchema>;
export type EventSearchQuery = z.infer<typeof eventSearchQuerySchema>;
export type HostEventInput = z.infer<typeof hostEventSchema>;
export type CancelEventInput = z.infer<typeof cancelEventSchema>;
export type TwinAlertLogEntry = typeof twinAlertLog.$inferSelect;
export type Place = typeof places.$inferSelect;
export type EventPhoto = typeof eventPhotos.$inferSelect;
export type EventContactView = typeof eventContactViews.$inferSelect;
export type EventLocationTier = z.infer<typeof eventLocationTierEnum>;
export type EventCostModel = z.infer<typeof eventCostModelEnum>;
export type HostVideoStatus = z.infer<typeof hostVideoStatusEnum>;
export type SeatModel = z.infer<typeof seatModelEnum>;
export type AttendeeStatus = z.infer<typeof attendeeStatusEnum>;

export type Story = typeof stories.$inferSelect;
export type StoryMedia = typeof storyMedia.$inferSelect;
export type StoryLike = typeof storyLikes.$inferSelect;
export type StoryComment = typeof storyComments.$inferSelect;
export type StoryView = typeof storyViews.$inferSelect;
export type Plan = typeof plans.$inferSelect;

export type CreateProfileRequest = InsertProfile;
export type UpdateProfileRequest = Partial<InsertProfile>;
