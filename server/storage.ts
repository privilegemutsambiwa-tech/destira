import { db } from "./db";
import {
  profiles, matches, interviews, groups, groupMembers, directMessages, groupMessages,
  type Profile, type InsertProfile, type UpdateProfileRequest,
  type Match, type Interview, type Group, type GroupMember, type DirectMessage, type GroupMessage
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, or, and, ne, asc } from "drizzle-orm";

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

  createInterview(requesterId: string, targetId: string): Promise<Interview>;
  getInterviews(userId: string): Promise<Interview[]>;
  getInterview(id: number): Promise<Interview | undefined>;
  updateInterviewTranscript(id: number, transcript: string): Promise<Interview>;
  updateInterviewStatus(id: number, status: string): Promise<Interview>;
  getInterviewsWithProfiles(userId: string): Promise<any[]>;

  getGroups(): Promise<Group[]>;
  getGroup(id: number): Promise<Group | undefined>;
  createGroup(name: string, description: string, type: string): Promise<Group>;
  joinGroup(groupId: number, userId: string, nickname: string): Promise<GroupMember>;
  getGroupMembers(groupId: number): Promise<GroupMember[]>;
  isGroupMember(groupId: number, userId: string): Promise<boolean>;
  getGroupMessages(groupId: number, limit?: number): Promise<GroupMessage[]>;
  sendGroupMessage(groupId: number, userId: string, nickname: string, content: string): Promise<GroupMessage>;

  getDirectMessages(matchId: number, limit?: number): Promise<DirectMessage[]>;
  sendDirectMessage(matchId: number, senderId: string, content: string): Promise<DirectMessage>;

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
      const otherUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
      const otherProfile = await this.getProfileWithUser(otherUserId);
      result.push({
        ...match,
        otherProfile: otherProfile || null,
        isRequester: match.user1Id === userId,
      });
    }
    return result;
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

  async joinGroup(groupId: number, userId: string, nickname: string): Promise<GroupMember> {
    const [member] = await db.insert(groupMembers).values({ groupId, userId, nickname }).returning();
    return member;
  }

  async getGroupMembers(groupId: number): Promise<GroupMember[]> {
    return db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
  }

  async isGroupMember(groupId: number, userId: string): Promise<boolean> {
    const [member] = await db.select().from(groupMembers).where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))
    );
    return !!member;
  }

  async getGroupMessages(groupId: number, limit: number = 50): Promise<GroupMessage[]> {
    return db.select().from(groupMessages)
      .where(eq(groupMessages.groupId, groupId))
      .orderBy(asc(groupMessages.createdAt))
      .limit(limit);
  }

  async sendGroupMessage(groupId: number, userId: string, nickname: string, content: string): Promise<GroupMessage> {
    const [msg] = await db.insert(groupMessages).values({ groupId, userId, nickname, content }).returning();
    return msg;
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
}

export const storage = new DatabaseStorage();
