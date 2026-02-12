import { db } from "./db";
import {
  profiles, matches, interviews, groups,
  type Profile, type InsertProfile, type UpdateProfileRequest,
  type Match, type Interview, type Group
} from "@shared/schema";
import { eq, or, and } from "drizzle-orm";

export interface IStorage {
  // Profiles
  getProfile(userId: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  updateProfile(userId: string, updates: UpdateProfileRequest): Promise<Profile>;

  // Matches
  createMatch(user1Id: string, user2Id: string): Promise<Match>;
  getMatches(userId: string): Promise<Match[]>;

  // Interviews
  createInterview(requesterId: string, targetId: string): Promise<Interview>;
  getInterviews(userId: string): Promise<Interview[]>;
  getInterview(id: number): Promise<Interview | undefined>;
  updateInterviewTranscript(id: number, transcript: string): Promise<Interview>;

  // Groups
  getGroups(): Promise<Group[]>;
}

export class DatabaseStorage implements IStorage {
  // Profiles
  async getProfile(userId: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
    return profile;
  }

  async createProfile(profile: InsertProfile): Promise<Profile> {
    const [newProfile] = await db.insert(profiles).values(profile).returning();
    return newProfile;
  }

  async updateProfile(userId: string, updates: UpdateProfileRequest): Promise<Profile> {
    const [updated] = await db.update(profiles)
      .set(updates)
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  // Matches
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

  // Interviews
  async createInterview(requesterId: string, targetId: string): Promise<Interview> {
    const [interview] = await db.insert(interviews).values({
      requesterId,
      targetId,
      status: "requested"
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

  // Groups
  async getGroups(): Promise<Group[]> {
    return db.select().from(groups);
  }
}

export const storage = new DatabaseStorage();
