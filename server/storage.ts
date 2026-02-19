import { db } from "./db";
import {
  profiles, matches, interviews, groups, groupMembers, directMessages, groupMessages,
  userPhotos, groupJoinRequests, groupInviteLinks, groupModerationLogs,
  polls, pollOptions, pollVotes, messageReactions, starredMessages,
  twinMemory, twinNotifications, subscriptions, payments, entitlements,
  twinProfilesStructured, twinMemoryFacts, twinMemorySummary,
  questions, userAnswers, questionSchedule, auditLogs,
  type Profile, type InsertProfile, type UpdateProfileRequest,
  type Match, type Interview, type Group, type GroupMember, type DirectMessage, type GroupMessage,
  type GroupJoinRequest, type GroupInviteLink, type GroupModerationLog,
  type Poll, type PollOption, type PollVote, type MessageReaction, type StarredMessage,
  type UserPhoto, type TwinMemoryEntry, type TwinNotification,
  type Subscription, type Payment, type Entitlement,
  type TwinProfileStructured, type TwinMemoryFact, type TwinMemorySummaryEntry,
  type Question, type UserAnswer, type QuestionScheduleEntry, type AuditLog
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, or, and, ne, asc, desc, ilike, sql, count } from "drizzle-orm";

export interface IStorage {
  getProfile(userId: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile & { userId: string }): Promise<Profile>;
  updateProfile(userId: string, updates: Partial<InsertProfile>): Promise<Profile>;
  getDiscoverableProfiles(excludeUserId: string): Promise<any[]>;
  getProfileWithUser(userId: string): Promise<any>;

  createMatch(user1Id: string, user2Id: string): Promise<Match>;
  getMatches(userId: string): Promise<Match[]>;
  getMatch(id: number): Promise<Match | undefined>;
  updateMatchStatus(id: number, status: string): Promise<Match>;
  getMatchBetweenUsers(user1Id: string, user2Id: string): Promise<Match | undefined>;
  getMatchesWithProfiles(userId: string): Promise<any[]>;
  softDeleteChat(matchId: number, userId: string): Promise<Match>;
  unmatch(matchId: number): Promise<Match>;

  createInterview(requesterId: string, targetId: string): Promise<Interview>;
  getInterviews(userId: string): Promise<Interview[]>;
  getInterview(id: number): Promise<Interview | undefined>;
  updateInterviewTranscript(id: number, transcript: string): Promise<Interview>;
  updateInterviewStatus(id: number, status: string): Promise<Interview>;
  getInterviewsWithProfiles(userId: string): Promise<any[]>;

  getGroups(): Promise<Group[]>;
  getGroup(id: number): Promise<Group | undefined>;
  createGroup(name: string, description: string, type: string): Promise<Group>;
  createGroupFull(data: { name: string; description: string; type: string; ownerId: string; iconUrl?: string; categoryTags?: string[]; privacyMode?: string; mediaEnabled?: boolean; stickersEnabled?: boolean; postingPermission?: string; inviteDirectJoinEnabled?: boolean }): Promise<Group>;
  updateGroup(id: number, updates: Partial<Group>): Promise<Group>;
  deleteGroup(id: number): Promise<void>;
  searchGroups(query: string): Promise<Group[]>;
  joinGroup(groupId: number, userId: string, nickname: string): Promise<GroupMember>;
  getGroupMembers(groupId: number): Promise<GroupMember[]>;
  getGroupMember(groupId: number, userId: string): Promise<GroupMember | undefined>;
  isGroupMember(groupId: number, userId: string): Promise<boolean>;
  updateGroupMemberRole(groupId: number, userId: string, role: string): Promise<GroupMember>;
  removeGroupMember(groupId: number, userId: string): Promise<void>;
  getGroupMessages(groupId: number, limit?: number): Promise<GroupMessage[]>;
  getGroupMessage(messageId: number): Promise<GroupMessage | undefined>;
  sendGroupMessage(groupId: number, userId: string, nickname: string, content: string, opts?: { contentType?: string; mediaUrl?: string; replyToMessageId?: number }): Promise<GroupMessage>;
  deleteGroupMessage(messageId: number): Promise<GroupMessage>;
  deleteMessageForEveryone(messageId: number): Promise<GroupMessage>;
  createJoinRequest(groupId: number, userId: string): Promise<GroupJoinRequest>;
  getJoinRequests(groupId: number): Promise<GroupJoinRequest[]>;
  processJoinRequest(id: number, processedBy: string, status: string): Promise<GroupJoinRequest>;
  createInviteLink(groupId: number, createdBy: string, token: string, expiresAt?: Date): Promise<GroupInviteLink>;
  getInviteLink(token: string): Promise<GroupInviteLink | undefined>;
  revokeInviteLink(id: number): Promise<void>;
  getGroupInviteLinks(groupId: number): Promise<GroupInviteLink[]>;
  createModerationLog(data: { groupId: number; messageId?: number; userId: string; action: string; reason?: string; moderatedBy?: string }): Promise<GroupModerationLog>;

  createPoll(groupId: number, createdBy: string, question: string, options: string[], allowMultiple: boolean): Promise<{ poll: Poll; options: PollOption[]; message: GroupMessage }>;
  getPoll(pollId: number): Promise<{ poll: Poll; options: PollOption[]; votes: PollVote[] } | undefined>;
  votePoll(pollId: number, optionId: number, userId: string): Promise<PollVote>;
  removePollVote(pollId: number, optionId: number, userId: string): Promise<void>;
  getPollByMessageId(messageId: number): Promise<{ poll: Poll; options: PollOption[]; votes: PollVote[] } | undefined>;

  addReaction(messageId: number, userId: string, reaction: string): Promise<MessageReaction>;
  removeReaction(messageId: number, userId: string, reaction: string): Promise<void>;
  getReactions(messageId: number): Promise<MessageReaction[]>;
  getReactionsForMessages(messageIds: number[]): Promise<MessageReaction[]>;

  getMediaMessages(groupId: number): Promise<GroupMessage[]>;

  getDirectMessages(matchId: number, limit?: number): Promise<DirectMessage[]>;
  sendDirectMessage(matchId: number, senderId: string, content: string): Promise<DirectMessage>;

  getUserPhotos(userId: string): Promise<UserPhoto[]>;
  addUserPhoto(userId: string, photoUrl: string, orderIndex: number, isMain?: boolean): Promise<UserPhoto>;
  deleteUserPhoto(id: number): Promise<void>;
  reorderUserPhotos(userId: string, photoIds: number[]): Promise<void>;

  addTwinMemory(userId: string, message: string, role: string, useForTraining?: boolean): Promise<TwinMemoryEntry>;
  getTwinMemory(userId: string, limit?: number): Promise<TwinMemoryEntry[]>;
  updateTwinTrainingOptOut(userId: string, useForTraining: boolean): Promise<void>;

  createNotification(userId: string, type: string, title: string, body: string): Promise<TwinNotification>;
  getNotifications(userId: string): Promise<TwinNotification[]>;
  markNotificationRead(id: number): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  createSubscription(userId: string, tier: string, stripeSubId?: string): Promise<Subscription>;
  getSubscription(userId: string): Promise<Subscription | undefined>;
  updateSubscription(id: number, updates: Partial<Subscription>): Promise<Subscription>;
  cancelSubscription(id: number): Promise<Subscription>;

  createPayment(userId: string, amount: number, currency: string, stripeChargeId?: string, subscriptionId?: number): Promise<Payment>;
  getPayments(userId: string): Promise<Payment[]>;

  getEntitlements(userId: string): Promise<Entitlement[]>;
  addEntitlement(userId: string, type: string, quantity: number, expiresAt?: Date): Promise<Entitlement>;
  useEntitlement(userId: string, type: string): Promise<boolean>;

  starMessage(messageId: number, userId: string, groupId: number): Promise<StarredMessage>;
  unstarMessage(messageId: number, userId: string): Promise<void>;
  getStarredMessages(groupId: number, userId: string): Promise<any[]>;
  isMessageStarred(messageId: number, userId: string): Promise<boolean>;

  getProfileCompletion(userId: string): Promise<{ score: number; tasks: { key: string; label: string; benefit: string; completed: boolean; weight: number }[] }>;
  updateProfileCompletionScore(userId: string, score: number): Promise<void>;

  getTwinProfileStructured(userId: string): Promise<TwinProfileStructured | undefined>;
  upsertTwinProfileStructured(userId: string, data: Partial<TwinProfileStructured>): Promise<TwinProfileStructured>;

  addTwinMemoryFact(userId: string, factText: string, source?: string): Promise<TwinMemoryFact>;
  getTwinMemoryFacts(userId: string, limit?: number): Promise<TwinMemoryFact[]>;
  clearExpiredMemoryFacts(): Promise<void>;

  upsertTwinMemorySummary(userId: string, summaryText: string): Promise<TwinMemorySummaryEntry>;
  getTwinMemorySummary(userId: string): Promise<TwinMemorySummaryEntry | undefined>;

  getQuestions(): Promise<Question[]>;
  getQuestion(id: number): Promise<Question | undefined>;
  createQuestion(data: { text: string; category: string; answerType?: string; options?: any; isOnboardingQuestion?: boolean; weight?: number; orderIndex?: number }): Promise<Question>;
  getNextQuestion(userId: string): Promise<Question | undefined>;

  submitAnswer(userId: string, questionId: number, answerText?: string, selectedOptions?: any, ratingValue?: number, isPrivate?: boolean): Promise<UserAnswer>;
  getUserAnswers(userId: string): Promise<UserAnswer[]>;
  getUserAnswer(userId: string, questionId: number): Promise<UserAnswer | undefined>;

  recordQuestionAsked(userId: string, questionId: number): Promise<QuestionScheduleEntry>;
  skipQuestion(userId: string, questionId: number): Promise<QuestionScheduleEntry>;

  createAuditLog(userId: string | null, eventType: string, details?: any): Promise<AuditLog>;
  getAuditLogs(userId?: string, limit?: number): Promise<AuditLog[]>;

  seedDemoData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getProfile(userId: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
    return profile;
  }

  async createProfile(profile: InsertProfile & { userId: string }): Promise<Profile> {
    const [newProfile] = await db.insert(profiles).values(profile).returning();
    return newProfile;
  }

  async updateProfile(userId: string, updates: Partial<InsertProfile>): Promise<Profile> {
    const [updated] = await db.update(profiles)
      .set(updates)
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async getDiscoverableProfiles(excludeUserId: string): Promise<any[]> {
    const result = await db
      .select({
        id: profiles.id,
        userId: profiles.userId,
        displayName: profiles.displayName,
        bio: profiles.bio,
        age: profiles.age,
        gender: profiles.gender,
        location: profiles.location,
        personalityProfile: profiles.personalityProfile,
        twinPersona: profiles.twinPersona,
        onboardingCompleted: profiles.onboardingCompleted,
        isPublic: profiles.isPublic,
        createdAt: profiles.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(
        and(
          ne(profiles.userId, excludeUserId),
          eq(profiles.onboardingCompleted, true),
          eq(profiles.isPublic, true)
        )
      );
    return result;
  }

  async getProfileWithUser(userId: string): Promise<any> {
    const [result] = await db
      .select({
        id: profiles.id,
        userId: profiles.userId,
        displayName: profiles.displayName,
        bio: profiles.bio,
        age: profiles.age,
        gender: profiles.gender,
        location: profiles.location,
        personalityProfile: profiles.personalityProfile,
        twinPersona: profiles.twinPersona,
        onboardingCompleted: profiles.onboardingCompleted,
        isPublic: profiles.isPublic,
        createdAt: profiles.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(eq(profiles.userId, userId));
    return result;
  }

  async createMatch(user1Id: string, user2Id: string): Promise<Match> {
    const [match] = await db.insert(matches).values({
      user1Id,
      user2Id,
      status: "pending"
    }).returning();
    return match;
  }

  async getMatches(userId: string): Promise<Match[]> {
    return db.select().from(matches).where(
      or(eq(matches.user1Id, userId), eq(matches.user2Id, userId))
    );
  }

  async getMatch(id: number): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match;
  }

  async updateMatchStatus(id: number, status: string): Promise<Match> {
    const [updated] = await db.update(matches).set({ status }).where(eq(matches.id, id)).returning();
    return updated;
  }

  async getMatchBetweenUsers(user1Id: string, user2Id: string): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(
      or(
        and(eq(matches.user1Id, user1Id), eq(matches.user2Id, user2Id)),
        and(eq(matches.user1Id, user2Id), eq(matches.user2Id, user1Id))
      )
    );
    return match;
  }

  async getMatchesWithProfiles(userId: string): Promise<any[]> {
    const userMatches = await this.getMatches(userId);
    const result = [];
    for (const match of userMatches) {
      const isUser1 = match.user1Id === userId;
      if (isUser1 && match.user1DeletedChat) continue;
      if (!isUser1 && match.user2DeletedChat) continue;
      const otherUserId = isUser1 ? match.user2Id : match.user1Id;
      const otherProfile = await this.getProfileWithUser(otherUserId);
      result.push({
        ...match,
        otherProfile: otherProfile || null,
        isRequester: isUser1,
      });
    }
    return result;
  }

  async softDeleteChat(matchId: number, userId: string): Promise<Match> {
    const match = await this.getMatch(matchId);
    if (!match) throw new Error("Match not found");
    const isUser1 = match.user1Id === userId;
    const [updated] = await db.update(matches)
      .set(isUser1 ? { user1DeletedChat: true } : { user2DeletedChat: true })
      .where(eq(matches.id, matchId))
      .returning();
    return updated;
  }

  async unmatch(matchId: number): Promise<Match> {
    const [updated] = await db.update(matches)
      .set({ status: "unmatched" })
      .where(eq(matches.id, matchId))
      .returning();
    return updated;
  }

  async createInterview(requesterId: string, targetId: string): Promise<Interview> {
    const [interview] = await db.insert(interviews).values({
      requesterId,
      targetId,
      status: "in_progress"
    }).returning();
    return interview;
  }

  async getInterviews(userId: string): Promise<Interview[]> {
    return db.select().from(interviews).where(
      or(eq(interviews.requesterId, userId), eq(interviews.targetId, userId))
    );
  }

  async getInterview(id: number): Promise<Interview | undefined> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, id));
    return interview;
  }

  async updateInterviewTranscript(id: number, transcript: string): Promise<Interview> {
    const [updated] = await db.update(interviews)
      .set({ transcript })
      .where(eq(interviews.id, id))
      .returning();
    return updated;
  }

  async updateInterviewStatus(id: number, status: string): Promise<Interview> {
    const [updated] = await db.update(interviews)
      .set({ status })
      .where(eq(interviews.id, id))
      .returning();
    return updated;
  }

  async getInterviewsWithProfiles(userId: string): Promise<any[]> {
    const userInterviews = await this.getInterviews(userId);
    const result = [];
    for (const interview of userInterviews) {
      const targetProfile = await this.getProfileWithUser(interview.targetId);
      result.push({
        ...interview,
        targetProfile: targetProfile || null,
      });
    }
    return result;
  }

  async getGroups(): Promise<Group[]> {
    return db.select().from(groups);
  }

  async getGroup(id: number): Promise<Group | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    return group;
  }

  async createGroup(name: string, description: string, type: string): Promise<Group> {
    const [group] = await db.insert(groups).values({ name, description, type }).returning();
    return group;
  }

  async createGroupFull(data: { name: string; description: string; type: string; ownerId: string; iconUrl?: string; categoryTags?: string[]; privacyMode?: string; mediaEnabled?: boolean; stickersEnabled?: boolean; postingPermission?: string; inviteDirectJoinEnabled?: boolean }): Promise<Group> {
    const [group] = await db.insert(groups).values(data).returning();
    return group;
  }

  async updateGroup(id: number, updates: Partial<Group>): Promise<Group> {
    const [updated] = await db.update(groups)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(groups.id, id))
      .returning();
    return updated;
  }

  async deleteGroup(id: number): Promise<void> {
    await db.delete(groupMembers).where(eq(groupMembers.groupId, id));
    await db.delete(groupMessages).where(eq(groupMessages.groupId, id));
    await db.delete(groupJoinRequests).where(eq(groupJoinRequests.groupId, id));
    await db.delete(groupInviteLinks).where(eq(groupInviteLinks.groupId, id));
    await db.delete(groupModerationLogs).where(eq(groupModerationLogs.groupId, id));
    await db.delete(groups).where(eq(groups.id, id));
  }

  async searchGroups(query: string): Promise<Group[]> {
    return db.select().from(groups).where(
      or(
        ilike(groups.name, `%${query}%`),
        ilike(groups.description, `%${query}%`)
      )
    );
  }

  async joinGroup(groupId: number, userId: string, nickname: string): Promise<GroupMember> {
    const [member] = await db.insert(groupMembers).values({ groupId, userId, nickname }).returning();
    return member;
  }

  async getGroupMembers(groupId: number): Promise<GroupMember[]> {
    return db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
  }

  async getGroupMember(groupId: number, userId: string): Promise<GroupMember | undefined> {
    const [member] = await db.select().from(groupMembers).where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))
    );
    return member;
  }

  async isGroupMember(groupId: number, userId: string): Promise<boolean> {
    const [member] = await db.select().from(groupMembers).where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))
    );
    return !!member;
  }

  async updateGroupMemberRole(groupId: number, userId: string, role: string): Promise<GroupMember> {
    const [updated] = await db.update(groupMembers)
      .set({ role })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .returning();
    return updated;
  }

  async removeGroupMember(groupId: number, userId: string): Promise<void> {
    await db.delete(groupMembers).where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))
    );
  }

  async getGroupMessages(groupId: number, limit: number = 50): Promise<GroupMessage[]> {
    return db.select().from(groupMessages)
      .where(eq(groupMessages.groupId, groupId))
      .orderBy(asc(groupMessages.createdAt))
      .limit(limit);
  }

  async getGroupMessage(messageId: number): Promise<GroupMessage | undefined> {
    const [msg] = await db.select().from(groupMessages).where(eq(groupMessages.id, messageId));
    return msg;
  }

  async sendGroupMessage(groupId: number, userId: string, nickname: string, content: string, opts?: { contentType?: string; mediaUrl?: string; replyToMessageId?: number }): Promise<GroupMessage> {
    const values: any = { groupId, userId, nickname, content };
    if (opts?.contentType) values.contentType = opts.contentType;
    if (opts?.mediaUrl) values.mediaUrl = opts.mediaUrl;
    if (opts?.replyToMessageId) values.replyToMessageId = opts.replyToMessageId;
    const [msg] = await db.insert(groupMessages).values(values).returning();
    return msg;
  }

  async deleteGroupMessage(messageId: number): Promise<GroupMessage> {
    const [msg] = await db.select().from(groupMessages).where(eq(groupMessages.id, messageId));
    const [updated] = await db.update(groupMessages)
      .set({ isDeletedByAdmin: true, originalContent: msg.content, content: "[Message deleted by admin]" })
      .where(eq(groupMessages.id, messageId))
      .returning();
    return updated;
  }

  async deleteMessageForEveryone(messageId: number): Promise<GroupMessage> {
    const [msg] = await db.select().from(groupMessages).where(eq(groupMessages.id, messageId));
    const [updated] = await db.update(groupMessages)
      .set({ deletedForEveryone: true, originalContent: msg.content, content: "[Message deleted]" })
      .where(eq(groupMessages.id, messageId))
      .returning();
    return updated;
  }

  async createJoinRequest(groupId: number, userId: string): Promise<GroupJoinRequest> {
    const [request] = await db.insert(groupJoinRequests).values({ groupId, userId }).returning();
    return request;
  }

  async getJoinRequests(groupId: number): Promise<GroupJoinRequest[]> {
    return db.select().from(groupJoinRequests)
      .where(and(eq(groupJoinRequests.groupId, groupId), eq(groupJoinRequests.status, "pending")));
  }

  async processJoinRequest(id: number, processedBy: string, status: string): Promise<GroupJoinRequest> {
    const [updated] = await db.update(groupJoinRequests)
      .set({ status, processedBy, processedAt: new Date() })
      .where(eq(groupJoinRequests.id, id))
      .returning();
    return updated;
  }

  async createInviteLink(groupId: number, createdBy: string, token: string, expiresAt?: Date): Promise<GroupInviteLink> {
    const values: any = { groupId, createdBy, token };
    if (expiresAt) values.expiresAt = expiresAt;
    const [link] = await db.insert(groupInviteLinks).values(values).returning();
    return link;
  }

  async getInviteLink(token: string): Promise<GroupInviteLink | undefined> {
    const [link] = await db.select().from(groupInviteLinks).where(
      and(eq(groupInviteLinks.token, token), eq(groupInviteLinks.isActive, true))
    );
    return link;
  }

  async revokeInviteLink(id: number): Promise<void> {
    await db.update(groupInviteLinks).set({ isActive: false }).where(eq(groupInviteLinks.id, id));
  }

  async getGroupInviteLinks(groupId: number): Promise<GroupInviteLink[]> {
    return db.select().from(groupInviteLinks).where(eq(groupInviteLinks.groupId, groupId));
  }

  async createModerationLog(data: { groupId: number; messageId?: number; userId: string; action: string; reason?: string; moderatedBy?: string }): Promise<GroupModerationLog> {
    const [log] = await db.insert(groupModerationLogs).values(data).returning();
    return log;
  }

  async createPoll(groupId: number, createdBy: string, question: string, optionTexts: string[], allowMultiple: boolean): Promise<{ poll: Poll; options: PollOption[]; message: GroupMessage }> {
    const member = await this.getGroupMember(groupId, createdBy);
    const nickname = member?.nickname || "Anonymous";
    const [msg] = await db.insert(groupMessages).values({
      groupId, userId: createdBy, nickname, content: question, contentType: "poll"
    }).returning();
    const [poll] = await db.insert(polls).values({
      groupId, createdBy, question, allowMultiple, messageId: msg.id
    }).returning();
    const opts: PollOption[] = [];
    for (let i = 0; i < optionTexts.length; i++) {
      const [opt] = await db.insert(pollOptions).values({
        pollId: poll.id, text: optionTexts[i], orderIndex: i
      }).returning();
      opts.push(opt);
    }
    return { poll, options: opts, message: msg };
  }

  async getPoll(pollId: number): Promise<{ poll: Poll; options: PollOption[]; votes: PollVote[] } | undefined> {
    const [poll] = await db.select().from(polls).where(eq(polls.id, pollId));
    if (!poll) return undefined;
    const opts = await db.select().from(pollOptions).where(eq(pollOptions.pollId, pollId)).orderBy(asc(pollOptions.orderIndex));
    const votes = await db.select().from(pollVotes).where(eq(pollVotes.pollId, pollId));
    return { poll, options: opts, votes };
  }

  async votePoll(pollId: number, optionId: number, userId: string): Promise<PollVote> {
    const poll = await this.getPoll(pollId);
    if (poll && !poll.poll.allowMultiple) {
      await db.delete(pollVotes).where(
        and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, userId))
      );
    }
    const [vote] = await db.insert(pollVotes).values({ pollId, optionId, userId }).returning();
    return vote;
  }

  async removePollVote(pollId: number, optionId: number, userId: string): Promise<void> {
    await db.delete(pollVotes).where(
      and(eq(pollVotes.pollId, pollId), eq(pollVotes.optionId, optionId), eq(pollVotes.userId, userId))
    );
  }

  async getPollByMessageId(messageId: number): Promise<{ poll: Poll; options: PollOption[]; votes: PollVote[] } | undefined> {
    const [poll] = await db.select().from(polls).where(eq(polls.messageId, messageId));
    if (!poll) return undefined;
    return this.getPoll(poll.id);
  }

  async addReaction(messageId: number, userId: string, reaction: string): Promise<MessageReaction> {
    await db.delete(messageReactions).where(
      and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId), eq(messageReactions.reaction, reaction))
    );
    const [r] = await db.insert(messageReactions).values({ messageId, userId, reaction }).returning();
    return r;
  }

  async removeReaction(messageId: number, userId: string, reaction: string): Promise<void> {
    await db.delete(messageReactions).where(
      and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId), eq(messageReactions.reaction, reaction))
    );
  }

  async getReactions(messageId: number): Promise<MessageReaction[]> {
    return db.select().from(messageReactions).where(eq(messageReactions.messageId, messageId));
  }

  async getReactionsForMessages(messageIds: number[]): Promise<MessageReaction[]> {
    if (messageIds.length === 0) return [];
    return db.select().from(messageReactions).where(
      sql`${messageReactions.messageId} = ANY(${sql.raw(`ARRAY[${messageIds.join(',')}]`)})`
    );
  }

  async getMediaMessages(groupId: number): Promise<GroupMessage[]> {
    return db.select().from(groupMessages)
      .where(and(
        eq(groupMessages.groupId, groupId),
        sql`${groupMessages.contentType} IN ('image', 'video')`
      ))
      .orderBy(desc(groupMessages.createdAt));
  }

  async getDirectMessages(matchId: number, limit: number = 50): Promise<DirectMessage[]> {
    return db.select().from(directMessages)
      .where(eq(directMessages.matchId, matchId))
      .orderBy(asc(directMessages.createdAt))
      .limit(limit);
  }

  async sendDirectMessage(matchId: number, senderId: string, content: string): Promise<DirectMessage> {
    const [msg] = await db.insert(directMessages).values({ matchId, senderId, content }).returning();
    return msg;
  }

  async getUserPhotos(userId: string): Promise<UserPhoto[]> {
    return db.select().from(userPhotos)
      .where(eq(userPhotos.userId, userId))
      .orderBy(asc(userPhotos.orderIndex));
  }

  async addUserPhoto(userId: string, photoUrl: string, orderIndex: number, isMain: boolean = false): Promise<UserPhoto> {
    const [photo] = await db.insert(userPhotos).values({ userId, photoUrl, orderIndex, isMainProfilePhoto: isMain }).returning();
    return photo;
  }

  async deleteUserPhoto(id: number): Promise<void> {
    await db.delete(userPhotos).where(eq(userPhotos.id, id));
  }

  async reorderUserPhotos(userId: string, photoIds: number[]): Promise<void> {
    for (let i = 0; i < photoIds.length; i++) {
      await db.update(userPhotos)
        .set({ orderIndex: i })
        .where(and(eq(userPhotos.id, photoIds[i]), eq(userPhotos.userId, userId)));
    }
  }

  async addTwinMemory(userId: string, message: string, role: string, useForTraining: boolean = true): Promise<TwinMemoryEntry> {
    const [entry] = await db.insert(twinMemory).values({ userId, message, role, useForTraining }).returning();
    return entry;
  }

  async getTwinMemory(userId: string, limit: number = 100): Promise<TwinMemoryEntry[]> {
    return db.select().from(twinMemory)
      .where(eq(twinMemory.userId, userId))
      .orderBy(desc(twinMemory.createdAt))
      .limit(limit);
  }

  async updateTwinTrainingOptOut(userId: string, useForTraining: boolean): Promise<void> {
    await db.update(twinMemory)
      .set({ useForTraining })
      .where(eq(twinMemory.userId, userId));
  }

  async createNotification(userId: string, type: string, title: string, body: string): Promise<TwinNotification> {
    const [notif] = await db.insert(twinNotifications).values({ userId, type, title, body }).returning();
    return notif;
  }

  async getNotifications(userId: string): Promise<TwinNotification[]> {
    return db.select().from(twinNotifications)
      .where(eq(twinNotifications.userId, userId))
      .orderBy(desc(twinNotifications.createdAt));
  }

  async markNotificationRead(id: number): Promise<void> {
    await db.update(twinNotifications).set({ read: true }).where(eq(twinNotifications.id, id));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const [result] = await db.select({ value: count() }).from(twinNotifications)
      .where(and(eq(twinNotifications.userId, userId), eq(twinNotifications.read, false)));
    return result?.value ?? 0;
  }

  async createSubscription(userId: string, tier: string, stripeSubId?: string): Promise<Subscription> {
    const values: any = { userId, tier, status: "active" };
    if (stripeSubId) values.stripeSubscriptionId = stripeSubId;
    const [sub] = await db.insert(subscriptions).values(values).returning();
    return sub;
  }

  async getSubscription(userId: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return sub;
  }

  async updateSubscription(id: number, updates: Partial<Subscription>): Promise<Subscription> {
    const [updated] = await db.update(subscriptions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return updated;
  }

  async cancelSubscription(id: number): Promise<Subscription> {
    const [updated] = await db.update(subscriptions)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return updated;
  }

  async createPayment(userId: string, amount: number, currency: string, stripeChargeId?: string, subscriptionId?: number): Promise<Payment> {
    const values: any = { userId, amount, currency, status: "completed" };
    if (stripeChargeId) values.stripeChargeId = stripeChargeId;
    if (subscriptionId) values.subscriptionId = subscriptionId;
    const [payment] = await db.insert(payments).values(values).returning();
    return payment;
  }

  async getPayments(userId: string): Promise<Payment[]> {
    return db.select().from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));
  }

  async getEntitlements(userId: string): Promise<Entitlement[]> {
    return db.select().from(entitlements)
      .where(eq(entitlements.userId, userId));
  }

  async addEntitlement(userId: string, type: string, quantity: number, expiresAt?: Date): Promise<Entitlement> {
    const values: any = { userId, type, quantity };
    if (expiresAt) values.expiresAt = expiresAt;
    const [ent] = await db.insert(entitlements).values(values).returning();
    return ent;
  }

  async useEntitlement(userId: string, type: string): Promise<boolean> {
    const [ent] = await db.select().from(entitlements).where(
      and(eq(entitlements.userId, userId), eq(entitlements.type, type))
    );
    if (!ent || ent.quantity <= 0) return false;
    if (ent.expiresAt && new Date(ent.expiresAt) < new Date()) return false;
    await db.update(entitlements)
      .set({ quantity: ent.quantity - 1, updatedAt: new Date() })
      .where(eq(entitlements.id, ent.id));
    return true;
  }

  async seedDemoData(): Promise<void> {
    const existingGroups = await this.getGroups();
    if (existingGroups.length > 0) return;

    await this.createGroup("Morning Coffee", "For early risers who love a good brew and deep conversations.", "interest");
    await this.createGroup("Adventure Seekers", "Hikers, travelers, and adrenaline junkies looking for their next adventure partner.", "interest");
    await this.createGroup("Book Club", "Discussing the latest sci-fi, fantasy, and literary fiction.", "interest");
    await this.createGroup("Foodies Unite", "Share your favorite recipes and restaurant discoveries.", "interest");
    await this.createGroup("Mindfulness & Growth", "For those on a journey of self-improvement and mindfulness.", "interest");

    const demoUsers = [
      { id: "demo_sarah_001", email: "sarah@demo.vibeflow.app", firstName: "Sarah", lastName: "Chen", profileImageUrl: null },
      { id: "demo_james_002", email: "james@demo.vibeflow.app", firstName: "James", lastName: "Rivera", profileImageUrl: null },
      { id: "demo_elena_003", email: "elena@demo.vibeflow.app", firstName: "Elena", lastName: "Petrov", profileImageUrl: null },
      { id: "demo_alex_004", email: "alex@demo.vibeflow.app", firstName: "Alex", lastName: "Kim", profileImageUrl: null },
      { id: "demo_maya_005", email: "maya@demo.vibeflow.app", firstName: "Maya", lastName: "Johnson", profileImageUrl: null },
    ];

    for (const demoUser of demoUsers) {
      const existing = await db.select().from(users).where(eq(users.id, demoUser.id));
      if (existing.length === 0) {
        await db.insert(users).values(demoUser);
      }
    }

    const demoProfiles = [
      {
        userId: "demo_sarah_001",
        displayName: "Sarah",
        bio: "Artist & coffee lover. I find beauty in the small moments. Looking for someone who values deep conversation over small talk.",
        age: 28, gender: "Female", location: "San Francisco, CA",
        personalityProfile: { openness: 92, conscientiousness: 78, extraversion: 65, agreeableness: 88, neuroticism: 35 },
        twinPersona: "I'm Sarah's AI Twin. Sarah is a creative soul who values authenticity above all else. She believes in growth through vulnerability and seeks someone who can match her emotional depth. She loves morning hikes, gallery openings, and cooking elaborate meals while listening to jazz. She's looking for a partner who is intellectually curious and emotionally available.",
        onboardingCompleted: true, isPublic: true,
      },
      {
        userId: "demo_james_002",
        displayName: "James",
        bio: "Tech entrepreneur building the future. I believe in combining ambition with kindness. Weekend warrior who codes by day and surfs by sunset.",
        age: 31, gender: "Male", location: "Los Angeles, CA",
        personalityProfile: { openness: 85, conscientiousness: 90, extraversion: 72, agreeableness: 80, neuroticism: 28 },
        twinPersona: "I'm James's AI Twin. James is driven but grounded. He co-founded a startup focused on sustainable tech and genuinely cares about making the world better. He's looking for someone who has their own passions and ambitions, but also knows how to slow down and enjoy life. He values honesty, humor, and someone who challenges him intellectually.",
        onboardingCompleted: true, isPublic: true,
      },
      {
        userId: "demo_elena_003",
        displayName: "Elena",
        bio: "Nature enthusiast and amateur chef. I believe the best dates involve cooking together and stargazing. Looking for my adventure partner.",
        age: 26, gender: "Female", location: "Portland, OR",
        personalityProfile: { openness: 88, conscientiousness: 70, extraversion: 55, agreeableness: 92, neuroticism: 40 },
        twinPersona: "I'm Elena's AI Twin. Elena is warm-hearted and adventurous in a quiet way. She'd rather explore a hidden trail than go to a crowded club. She's passionate about sustainable living and farm-to-table cooking. She's looking for someone genuine, patient, and who shares her love for nature and good food.",
        onboardingCompleted: true, isPublic: true,
      },
      {
        userId: "demo_alex_004",
        displayName: "Alex",
        bio: "Musician & software engineer. I write code by day and compose music by night. Looking for someone who appreciates both logic and creativity.",
        age: 29, gender: "Non-binary", location: "Austin, TX",
        personalityProfile: { openness: 95, conscientiousness: 82, extraversion: 58, agreeableness: 75, neuroticism: 42 },
        twinPersona: "I'm Alex's AI Twin. Alex bridges the gap between technical precision and artistic expression. They play piano and guitar, and recently started producing electronic music. They value deep intellectual conversations and emotional authenticity. They're looking for someone who embraces complexity and isn't afraid to be different.",
        onboardingCompleted: true, isPublic: true,
      },
      {
        userId: "demo_maya_005",
        displayName: "Maya",
        bio: "Yoga instructor & travel blogger. 30 countries and counting. I believe connection is the foundation of happiness.",
        age: 27, gender: "Female", location: "New York, NY",
        personalityProfile: { openness: 90, conscientiousness: 68, extraversion: 85, agreeableness: 88, neuroticism: 30 },
        twinPersona: "I'm Maya's AI Twin. Maya is vibrant, open-minded, and deeply empathetic. She's traveled extensively and has a gift for making anyone feel comfortable. She's looking for someone with a growth mindset who is curious about the world and values meaningful experiences over material things.",
        onboardingCompleted: true, isPublic: true,
      }
    ];

    for (const demoProfile of demoProfiles) {
      const existing = await db.select().from(profiles).where(eq(profiles.userId, demoProfile.userId));
      if (existing.length === 0) {
        await db.insert(profiles).values(demoProfile);
      }
    }
  }

  async starMessage(messageId: number, userId: string, groupId: number): Promise<StarredMessage> {
    const existing = await db.select().from(starredMessages)
      .where(and(eq(starredMessages.messageId, messageId), eq(starredMessages.userId, userId)));
    if (existing.length > 0) return existing[0];
    const [starred] = await db.insert(starredMessages).values({ messageId, userId, groupId }).returning();
    return starred;
  }

  async unstarMessage(messageId: number, userId: string): Promise<void> {
    await db.delete(starredMessages)
      .where(and(eq(starredMessages.messageId, messageId), eq(starredMessages.userId, userId)));
  }

  async getStarredMessages(groupId: number, userId: string): Promise<any[]> {
    const starred = await db.select({
      id: starredMessages.id,
      messageId: starredMessages.messageId,
      starredAt: starredMessages.createdAt,
      content: groupMessages.content,
      nickname: groupMessages.nickname,
      contentType: groupMessages.contentType,
      mediaUrl: groupMessages.mediaUrl,
      messageCreatedAt: groupMessages.createdAt,
      senderId: groupMessages.userId,
    })
    .from(starredMessages)
    .innerJoin(groupMessages, eq(starredMessages.messageId, groupMessages.id))
    .where(and(eq(starredMessages.groupId, groupId), eq(starredMessages.userId, userId)))
    .orderBy(desc(starredMessages.createdAt));
    return starred;
  }

  async isMessageStarred(messageId: number, userId: string): Promise<boolean> {
    const [result] = await db.select().from(starredMessages)
      .where(and(eq(starredMessages.messageId, messageId), eq(starredMessages.userId, userId)));
    return !!result;
  }

  async getProfileCompletion(userId: string): Promise<{ score: number; tasks: { key: string; label: string; benefit: string; completed: boolean; weight: number }[] }> {
    const profile = await this.getProfile(userId);
    const photos = await this.getUserPhotos(userId);

    const tasks = [
      { key: "bio", label: "Add About Me", benefit: "+10% more visibility", completed: !!profile?.bio && profile.bio.length > 5, weight: 20 },
      { key: "photos", label: "Add More Photos", benefit: "Increase your appeal", completed: photos.length >= 3, weight: 25 },
      { key: "onboarding", label: "Complete Soul-Mapping", benefit: "Unlock AI Twin features", completed: !!profile?.onboardingCompleted, weight: 25 },
      { key: "verify", label: "Get Verified", benefit: "Build trust, get more matches", completed: !!profile?.isVerified, weight: 15 },
      { key: "personality", label: "Generate AI Summary", benefit: "Show your personality", completed: !!profile?.aboutSummary, weight: 15 },
    ];

    const totalWeight = tasks.reduce((sum, t) => sum + t.weight, 0);
    const completedWeight = tasks.filter(t => t.completed).reduce((sum, t) => sum + t.weight, 0);
    const score = Math.round((completedWeight / totalWeight) * 100);

    return { score, tasks };
  }

  async updateProfileCompletionScore(userId: string, score: number): Promise<void> {
    await db.update(profiles).set({ profileCompletionScore: score }).where(eq(profiles.userId, userId));
  }

  async getTwinProfileStructured(userId: string): Promise<TwinProfileStructured | undefined> {
    const [result] = await db.select().from(twinProfilesStructured).where(eq(twinProfilesStructured.userId, userId));
    return result;
  }

  async upsertTwinProfileStructured(userId: string, data: Partial<TwinProfileStructured>): Promise<TwinProfileStructured> {
    const existing = await this.getTwinProfileStructured(userId);
    if (existing) {
      const [updated] = await db.update(twinProfilesStructured)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(twinProfilesStructured.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(twinProfilesStructured)
      .values({ userId, ...data } as any)
      .returning();
    return created;
  }

  async addTwinMemoryFact(userId: string, factText: string, source?: string): Promise<TwinMemoryFact> {
    const [fact] = await db.insert(twinMemoryFacts)
      .values({ userId, factText, source: source || "chat" })
      .returning();
    return fact;
  }

  async getTwinMemoryFacts(userId: string, limit?: number): Promise<TwinMemoryFact[]> {
    let query = db.select().from(twinMemoryFacts)
      .where(eq(twinMemoryFacts.userId, userId))
      .orderBy(desc(twinMemoryFacts.createdAt));
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async clearExpiredMemoryFacts(): Promise<void> {
    await db.delete(twinMemoryFacts)
      .where(and(
        sql`${twinMemoryFacts.expiresAt} IS NOT NULL`,
        sql`${twinMemoryFacts.expiresAt} < NOW()`
      ));
  }

  async upsertTwinMemorySummary(userId: string, summaryText: string): Promise<TwinMemorySummaryEntry> {
    const existing = await this.getTwinMemorySummary(userId);
    if (existing) {
      const [updated] = await db.update(twinMemorySummary)
        .set({ summaryText, updatedAt: new Date() })
        .where(eq(twinMemorySummary.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(twinMemorySummary)
      .values({ userId, summaryText })
      .returning();
    return created;
  }

  async getTwinMemorySummary(userId: string): Promise<TwinMemorySummaryEntry | undefined> {
    const [result] = await db.select().from(twinMemorySummary).where(eq(twinMemorySummary.userId, userId));
    return result;
  }

  async getQuestions(): Promise<Question[]> {
    return await db.select().from(questions).orderBy(asc(questions.orderIndex));
  }

  async getQuestion(id: number): Promise<Question | undefined> {
    const [q] = await db.select().from(questions).where(eq(questions.id, id));
    return q;
  }

  async createQuestion(data: { text: string; category: string; answerType?: string; options?: any; isOnboardingQuestion?: boolean; weight?: number; orderIndex?: number }): Promise<Question> {
    const [q] = await db.insert(questions).values({
      text: data.text,
      category: data.category,
      answerType: data.answerType || "text",
      options: data.options,
      isOnboardingQuestion: data.isOnboardingQuestion || false,
      weight: data.weight || 1,
      orderIndex: data.orderIndex || 0,
    }).returning();
    return q;
  }

  async getNextQuestion(userId: string): Promise<Question | undefined> {
    const answered = await db.select({ questionId: userAnswers.questionId })
      .from(userAnswers)
      .where(eq(userAnswers.userId, userId));
    const skipped = await db.select({ questionId: questionSchedule.questionId })
      .from(questionSchedule)
      .where(and(
        eq(questionSchedule.userId, userId),
        sql`${questionSchedule.skippedAt} IS NOT NULL`,
        sql`(${questionSchedule.nextAskAt} IS NULL OR ${questionSchedule.nextAskAt} > NOW())`
      ));
    const answeredIds = answered.map(a => a.questionId);
    const skippedIds = skipped.map(s => s.questionId);
    const excludeIds = [...answeredIds, ...skippedIds];

    const allQuestions = await this.getQuestions();
    const unanswered = allQuestions.filter(q => !excludeIds.includes(q.id));

    if (unanswered.length === 0) return undefined;

    const categoryCounts: Record<string, number> = {};
    for (const a of answered) {
      const q = allQuestions.find(q2 => q2.id === a.questionId);
      if (q) categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1;
    }
    const categorySet = new Set(allQuestions.map(q => q.category));
    const allCategories = Array.from(categorySet);
    let lowestCategory = allCategories[0];
    let lowestCount = Infinity;
    for (const cat of allCategories) {
      const c = categoryCounts[cat] || 0;
      if (c < lowestCount) {
        lowestCount = c;
        lowestCategory = cat;
      }
    }

    const fromCategory = unanswered.filter(q => q.category === lowestCategory);
    const candidates = fromCategory.length > 0 ? fromCategory : unanswered;
    candidates.sort((a, b) => (b.weight || 1) - (a.weight || 1));
    return candidates[0];
  }

  async submitAnswer(userId: string, questionId: number, answerText?: string, selectedOptions?: any, ratingValue?: number, isPrivate?: boolean): Promise<UserAnswer> {
    const [answer] = await db.insert(userAnswers).values({
      userId,
      questionId,
      answerText,
      selectedOptions,
      ratingValue,
      isPrivate: isPrivate || false,
    }).returning();
    return answer;
  }

  async getUserAnswers(userId: string): Promise<UserAnswer[]> {
    return await db.select().from(userAnswers).where(eq(userAnswers.userId, userId)).orderBy(desc(userAnswers.answeredAt));
  }

  async getUserAnswer(userId: string, questionId: number): Promise<UserAnswer | undefined> {
    const [answer] = await db.select().from(userAnswers)
      .where(and(eq(userAnswers.userId, userId), eq(userAnswers.questionId, questionId)));
    return answer;
  }

  async recordQuestionAsked(userId: string, questionId: number): Promise<QuestionScheduleEntry> {
    const [entry] = await db.insert(questionSchedule).values({ userId, questionId }).returning();
    return entry;
  }

  async skipQuestion(userId: string, questionId: number): Promise<QuestionScheduleEntry> {
    const nextAsk = new Date();
    nextAsk.setDate(nextAsk.getDate() + 7);
    const [entry] = await db.insert(questionSchedule).values({
      userId,
      questionId,
      skippedAt: new Date(),
      nextAskAt: nextAsk,
    }).returning();
    return entry;
  }

  async createAuditLog(userId: string | null, eventType: string, details?: any): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values({
      userId,
      eventType,
      details: details || {},
    }).returning();
    return log;
  }

  async getAuditLogs(userId?: string, limit?: number): Promise<AuditLog[]> {
    if (userId) {
      const q = db.select().from(auditLogs).where(eq(auditLogs.userId, userId)).orderBy(desc(auditLogs.createdAt));
      return limit ? await q.limit(limit) : await q;
    }
    const q = db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
    return limit ? await q.limit(limit) : await q;
  }
}

export const storage = new DatabaseStorage();
