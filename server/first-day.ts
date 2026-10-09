// "Your first day on Destira": five small actions that turn a fresh account
// into one that gets something back (a photo, answers, a lounge, an event, a
// first like), and a real reward for finishing them: 7 more days of Flame.
//
// Reward rules (idempotent: first_day_rewards has one row per member, ever):
//   - on the signup Flame trial (still running or lapsed): extend it 7 days
//     from whichever is later, now or its current end
//   - no subscription at all: start a 7-day Flame trial
//   - on a paid plan: nothing to extend; the claim is still recorded
import { db } from "./db";
import {
  userPhotos, profiles, groupMembers, groups, eventAttendees, matches, subscriptions, firstDayRewards,
} from "@shared/schema";
import { and, eq, or, count, desc, inArray } from "drizzle-orm";

const REWARD_DAYS = 7;
const DAY_MS = 86_400_000;

export interface FirstDayStep {
  key: "photo" | "answers" | "lounge" | "event" | "like";
  title: string;
  detail: string;
  href: string;
  done: boolean;
}

export interface FirstDayState {
  steps: FirstDayStep[];
  doneCount: number;
  allDone: boolean;
  claimed: boolean;
  rewardLabel: string;
}

export async function getFirstDayState(userId: string): Promise<FirstDayState> {
  const [[photos], [profile], [lounges], [rsvps], [likes], [claim]] = await Promise.all([
    db.select({ n: count() }).from(userPhotos).where(eq(userPhotos.userId, userId)),
    db.select({ onboarded: profiles.onboardingCompleted }).from(profiles).where(eq(profiles.userId, userId)),
    db
      .select({ n: count() })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groupMembers.userId, userId), eq(groups.isEventChat, false))),
    db.select({ n: count() }).from(eventAttendees).where(and(eq(eventAttendees.userId, userId), inArray(eventAttendees.status, ["going", "waitlisted", "requested"]))),
    // A like they sent, or one they answered (liking back makes them user2 on a
    // matched row) — both are "liked someone".
    db.select({ n: count() }).from(matches).where(or(eq(matches.user1Id, userId), and(eq(matches.user2Id, userId), eq(matches.status, "matched")))),
    db.select({ at: firstDayRewards.claimedAt }).from(firstDayRewards).where(eq(firstDayRewards.userId, userId)),
  ]);

  const steps: FirstDayStep[] = [
    { key: "photo", title: "Add a photo", detail: "People say yes to a face.", href: "/photos", done: Number(photos?.n ?? 0) > 0 },
    { key: "answers", title: "Answer your first questions", detail: "Tap-to-answer. Your twin learns you from these.", href: "/onboarding", done: !!profile?.onboarded },
    { key: "lounge", title: "Join a lounge", detail: "Group chats by interest and city. Low pressure.", href: "/lounge", done: Number(lounges?.n ?? 0) > 0 },
    { key: "event", title: "Save a seat at an event", detail: "The point is meeting in real life.", href: "/events", done: Number(rsvps?.n ?? 0) > 0 },
    { key: "like", title: "Like someone", detail: "If they like you back, you can talk.", href: "/discover", done: Number(likes?.n ?? 0) > 0 },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    doneCount,
    allDone: doneCount === steps.length,
    claimed: !!claim,
    rewardLabel: `${REWARD_DAYS} more days of Flame`,
  };
}

export class FirstDayNotDoneError extends Error {
  constructor() { super("Finish all five steps first."); }
}

/** Returns what was granted, or null if it was already claimed. */
export async function claimFirstDayReward(userId: string): Promise<{ granted: "extended" | "started" | "none"; until: Date | null } | null> {
  const state = await getFirstDayState(userId);
  if (state.claimed) return null;
  if (!state.allDone) throw new FirstDayNotDoneError();

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(firstDayRewards).values({ userId }).onConflictDoNothing().returning();
    if (!row) return null; // a concurrent claim won

    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    const now = new Date();

    if (!sub) {
      const until = new Date(now.getTime() + REWARD_DAYS * DAY_MS);
      await tx.insert(subscriptions).values({
        userId, tier: "flame", status: "active", provider: "trial", currentPeriodStart: now, currentPeriodEnd: until,
      });
      return { granted: "started" as const, until };
    }
    if (sub.provider === "trial") {
      const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      const until = new Date(base.getTime() + REWARD_DAYS * DAY_MS);
      await tx
        .update(subscriptions)
        .set({ tier: sub.tier === "free" ? "flame" : sub.tier, status: "active", currentPeriodEnd: until, updatedAt: now })
        .where(eq(subscriptions.id, sub.id));
      return { granted: "extended" as const, until };
    }
    return { granted: "none" as const, until: sub.currentPeriodEnd ?? null };
  });
}
