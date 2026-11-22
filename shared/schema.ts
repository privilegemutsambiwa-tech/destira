import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, decimal, real, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

export * from "./models/auth";
export * from "./models/chat";

import { users } from "./models/auth";
import type { ProfileDetails } from "./profile-details";
import type { MatchPrefs } from "./match-prefs";

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  displayName: text("display_name"),
  groupNickname: text("group_nickname"),
  bio: text("bio"),
  age: integer("age"),
  gender: text("gender"),
  genderSelfDescribe: text("gender_self_describe"),
  dateOfBirth: date("date_of_birth"), // the 18+ gate; `age` is derived for display
  seekingGenders: text("seeking_genders").array(), // who they want to meet (multi)
  datingIntent: text("dating_intent"), // relationship | see | friends-first | unsure
  location: text("location"),
  personalityProfile: jsonb("personality_profile"),
  twinPersona: text("twin_persona"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  isPublic: boolean("is_public").default(false),
  // Admin moderation enforcement — see server/admin/reports.ts. "active" is
  // the only state that can log in or appear in Discover.
  moderationStatus: text("moderation_status").notNull().default("active"), // active | suspended | banned
  moderationStatusReason: text("moderation_status_reason"),
  moderationStatusAt: timestamp("moderation_status_at"),
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
  // ── Twin Proximity Alerts (default OFF; only the latest ping is kept) ──
  currentPlaceId: integer("current_place_id"),
  proximityMode: text("proximity_mode").notNull().default("off"), // off | campus_work | everywhere
  proximityFloor: text("proximity_floor").notNull().default("sometimes"), // sometimes | strong | rare
  proximityQuietStart: integer("proximity_quiet_start").notNull().default(21), // recipient-local hour
  proximityQuietEnd: integer("proximity_quiet_end").notNull().default(8),
  proximityPausedUntil: timestamp("proximity_paused_until"),
  ageMinPreference: integer("age_min_preference").default(18),
  ageMaxPreference: integer("age_max_preference").default(65),
  timezone: text("timezone"), // IANA tz captured client-side; used for honest "resets at midnight" copy
  prompts: jsonb("prompts"), // ProfilePrompt[] — see profilePromptsSchema
  // Faith, children, marriage plans, languages and other details, all
  // optional (shared/profile-details.ts). Saves merge into it.
  details: jsonb("details").$type<ProfileDetails>(),
  // Who they want to see beyond age/distance/gender (shared/match-prefs.ts).
  matchPrefs: jsonb("match_prefs").$type<MatchPrefs>(),
  // What the twin may disclose in an interview. { categoryKey: 'open'|'acknowledge'|'closed' }.
  // Missing/absent => 'closed'. See shared/disclosure.ts.
  disclosureSettings: jsonb("disclosure_settings").$type<Record<string, string>>(),
  // Free-text user directive to the twin — instructions, NOT data. Never quoted back.
  disclosureDirective: text("disclosure_directive"),
  // Single source of truth for "use my twin conversations to improve the
  // model" — false (default) means opted in, matching today's behavior.
  // addTwinMemory() reads this for every new memory row; the training-opt-out
  // endpoint also bulk-updates existing twinMemory rows for consistency when
  // this flips, but this column (not the per-row flag) is what a future
  // memory entry actually checks.
  twinTrainingOptOut: boolean("twin_training_opt_out").notNull().default(false),
  // Clears the "Story replies" chat filter's unread badge — everything newer
  // than this on any of the user's own stories counts as unread.
  storyRepliesReadAt: timestamp("story_replies_read_at"),
  // Per-category push toggle. Missing key => on (matches the Settings UI's
  // "everything on by default" behavior). Categories: matches, messages,
  // stories, interviews.
  notificationPrefs: jsonb("notification_prefs").$type<Record<string, boolean>>(),
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
    // { w800, w1600 } webp derivatives written on upload (server/routes POST
    // /api/uploads/image). Null for photos uploaded before the pipeline / not
    // yet backfilled — consumers fall back to photoUrl.
    variants: jsonb("variants").$type<{ w800?: string; w1600?: string }>(),
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
  // Last time each side opened the thread — drives the chat-list unread
  // count (messages from the other person after this timestamp).
  user1LastReadAt: timestamp("user1_last_read_at"),
  user2LastReadAt: timestamp("user2_last_read_at"),
  // A super like: the receiver sees it first and it's marked as one
  // (server/discover-perks.ts).
  isSuper: boolean("is_super").default(false),
  // The one "your chat went quiet" push this chat will ever get (server/dates.ts).
  quietNudgedAt: timestamp("quiet_nudged_at"),
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
  // Bumped whenever the transcript changes, so the chat list can sort/show
  // the true last-activity time instead of when the interview was first
  // started (transcript has no per-message timestamps of its own).
  updatedAt: timestamp("updated_at").defaultNow(),
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
  // Curated/Destira-run Lounges (see scripts/seed-lounges.ts) vs. anything a
  // member created themselves — lets the Lounge tab guarantee new users
  // always see something joinable instead of a cold, empty list.
  isOfficial: boolean("is_official").default(false),
  // A campus ("University of Zimbabwe") or city/area ("Harare") this Lounge
  // is for. One flexible label rather than separate campus/city columns —
  // unlike `events`, Lounges don't need real geo math, just a grouping tag.
  locationLabel: text("location_label"),
  // An event's auto-created attendee room. Excluded from the public
  // Lounge tab/search — it's scoped to that one event, not browsable.
  isEventChat: boolean("is_event_chat").default(false),
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
  // Admin moderation removal — same shape as groupMessages' isDeletedByAdmin.
  isDeletedByAdmin: boolean("is_deleted_by_admin").default(false),
  originalContent: text("original_content"),
  // Photos and voice notes (server/dm-extras.ts). content holds a short
  // label ("Photo", "Voice note") so previews and pushes read naturally.
  contentType: text("content_type").notNull().default("text"),
  mediaKey: text("media_key"),
  mediaMeta: jsonb("media_meta").$type<{ mime?: string; durationMs?: number; viewOnce?: boolean; width?: number; height?: number }>(),
  // A view-once photo, opened by the recipient: never served again.
  viewedAt: timestamp("viewed_at"),
  editedAt: timestamp("edited_at"),
  // Taken back by the sender: content is cleared for both sides (the
  // original stays in originalContent for reports, never sent to clients).
  unsentAt: timestamp("unsent_at"),
  // Set by the device that wrote it, so an outbox retry can't send twice.
  clientId: text("client_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// One reaction per member per direct message (a new one replaces the old).
export const dmReactions = pgTable("dm_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => directMessages.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [uniqueIndex("dm_reactions_message_user_idx").on(t.messageId, t.userId)]);

// "Let's meet" (server/dates.ts, shared/date-plan.ts). One open proposal per
// chat; a new one replaces it. The card lives in the chat as a direct
// message with contentType 'date' (messageId).
export const datePlans = pgTable("date_plans", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matches.id),
  proposerId: varchar("proposer_id").notNull().references(() => users.id),
  kind: text("kind").notNull(), // coffee | lunch | walk | event
  placeName: text("place_name").notNull(),
  placeDetail: text("place_detail"),
  eventId: integer("event_id"),
  times: jsonb("times").$type<string[]>().notNull(),
  startsAt: timestamp("starts_at"),
  status: text("status").notNull().default("proposed"), // proposed | confirmed | declined | cancelled | replaced
  messageId: integer("message_id"),
  respondedAt: timestamp("responded_at"),
  checkinPushedAt: timestamp("checkin_pushed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("date_plans_match_idx").on(t.matchId), index("date_plans_message_idx").on(t.messageId)]);

// The private "How did it go?" after a date. Never shown to the other person.
export const dateCheckins = pgTable("date_checkins", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => datePlans.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  answer: text("answer").notNull(), // great | okay | not_for_me | report
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [uniqueIndex("date_checkins_plan_user_idx").on(t.planId, t.userId)]);

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

// Group games: the same message-as-pointer pattern as polls above
// (groupMessages row with contentType 'game' -> messageId here), but unlike
// a poll a game has a reveal MOMENT (status flips once) and some kinds hide
// an answer in `config` until reveal — see server/group-games.ts, which is
// the only place `config`/`response` ever get interpreted or sanitized.
export const GROUP_GAME_KINDS = [
  "two_truths_one_lie", "would_you_rather", "this_or_that", "never_have_i_ever",
  "most_likely_to", "trivia_round", "category_sprint", "emoji_charades", "icebreaker_roulette",
  "hot_take",
] as const;
export const groupGameKindEnum = z.enum(GROUP_GAME_KINDS);
export type GroupGameKind = (typeof GROUP_GAME_KINDS)[number];

export const groupGames = pgTable("group_games", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  messageId: integer("message_id").references(() => groupMessages.id),
  kind: text("kind").notNull(), // one GROUP_GAME_KINDS value
  startedBy: varchar("started_by").notNull().references(() => users.id),
  config: jsonb("config").notNull(), // per-kind setup; may hold a hidden answer pre-reveal
  status: text("status").notNull().default("active"), // 'active' | 'revealed'
  revealAt: timestamp("reveal_at"), // null = reveals only once every eligible member has responded
  results: jsonb("results"), // computed exactly once, at reveal — never recomputed after
  createdAt: timestamp("created_at").defaultNow(),
  revealedAt: timestamp("revealed_at"),
});

export const groupGameResponses = pgTable("group_game_responses", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => groupGames.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  nickname: text("nickname").notNull(), // denormalized snapshot, same convention as groupMessages.nickname
  response: jsonb("response").notNull(), // shape is per-kind: {choice}/{text}/{items}/{targetUserId}
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  uniqueIndex("group_game_responses_game_user_idx").on(t.gameId, t.userId),
]);

// Who's actually IN a given game's room — a group member only counts toward
// eligibility/reveal once they've explicitly joined (see server/group-games.ts
// eligibleCount/joinGame), not by merely being in the group. The starter is
// added here at creation time too (see createGame) unless their kind's
// starterParticipates is false, in which case they host without playing.
export const groupGameParticipants = pgTable("group_game_participants", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => groupGames.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  nickname: text("nickname").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (t) => [
  uniqueIndex("group_game_participants_game_user_idx").on(t.gameId, t.userId),
]);

// A game room's own small text thread — deliberately simpler than
// groupMessages (no polls/images/reactions/replies): this is where the
// people who joined ONE game talk to each other, separate from the group's
// main chat.
export const groupGameMessages = pgTable("group_game_messages", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => groupGames.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  nickname: text("nickname").notNull(),
  content: text("content").notNull(),
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
  // Where tapping it goes (same URLs as push). Older rows fall back by type.
  url: text("url"),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Every push decision, one row each (Part I): what was sent, held for the
// morning or folded into a digest, refused by the daily budget or switched
// off. Also the once-only claim for reminders via (user, dedupe_key).
export const pushLog = pgTable("push_log", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  category: text("category").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url"),
  tag: text("tag"),
  dedupeKey: text("dedupe_key"),
  status: text("status").notNull(), // sent | held | digested | over_budget | off
  localDay: text("local_day").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("push_log_user_day_idx").on(t.userId, t.localDay),
  uniqueIndex("push_log_user_key_idx").on(t.userId, t.dedupeKey),
]);
export type PushLogRow = typeof pushLog.$inferSelect;

// When a member last opened Discover, Lounge or Events, for the small
// "new since you last looked" marker (Part I). No streaks, no counts.
export const surfaceSeen = pgTable("surface_seen", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  surface: text("surface").notNull(), // discover | lounge | events
  seenAt: timestamp("seen_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("surface_seen_user_surface_idx").on(t.userId, t.surface),
]);

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  provider: text("provider").default("mock"),
  providerReference: varchar("provider_reference"),
  tier: text("tier").notNull(),
  period: text("period").notNull().default("monthly"), // weekly | monthly | sixMonth
  status: text("status").notNull().default("active"), // active | cancelled | expired
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id),
  tier: varchar("tier"),                 // plan bought — server-resolved, never client amount
  period: text("period").notNull().default("monthly"), // weekly | monthly | sixMonth — server-resolved
  amount: integer("amount").notNull(),   // integer cents, server-resolved
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  status: text("status").notNull().default("pending"), // pending | paid | failed | cancelled | expired
  provider: text("provider").notNull().default("mock"), // mock | paynow_ecocash | paynow_card | stripe
  providerReference: varchar("provider_reference"),
  phoneNumberMasked: varchar("phone_number_masked"),    // "07•• ••• 1234" — never the full number, anywhere
  idempotencyKey: varchar("idempotency_key").unique(),
  pollUrl: text("poll_url"),
  rawStatus: text("raw_status"),
  failureReason: text("failure_reason"),
  lastPolledAt: timestamp("last_polled_at"),
  stripeChargeId: varchar("stripe_charge_id"),
  // Which locked feature's refusal sheet sent them to /plans, if any — the
  // gate-conversion metric ("which paywall is doing the selling") reads this.
  // Null for a cold /plans visit with no feature context.
  sourceFeature: text("source_feature"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const PAYMENT_METHODS = ["ecocash", "onemoney", "innbucks", "ecocash_card", "card"] as const;
export const paymentMethodEnum = z.enum(PAYMENT_METHODS);
export const initiatePaymentSchema = z.object({
  // "crown" is the $100 membership (shared/crown.ts): monthly or threeMonth
  // only, and only once the team has approved the member (server/crown.ts).
  tier: z.enum(["spark", "flame", "ember", "crown"]),
  period: z.enum(["weekly", "monthly", "sixMonth", "threeMonth"]).default("monthly"),
  method: paymentMethodEnum,
  phone: z.string().trim().max(20).optional(),
  sourceFeature: z.string().max(60).optional(),
  // "Send the prompt again" — forces a genuine new provider.initiate() call
  // instead of the idempotency short-circuit handing back the still-pending
  // row from the first attempt untouched (which used to make resend a
  // silent no-op for the first 15 minutes).
  resend: z.boolean().optional(),
});
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

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
  // Disclosure categories this fact touches (shared/disclosure.ts keys). Empty
  // array = classified as touching none. NULL = not yet classified.
  sensitivity: text("sensitivity").array(),
  // Has this fact been through sensitivity classification? false/default = no,
  // so it is withheld from interviews until the backfill or the extractor
  // classifies it. Interview filtering then re-checks the user's current
  // per-category settings against `sensitivity`.
  disclosable: boolean("disclosable").notNull().default(false),
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
  // Disclosure categories this answer touches (shared/disclosure.ts keys). NULL
  // = unclassified; interview filtering treats that as withheld unless the
  // question is on the known-safe onboarding map.
  sensitivity: text("sensitivity").array(),
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
  // Shown from this moment (official Destira stories are scheduled through
  // the day); members' own stories go out immediately.
  publishAt: timestamp("publish_at").notNull().defaultNow(),
  // The library item an official Destira story was made from.
  officialItemId: integer("official_item_id"),
});

export const storyMedia = pgTable("story_media", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("image"),
  url: text("url"),
  textContent: text("text_content"),
  caption: text("caption"),
  orderIndex: integer("order_index").default(0),
  // A story made from an event's "Post to Status": viewers get a live
  // "See the event" panel (server/event-seats.ts) that opens it.
  eventId: integer("event_id").references(() => events.id, { onDelete: "set null" }),
  // Official stories: an optional button (an in-app path like /invite), and
  // a video's length so the viewer can time it.
  ctaLabel: text("cta_label"),
  ctaUrl: text("cta_url"),
  durationSec: integer("duration_sec"),
});

// The official Destira status library. Every day 2–3 items go out as stories
// from the Destira account (server/official-stories.ts): anything scheduled
// for that date first, then evergreen items in rotation, least recently shown
// first.
export const officialStoryItems = pgTable("official_story_items", {
  id: serial("id").primaryKey(),
  mediaUrl: text("media_url").notNull(),
  mediaType: text("media_type").notNull(), // image | video
  durationSec: integer("duration_sec"),
  caption: text("caption"),
  ctaLabel: text("cta_label"),
  ctaUrl: text("cta_url"),
  eventId: integer("event_id").references(() => events.id, { onDelete: "set null" }),
  scheduledFor: date("scheduled_for"), // a specific day (Harare), or null
  evergreen: boolean("evergreen").notNull().default(true),
  active: boolean("active").notNull().default(true),
  timesShown: integer("times_shown").notNull().default(0),
  lastShownOn: date("last_shown_on"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

// One row per day once that day's official stories exist (so they're made
// once, whichever server instance gets there first).
export const officialStoryDays = pgTable("official_story_days", {
  day: date("day").primaryKey(),
  storyIds: integer("story_ids").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storyLikes = pgTable("story_likes", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storyComments = pgTable("story_comments", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storyViews = pgTable("story_views", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tier rows (free / spark / flame / ember). `tier` is the key; the limits and
// copy live in shared/entitlements.ts. `durationDays` / `weeklyEquivalent` /
// `isBestValue` are legacy from the old duration model — kept nullable until a
// cleanup migration, not read anywhere.
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // one of shared/entitlements TIERS. Not a DB unique constraint — the 4-row
  // startup seed is the sole writer and guarantees distinctness; adding the
  // constraint to the populated table needs an interactive drizzle-kit truncate
  // prompt for no real safety gain.
  tier: varchar("tier"),
  priceCents: integer("price_cents"),
  durationDays: integer("duration_days"),
  priceUsd: decimal("price_usd", { precision: 10, scale: 2 }),
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
    // What each side got when the invite qualified: a free week of plan time,
    // or (on a paid plan) profile views instead. The referrer's views also
    // include the base five every invite earns. 0 days = no week: a paid
    // member, a referral from before the free week, or over the monthly cap.
    referrerRewardDays: integer("referrer_reward_days").notNull().default(0),
    invitedRewardDays: integer("invited_reward_days").notNull().default(0),
    referrerRewardViews: integer("referrer_reward_views").notNull().default(0),
    invitedRewardViews: integer("invited_reward_views").notNull().default(0),
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

// Where a member came from — first touch, recorded once at signup from the
// vf_src cookie the client sets on a signed-out visitor's first page view.
// source: referral | share_card | event | group | campaign | search | social
//       | other_site | direct
export const signupSources = pgTable("signup_sources", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  source: text("source").notNull(),
  detail: text("detail"),
  /** The landing headline they saw (?v= on the ad link; "default" without one). */
  landingVariant: text("landing_variant"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Signed-out landing page visits per day, headline and source: the first
// step of the console's Funnel. One count per browser session; no ids.
export const landingVisits = pgTable(
  "landing_visits",
  {
    day: date("day").notNull(),
    variant: text("variant").notNull(),
    source: text("source").notNull(),
    visits: integer("visits").notNull().default(0),
  },
  (t) => [uniqueIndex("landing_visits_key_idx").on(t.day, t.variant, t.source)],
);

// What Meta needs to match a later payment to the ad click that brought the
// member (server/meta-capi.ts): its own cookies, plus the browser's address
// and user agent at sign-up. Only ever sent to Meta, hashed where Meta asks.
export const adMatchKeys = pgTable("ad_match_keys", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  fbp: text("fbp"),
  fbc: text("fbc"),
  clientIp: text("client_ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Plan reminders already sent (server/billing.ts): "ends in 3 days", "ends
// tomorrow", "ended today", one row each per member and plan end date, so a
// push or in-app reminder can never repeat. Emails dedupe in member_email_log.
export const billingNotices = pgTable(
  "billing_notices",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("billing_notices_user_key_idx").on(t.userId, t.key)],
);

// Destira Crown (shared/crown.ts, server/crown.ts): one row per member who
// ever applied. applied -> approved (holds a seat while they pay) -> active
// (paid; activeUntil) -> revoked; or declined. A member is Crown only while
// status is "active" and activeUntil is in the future.
export const crownMembers = pgTable(
  "crown_members",
  {
    userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("applied"),
    city: text("city").notNull().default("Harare"),
    /** What they told us when applying. Team-only. */
    note: text("note"),
    appliedAt: timestamp("applied_at").defaultNow(),
    decidedAt: timestamp("decided_at"),
    decidedBy: varchar("decided_by"),
    /** Shown to the member when an application is declined or a crown revoked. */
    reason: text("reason"),
    activeUntil: timestamp("active_until"),
    /** Private mode: only people they've liked can see them (server/crown-perks.ts). */
    privateMode: boolean("private_mode").notNull().default(false),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("crown_members_status_idx").on(t.status)],
);

// Crown Spotlight: which Crown member was lifted near the top of whose deck,
// and on which day (the viewer's local day), so each viewer gets at most a
// couple a day and never the same one twice in a day.
export const crownSpotlights = pgTable(
  "crown_spotlights",
  {
    id: serial("id").primaryKey(),
    viewerId: varchar("viewer_id").notNull(),
    crownId: varchar("crown_id").notNull(),
    day: text("day").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("crown_spotlights_viewer_crown_day_idx").on(t.viewerId, t.crownId, t.day)],
);

// Crown direct introductions: a like that carries a short note. The like is
// an ordinary pending matches row; this is the note riding on it. Accepting
// is a like back, declining is a silent pass.
export const crownIntros = pgTable(
  "crown_intros",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id").notNull(),
    fromUserId: varchar("from_user_id").notNull(),
    toUserId: varchar("to_user_id").notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("crown_intros_match_idx").on(t.matchId),
    index("crown_intros_from_created_idx").on(t.fromUserId, t.createdAt),
    index("crown_intros_to_idx").on(t.toUserId),
  ],
);

// Each tap on a share action (an event or invite, as a link or a Status
// card) — so the console can show shares next to the signups they bring.
export const shareEvents = pgTable("share_events", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(), // event | invite
  format: text("format").notNull(), // status_card | link | destira_story
  targetId: text("target_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referralClaimSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[2-9A-HJ-NP-Z]{8}$/, "That code is not valid"),
});

export type ReferralCode = typeof referralCodes.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type ProfileViewGrant = typeof profileViewGrants.$inferSelect;

// A Discover "pass" (not interested) — separate from `matches` (which only
// ever holds likes/requests) so a pass can never leak into a match list, a
// chat thread, or the incoming-likes page. Recorded once per (viewer,
// target) so getDiscoverableProfiles can exclude them permanently, the same
// way an existing `matches` row already excludes someone you liked.
export const discoverPasses = pgTable("discover_passes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  targetId: varchar("target_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  uniqueIndex("discover_passes_user_target_idx").on(t.userId, t.targetId),
]);

// A pass brought back after the free few-second undo (Spark: 1 a day).
export const discoverRewinds = pgTable("discover_rewinds", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  targetId: varchar("target_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("discover_rewinds_user_idx").on(t.userId, t.createdAt)]);

// 30 minutes at the front of nearby decks. source: "plan" (Ember's weekly
// one) or "credit" (bought, from profiles.boostsRemaining).
export const discoverBoosts = pgTable("discover_boosts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  source: text("source").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at").notNull(),
}, (t) => [index("discover_boosts_ends_idx").on(t.endsAt)]);

// Each deck a boost was actually placed at the front of, once per viewer:
// the honest "shown to N people" the member who boosted sees.
export const discoverBoostViews = pgTable("discover_boost_views", {
  id: serial("id").primaryKey(),
  boostId: integer("boost_id").notNull().references(() => discoverBoosts.id),
  viewerId: varchar("viewer_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [uniqueIndex("discover_boost_views_boost_viewer_idx").on(t.boostId, t.viewerId)]);

// How many decks each member was dealt into, per Harare day (server/matching.ts).
// Yesterday's count is what the popularity cap reads, so a member's place in
// a deck never moves during the day.
export const discoverShownDaily = pgTable("discover_shown_daily", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  day: date("day").notNull(),
  shown: integer("shown").notNull().default(0),
}, (t) => [uniqueIndex("discover_shown_daily_user_day_idx").on(t.userId, t.day)]);

// Per-member inputs to the deck score, refreshed once a day
// (server/matching.ts). replyRate: of conversations someone else started in
// the last 60 days, the share this member answered; null under 3.
export const memberMatchStats = pgTable("member_match_stats", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  replyRate: real("reply_rate"),
  replySample: integer("reply_sample").notNull().default(0),
  shownYesterday: integer("shown_yesterday").notNull().default(0),
  updatedDay: date("updated_day"),
});

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

export const REMINDER_KINDS = ["discover_readiness_strip", "proximity_upsell", "twin_disclosure_intro", "twin_disclosure_interview", "profile_photos_nudge", "profile_completion_nudge", "lounge_intro_tip", "events_intro_tip"] as const;
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
// ── Events v2 taxonomy — moved to event-taxonomy.ts (no drizzle/pg imports,
// so client pages that need these plain arrays don't drag the admin tables
// into their bundle along with them). Re-exported here so existing server
// code importing them from "@shared/schema" keeps working unchanged.
export {
  EVENT_KINDS,
  EVENT_VIBES,
  EVENT_PLACE_TYPES,
  EVENT_TIME_WINDOWS,
  EVENT_ACCESS_NEEDS,
  EVENT_VISIBILITY,
} from "./event-taxonomy";
import {
  EVENT_KINDS,
  EVENT_VIBES,
  EVENT_PLACE_TYPES,
  EVENT_TIME_WINDOWS,
  EVENT_ACCESS_NEEDS,
  EVENT_VISIBILITY,
} from "./event-taxonomy";

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
export const PLACE_TYPES = ["campus", "office", "mall", "transit", "cafe", "street", "venue"] as const;
export const placeTypeEnum = z.enum(PLACE_TYPES);
export type PlaceType = (typeof PLACE_TYPES)[number];

export const places = pgTable("places", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  addressLine: text("address_line").notNull(),
  suburb: text("suburb").notNull(),
  city: text("city").notNull(),
  lat: decimal("lat", { precision: 9, scale: 6 }),
  lng: decimal("lng", { precision: 9, scale: 6 }),
  // Proximity: what kind of place this is (drives alert phrasing) and the
  // "same place" tolerance in metres. Venue-seeded rows default to 'venue'.
  placeType: text("place_type").notNull().default("venue"),
  radiusM: integer("radius_m").notNull().default(120),
  createdByUserId: varchar("created_by_user_id").references(() => users.id), // user-declared "I'm at…" places
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
  // Who the host is willing to seat. "quota" splits seatCount into two
  // gender-segmented buckets (menSlots/womenSlots) instead of one shared count.
  genderPolicy: text("gender_policy").notNull().default("mixed"), // mixed | men_only | women_only | quota
  menSlots: integer("men_slots"),
  womenSlots: integer("women_slots"),
  // Optional private chat for attendees, off until the host creates it.
  chatGroupId: integer("chat_group_id").references(() => groups.id),
  // ── Official events (platform-run, hosted by the Destira system user) ──
  // leadUserId null on an official event = "needs a lead"; set only through
  // admin approval of an eventLeadApplications row. minGoing is the headcount
  // that must be reached by the 48h mark or the event is called off.
  isOfficial: boolean("is_official").notNull().default(false),
  leadUserId: varchar("lead_user_id").references(() => users.id),
  sponsorName: text("sponsor_name"),
  sponsorLogoUrl: text("sponsor_logo_url"),
  minGoing: integer("min_going"),
  leadNudgedAt: timestamp("lead_nudged_at"), // set once the "still needs a lead" push has gone out
});

// A member's "I'll lead this" request on an official event. An admin approves
// at most one; approval sets events.leadUserId.
export const eventLeadApplications = pgTable("event_lead_applications", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => events.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  note: text("note"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  createdAt: timestamp("created_at").defaultNow(),
  decidedAt: timestamp("decided_at"),
}, (table) => [
  uniqueIndex("event_lead_applications_event_user_idx").on(table.eventId, table.userId),
]);
export type EventLeadApplication = typeof eventLeadApplications.$inferSelect;

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

// What a "going" attendee is volunteering to bring — cash, gear, whatever the
// event needs. Visible to every other attendee (that's the point: seeing
// "Tino — a first-aid kit" before you show up beats finding out on the day).
// One row per pledge, not one-per-user, so someone bringing two different
// things doesn't have to cram it into a single line.
export const eventResourcePledges = pgTable("event_resource_pledges", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => events.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  description: text("description").notNull(),
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

// ── Twin Proximity Alerts ──────────────────────────────────────────────
// twin_alert_log is event-bound (NOT NULL eventId, unique on user+event), so
// proximity gets its own ledger. This IS the rate limiter — no localStorage.

export const proximityAlerts = pgTable("proximity_alerts", {
  id: varchar("id").primaryKey(), // pa_xxxx
  recipientId: varchar("recipient_id").notNull().references(() => users.id),
  subjectId: varchar("subject_id").references(() => users.id), // dedupe/rate-limit only; NEVER in a free payload; nulled after 90d
  placeId: integer("place_id").notNull().references(() => places.id),
  placeType: text("place_type").notNull(),
  distanceBucket: text("distance_bucket").notNull(), // same_place | few_hundred_m | this_campus | this_area
  tierAtSend: text("tier_at_send").notNull(),
  identityReleased: boolean("identity_released").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  seenAt: timestamp("seen_at"),
  dismissedAt: timestamp("dismissed_at"),
  expiresAt: timestamp("expires_at").notNull(), // createdAt + 24h
}, (t) => [
  uniqueIndex("proximity_alerts_pair_place_idx").on(t.recipientId, t.subjectId, t.placeId),
  index("proximity_alerts_recipient_sent_idx").on(t.recipientId, t.createdAt),
]);

// "Invisible at this place" — checked in the candidate query, effective on the
// next evaluation (seconds), not the next poll.
export const placeInvisibility = pgTable("place_invisibility", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  placeId: integer("place_id").notNull().references(() => places.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  uniqueIndex("place_invisibility_user_place_idx").on(t.userId, t.placeId),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
});

// Push tokens for the Android/iOS app (Firebase Cloud Messaging). Web push
// lives in push_subscriptions above; server/push.ts sends to both.
export const deviceTokens = pgTable("device_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull(), // android | ios
  createdAt: timestamp("created_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
});

export const DISTANCE_BUCKETS = ["same_place", "few_hundred_m", "this_campus", "this_area"] as const;
export const proximityModeEnum = z.enum(["off", "campus_work", "everywhere"]);
export const proximityFloorEnum = z.enum(["sometimes", "strong", "rare"]);
export const updateProximitySettingsSchema = z.object({
  proximityMode: proximityModeEnum,
  proximityFloor: proximityFloorEnum,
  proximityQuietStart: z.number().int().min(0).max(23),
  proximityQuietEnd: z.number().int().min(0).max(23),
}).partial();
export const locationReportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type ProximityAlert = typeof proximityAlerts.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type UpdateProximitySettings = z.infer<typeof updateProximitySettingsSchema>;

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
export const eventGenderPolicyEnum = z.enum(["mixed", "men_only", "women_only", "quota"]);

export const insertEventSchema = createInsertSchema(events, {
  seatModel: seatModelEnum,
  status: eventStatusEnum,
  genderPolicy: eventGenderPolicyEnum,
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
  genderPolicy: eventGenderPolicyEnum,
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
// hostUserId, createdByUserId, status (published immediately, except a
// private residence -> pending_review for the host video/ID check), and
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
      .max(MAX_CONTRIBUTION, `Contributions over $${MAX_CONTRIBUTION} aren't allowed on Destira.`)
      .nullable()
      .optional(),
    contributionNote: z.string().trim().max(200).optional().or(z.literal("")),
    contactPhone: z.string().trim().max(40).optional().or(z.literal("")),
    contactWhatsapp: z.string().trim().max(40).optional().or(z.literal("")),
    genderPolicy: eventGenderPolicyEnum.default("mixed"),
    menSlots: z.coerce.number().int().min(1).max(500).nullable().optional(),
    womenSlots: z.coerce.number().int().min(1).max(500).nullable().optional(),
  })
  .refine((d) => d.seatModel === "open" || (d.seatCount != null && d.seatCount > 0), {
    message: "Set how many seats",
    path: ["seatCount"],
  })
  .refine((d) => d.genderPolicy !== "quota" || (d.menSlots != null && d.womenSlots != null), {
    message: "Set how many men and women",
    path: ["menSlots"],
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

export const insertGroupGameSchema = createInsertSchema(groupGames).omit({
  id: true,
  createdAt: true,
  revealedAt: true,
});

export const insertGroupGameResponseSchema = createInsertSchema(groupGameResponses).omit({
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
export type GroupGame = typeof groupGames.$inferSelect;
export type GroupGameResponse = typeof groupGameResponses.$inferSelect;
export type GroupGameParticipant = typeof groupGameParticipants.$inferSelect;
export type GroupGameMessage = typeof groupGameMessages.$inferSelect;
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
export type EventResourcePledge = typeof eventResourcePledges.$inferSelect;
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

// ── Admin console ──────────────────────────────────────────────────────
// No platform admin role exists anywhere else. A `users` row is never itself
// admin — admin-ness is an active (revokedAt IS NULL, suspendedAt IS NULL)
// row here. The FIRST admin (the owner) is seeded by scripts/seed-admin.ts
// only — there is still no self-promotion path. Every other grant comes
// through server/admin/team.ts's invite+accept flow or an owner's role
// change, both gated and audited; see shared/admin.ts for the role
// vocabulary and server/admin/ for enforcement.
export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  role: text("role").notNull(), // read_only | support | admin | owner — shared/admin.ts
  totpSecret: text("totp_secret"), // AES-256-GCM encrypted, never plaintext — server/admin/crypto.ts
  totpEnabledAt: timestamp("totp_enabled_at"),
  lastSignInAt: timestamp("last_sign_in_at"),
  grantedBy: varchar("granted_by").references(() => users.id),
  grantedAt: timestamp("granted_at").defaultNow(),
  // Suspend: immediate, reversible, sessions killed, row kept as-is.
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by").references(() => users.id),
  suspendedReason: text("suspended_reason"),
  // Remove: ends the grant. Distinct from suspend so the two never collapse
  // into one ambiguous "revoked" flag — a removed admin's row (and every
  // adminAuditLog row referencing them) is never deleted.
  revokedAt: timestamp("revoked_at"), // soft-revoke only — no delete path, history is kept
  revokedBy: varchar("revoked_by").references(() => users.id),
  revokedReason: text("revoked_reason"),
});

// A single-use, time-limited grant of admin access, sent by email. The raw
// token is never stored — only its SHA-256 (server/admin/crypto.ts) — so a
// DB dump alone can't mint a working invite link, same posture as TOTP
// secrets. accept-invite (pre-auth, like login) consumes it.
export const adminInvites = pgTable("admin_invites", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by").references(() => users.id),
});

// One row per issued recovery code, hashed the same way as invite tokens.
// Consumed (usedAt set) at most once each; regenerating deletes the unused
// ones and issues a fresh batch, shown exactly once in the response.
export const adminRecoveryCodes = pgTable(
  "admin_recovery_codes",
  {
    id: serial("id").primaryKey(),
    adminUserId: varchar("admin_user_id").notNull().references(() => users.id),
    codeHash: text("code_hash").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow(),
    usedAt: timestamp("used_at"),
  },
  (t) => [index("admin_recovery_codes_admin_idx").on(t.adminUserId)],
);

// Append-only. Written BEFORE the read or write it covers, not after. No
// update/delete route exists for this table, for any role, including owner.
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: serial("id").primaryKey(),
    adminUserId: varchar("admin_user_id").notNull().references(() => users.id),
    action: text("action").notNull(), // e.g. "report.view", "report.action", "payment.lookup", "export.csv"
    targetType: text("target_type"), // "user" | "report" | "payment" | "feedback" | null
    targetId: text("target_id"),
    details: jsonb("details"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("admin_audit_log_admin_created_idx").on(t.adminUserId, t.createdAt)],
);

export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    reporterId: varchar("reporter_id").notNull().references(() => users.id),
    subjectId: varchar("subject_id").notNull().references(() => users.id),
    category: text("category").notNull(), // shared/admin.ts REPORT_CATEGORIES
    freeText: text("free_text"),
    // Cited evidence — ids only, never copied content: [{type:"message",id:"123"}, ...]
    evidence: jsonb("evidence").$type<Array<{ type: string; id: string }>>(),
    status: text("status").notNull().default("open"), // shared/admin.ts REPORT_STATUSES
    assignee: varchar("assignee").references(() => users.id),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [
    index("reports_status_created_idx").on(t.status, t.createdAt),
    index("reports_subject_idx").on(t.subjectId),
  ],
);

// One append-only row per action. targetUserId is who it's against; reportId
// is nullable because an action can be proactive, not only report-triggered.
// This IS the moderation history — never overwritten, never deleted.
export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id").references(() => reports.id),
    targetUserId: varchar("target_user_id").notNull().references(() => users.id),
    type: text("type").notNull(), // shared/admin.ts MODERATION_ACTION_TYPES
    reason: text("reason").notNull(),
    adminUserId: varchar("admin_user_id").notNull().references(() => users.id),
    // Which cited evidence item remove_photo/remove_message/unpublish_event
    // actually acted on — null for account-level actions (warn/suspend/ban)
    // and dismiss_report.
    evidenceRef: jsonb("evidence_ref").$type<{ type: string; id: string } | null>(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("moderation_actions_target_idx").on(t.targetUserId, t.createdAt)],
);

export const feedback = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull().references(() => users.id),
    category: text("category").notNull(), // shared/admin.ts FEEDBACK_CATEGORIES
    freeText: text("free_text").notNull(),
    contactBackConsent: boolean("contact_back_consent").notNull().default(false),
    appVersion: text("app_version"),
    platform: text("platform"),
    status: text("status").notNull().default("open"), // shared/admin.ts FEEDBACK_STATUSES
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("feedback_status_created_idx").on(t.status, t.createdAt)],
);

// ── Admin console — Phase 3/4 groundwork (schema now, wired later) ───────
export const emailAlertConfig = pgTable("email_alert_config", {
  id: serial("id").primaryKey(),
  alertType: text("alert_type").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  threshold: text("threshold"), // interpretation is per alertType
  recipientEmail: text("recipient_email").notNull(),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Member lifecycle email (welcome, finish-profile, likes, digest, win-back) ──
// One row per email a MEMBER was sent (or would have been sent, in log-only
// mode). dedupeKey makes every kind send at most once per its own window,
// e.g. "welcome", "win_back:7", "digest:2026-W41".
export const memberEmailLog = pgTable(
  "member_email_log",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    status: text("status").notNull(), // sent | failed | logged (not delivered: log-only/test mode)
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("member_email_log_user_dedupe_idx").on(t.userId, t.dedupeKey),
    index("member_email_log_created_idx").on(t.createdAt),
  ],
);
export type MemberEmailLog = typeof memberEmailLog.$inferSelect;

// Small key/value store for platform switches an admin flips at runtime
// (e.g. member email mode). Not for secrets.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by"),
});

// First-day checklist reward: one row once a member has claimed it.
export const firstDayRewards = pgTable("first_day_rewards", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  claimedAt: timestamp("claimed_at").defaultNow(),
});

// "Tonight's three": one row per member per Harare day, written the first
// time that day's picks are asked for (or by the 19:00 push sweep), so the
// three never reshuffle after the member starts acting on them.
export const dailyPicks = pgTable("daily_picks", {
  userId: varchar("user_id").notNull().references(() => users.id),
  pickDate: date("pick_date").notNull(),
  picks: jsonb("picks").$type<{ userId: string; reasons: string[] }[]>().notNull(),
  notifiedAt: timestamp("notified_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [uniqueIndex("daily_picks_user_date_idx").on(t.userId, t.pickDate)]);

export const emailLog = pgTable("email_log", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  recipient: text("recipient").notNull(),
  status: text("status").notNull(), // sent | failed
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  idempotencyKey: varchar("idempotency_key").unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Generic daily rollup: one row per (date, metricKey). Cheap to extend —
// see docs/admin-metrics.md (Phase 3) for the key namespace.
export const metricDaily = pgTable(
  "metric_daily",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    metricKey: text("metric_key").notNull(),
    value: decimal("value", { precision: 18, scale: 4 }).notNull(),
    computedAt: timestamp("computed_at").defaultNow(),
  },
  (t) => [uniqueIndex("metric_daily_date_key_idx").on(t.date, t.metricKey)],
);

export const llmCallLog = pgTable(
  "llm_call_log",
  {
    id: serial("id").primaryKey(),
    callType: text("call_type").notNull(), // twin_chat | interview | memory_extraction | disclosure_classify | disclosure_judge | ...
    userId: varchar("user_id").references(() => users.id),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: decimal("cost_usd", { precision: 10, scale: 6 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("llm_call_log_type_created_idx").on(t.callType, t.createdAt)],
);

// One row per (user, calendar day) they made an authenticated request. This
// is the whole activity signal DAU/WAU/MAU, retention and the funnel's
// timing (D1 activation, D7/D30 retention) are computed from — the app had
// no generic "last active" signal before this. Written by trackActivity()
// middleware (server/admin/activity.ts): an idempotent insert, at most one
// per user per day regardless of request volume.
export const userActivityDaily = pgTable(
  "user_activity_daily",
  {
    userId: varchar("user_id").notNull().references(() => users.id),
    date: date("date").notNull(),
  },
  (t) => [uniqueIndex("user_activity_daily_user_date_idx").on(t.userId, t.date)],
);

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminAuditLogEntry = typeof adminAuditLog.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type ModerationAction = typeof moderationActions.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;

export type CreateProfileRequest = InsertProfile;
export type UpdateProfileRequest = Partial<InsertProfile>;


// Selfie verification (docs/destira-3-upgrade-prompt.md Part A). A member
// takes a live selfie copying a pose; a person on the team compares it with
// their profile photos and approves or rejects. The selfie itself is deleted
// once it's been checked (selfieKey goes null); the decision is kept.
export const verificationRequests = pgTable(
  "verification_requests",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** shared/verification.ts POSES key; null for requests from old app builds. */
    pose: text("pose"),
    /** Object storage key of the selfie while it waits; null once reviewed. */
    selfieKey: text("selfie_key"),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    /** Shown to the member when rejected. */
    rejectReason: text("reject_reason"),
    reviewedBy: varchar("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("verification_requests_status_idx").on(t.status, t.createdAt),
    index("verification_requests_user_idx").on(t.userId, t.createdAt),
  ],
);
export type VerificationRequest = typeof verificationRequests.$inferSelect;


// Scam defence (docs/destira-3-upgrade-prompt.md Part B, server/safety/).
// A signal about a member for the console's Risk queue. Never a verdict:
// a person clears it, holds the account, or bans. The snippet is only the
// matched words with a little context, and is wiped when the flag is closed.
export const riskFlags = pgTable(
  "risk_flags",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // shared/safety.ts RISK_LABEL keys
    severity: text("severity").notNull(), // low | medium | high
    /** Where it was seen: dm | group | story_comment | profile | photo | like | device | system */
    source: text("source").notNull(),
    refId: text("ref_id"),
    /** The other member involved (message recipient, the other account with the same photo...). */
    otherUserId: varchar("other_user_id"),
    snippet: text("snippet"),
    status: text("status").notNull().default("open"), // open | cleared | actioned
    reviewedBy: varchar("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("risk_flags_status_idx").on(t.status, t.createdAt),
    index("risk_flags_user_idx").on(t.userId, t.createdAt),
  ],
);
export type RiskFlag = typeof riskFlags.$inferSelect;

// Which phones and browsers each account uses (a random id the app or the
// browser keeps), so a banned member can't simply sign up again on the same
// phone. Only ever compared with banned accounts, never shown to members.
export const accountDevices = pgTable(
  "account_devices",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    deviceId: varchar("device_id", { length: 64 }).notNull(),
    firstSeenAt: timestamp("first_seen_at").defaultNow(),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
  },
  (t) => [uniqueIndex("account_devices_user_device_idx").on(t.userId, t.deviceId), index("account_devices_device_idx").on(t.deviceId)],
);

// A small fingerprint of each profile photo (difference hash), to spot the
// same picture on two accounts: stolen photos, or one person running several
// profiles.
export const photoHashes = pgTable(
  "photo_hashes",
  {
    photoId: integer("photo_id").primaryKey(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    hash: varchar("hash", { length: 16 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("photo_hashes_user_idx").on(t.userId)],
);
