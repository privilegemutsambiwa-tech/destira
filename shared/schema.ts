import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, decimal } from "drizzle-orm/pg-core";
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
  aboutSummary: text("about_summary"),
  personalitySummary: text("personality_summary"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userPhotos = pgTable("user_photos", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  photoUrl: text("photo_url").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  isMainProfilePhoto: boolean("is_main_profile_photo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  categoryTags: text("category_tags").array(),
  privacyMode: text("privacy_mode").notNull().default("open"),
  mediaEnabled: boolean("media_enabled").default(true),
  stickersEnabled: boolean("stickers_enabled").default(true),
  postingPermission: text("posting_permission").notNull().default("everyone"),
  inviteDirectJoinEnabled: boolean("invite_direct_join_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  nickname: text("nickname"),
  role: text("role").notNull().default("member"),
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
  isDeletedByAdmin: boolean("is_deleted_by_admin").default(false),
  originalContent: text("original_content"),
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

export const insertProfileSchema = createInsertSchema(profiles).omit({
  id: true,
  userId: true,
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

export type CreateProfileRequest = InsertProfile;
export type UpdateProfileRequest = Partial<InsertProfile>;
