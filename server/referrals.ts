// Referrals service. Growth that never touches matching: a qualified referral
// gives BOTH people a free week of plan time (grantPlanDays below) — or, for
// someone already on a paid plan, PAID_REWARD_VIEWS profile views instead —
// and the referrer five profile_view_grants (looking someone up) on top.
// Never an extra daily read, never placement.
//
// The reward transaction locks the pending referral row FOR UPDATE and
// re-asserts status = 'pending' before granting, so a double-fired
// checkQualification (e.g. two profile writes in quick succession) can never
// double-grant.
import { db } from "./db";
import { referralCodes, referrals, profileViewGrants, subscriptions, profiles } from "@shared/schema";
import { storage } from "./storage";
import { and, desc, eq, gt, gte, inArray, or, sql } from "drizzle-orm";

// Crockford-ish: 32 glyphs, no O/0/I/1 so a code is safe to read aloud.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LEN = 8;
const REFERRAL_REWARD_VIEWS = 5;
const READINESS_GATE = 40; // getProfileCompletion score, 0-100
const CAP_PER_30_DAYS = 50;
export const REFERRAL_REWARD_DAYS = 7;
// What a member on a PAID plan gets instead of the week: extending a paid
// period would give away time they're paying for.
export const PAID_REWARD_VIEWS = 20;
// Rewards (a week, or the paid-plan views) a referrer can earn per 30 days.
// Each one needs a real friend to finish onboarding, but this bounds what a
// farm of throwaway accounts could ever mint. The invited friend's own
// reward is never capped.
export const REWARDS_CAP_PER_30_DAYS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reward = "week" | "views";

/** Add `days` of plan time. A running plan (trial or paid) runs that much
 *  longer at its own tier; anyone without one gets that long on Spark. */
async function grantPlanDays(tx: Tx, userId: string, days: number): Promise<void> {
  const now = new Date();
  const add = days * DAY_MS;
  const [sub] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const running =
    sub && sub.status === "active" && sub.tier !== "free" && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
  if (sub && running) {
    await tx
      .update(subscriptions)
      .set({ currentPeriodEnd: new Date(sub.currentPeriodEnd!.getTime() + add), updatedAt: now })
      .where(eq(subscriptions.id, sub.id));
  } else if (sub) {
    await tx
      .update(subscriptions)
      .set({ tier: "spark", status: "active", provider: "referral", cancelAtPeriodEnd: false, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + add), updatedAt: now })
      .where(eq(subscriptions.id, sub.id));
  } else {
    await tx.insert(subscriptions).values({
      userId, tier: "spark", status: "active", provider: "referral", currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + add),
    });
  }
}

/** On a plan someone actually paid for — not a trial or an invite week. */
async function isOnPaidPlan(tx: Tx, userId: string): Promise<boolean> {
  const [sub] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return (
    !!sub &&
    sub.status === "active" &&
    sub.tier !== "free" &&
    !!sub.currentPeriodEnd &&
    sub.currentPeriodEnd > new Date() &&
    sub.provider !== "trial" &&
    sub.provider !== "referral"
  );
}

async function firstName(userId: string): Promise<string> {
  const p = await storage.getProfile(userId);
  return (p?.displayName || "").trim().split(/\s+/)[0] || "Someone";
}

export type AttachResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "self" | "already" };

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/** Lazily mint one immutable code per user. */
export async function getOrCreateCode(userId: string): Promise<string> {
  const [existing] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const [row] = await db.insert(referralCodes).values({ userId, code }).returning();
      return row.code;
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Either another request minted this user's code, or the code collided.
        const [now] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
        if (now) return now.code;
        continue; // code collision — try another
      }
      throw err;
    }
  }
  throw new Error("Could not generate a referral code");
}

/** Attach an invited user to a referrer. The uniqueIndex on invited_user_id is
 *  the real "once only / no re-attribution" guard. */
export async function attachReferral(invitedUserId: string, rawCode: string): Promise<AttachResult> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code)) return { ok: false, reason: "invalid" };

  const [owner] = await db.select().from(referralCodes).where(eq(referralCodes.code, code));
  if (!owner) return { ok: false, reason: "invalid" };
  if (owner.userId === invitedUserId) return { ok: false, reason: "self" };

  try {
    await db.insert(referrals).values({
      referrerUserId: owner.userId,
      invitedUserId,
      code,
      status: "pending",
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "already" };
    throw err;
  }
  return { ok: true };
}

/** Flip a pending referral to rewarded (and grant the referrer) once the
 *  invited user has actually activated. Safe to call on every profile write. */
export async function checkQualification(invitedUserId: string): Promise<void> {
  const [pending] = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.invitedUserId, invitedUserId), eq(referrals.status, "pending")));
  if (!pending) return;

  const profile = await storage.getProfile(invitedUserId);
  if (!profile?.onboardingCompleted) return;
  const { score } = await storage.getProfileCompletion(invitedUserId);
  if (score < READINESS_GATE) return;

  await rewardReferral(invitedUserId);
}

/** The reward itself, once the invited user has passed the gates above.
 *  Exported for scripts/assert-referral-rewards.ts. */
export async function rewardReferral(invitedUserId: string): Promise<void> {
  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(referrals)
      .where(and(eq(referrals.invitedUserId, invitedUserId), eq(referrals.status, "pending")))
      .for("update");
    if (!row) return null; // already handled by a concurrent call

    const since = new Date(Date.now() - 30 * DAY_MS);
    const [[{ n: viewGrants }], [{ n: bigRewards }]] = await Promise.all([
      tx
        .select({ n: sql<number>`count(*)` })
        .from(profileViewGrants)
        .where(
          and(
            eq(profileViewGrants.userId, row.referrerUserId),
            eq(profileViewGrants.reason, "referral"),
            gte(profileViewGrants.createdAt, since),
          ),
        ),
      tx
        .select({ n: sql<number>`count(*)` })
        .from(referrals)
        .where(
          and(
            eq(referrals.referrerUserId, row.referrerUserId),
            gte(referrals.qualifiedAt, since),
            or(gt(referrals.referrerRewardDays, 0), gte(referrals.referrerRewardViews, PAID_REWARD_VIEWS)),
          ),
        ),
    ]);
    const underCap = Number(bigRewards) < REWARDS_CAP_PER_30_DAYS;
    const baseViews = Number(viewGrants) < CAP_PER_30_DAYS ? REFERRAL_REWARD_VIEWS : 0;

    // The friend who joined always gets theirs: a week, or views if paid.
    const invitedPaid = await isOnPaidPlan(tx, invitedUserId);
    const invitedReward: Reward = invitedPaid ? "views" : "week";
    if (invitedPaid) {
      await tx.insert(profileViewGrants).values({ userId: invitedUserId, amount: PAID_REWARD_VIEWS, reason: "referral", expiresAt: null });
    } else {
      await grantPlanDays(tx, invitedUserId, REFERRAL_REWARD_DAYS);
    }

    let referrerReward: Reward | "none" = "none";
    if (underCap) referrerReward = (await isOnPaidPlan(tx, row.referrerUserId)) ? "views" : "week";
    if (referrerReward === "week") await grantPlanDays(tx, row.referrerUserId, REFERRAL_REWARD_DAYS);
    const referrerViews = baseViews + (referrerReward === "views" ? PAID_REWARD_VIEWS : 0);
    if (referrerViews > 0) {
      await tx.insert(profileViewGrants).values({
        userId: row.referrerUserId,
        amount: referrerViews,
        reason: "referral",
        expiresAt: null,
      });
    }
    const rewarded = referrerReward !== "none" || referrerViews > 0;
    if (!rewarded) {
      console.warn(
        `[referrals] 30-day caps hit for referrer ${row.referrerUserId}; referral ${row.id} held at 'qualified', referrer not granted`,
      );
    }
    await tx
      .update(referrals)
      .set({
        status: rewarded ? "rewarded" : "qualified",
        qualifiedAt: new Date(),
        referrerRewardDays: referrerReward === "week" ? REFERRAL_REWARD_DAYS : 0,
        referrerRewardViews: referrerViews,
        invitedRewardDays: invitedReward === "week" ? REFERRAL_REWARD_DAYS : 0,
        invitedRewardViews: invitedReward === "views" ? PAID_REWARD_VIEWS : 0,
      })
      .where(eq(referrals.id, row.id));
    return { referrerUserId: row.referrerUserId, referrerReward, invitedReward };
  });
  if (!outcome) return;

  // Tell both of them, outside the transaction.
  const [inviterName, friendName] = await Promise.all([firstName(outcome.referrerUserId), firstName(invitedUserId)]);
  storage
    .createNotification(
      invitedUserId,
      "referral_reward",
      outcome.invitedReward === "week" ? "A free week, from a friend" : "Profile views, from a friend",
      outcome.invitedReward === "week"
        ? `You joined through ${inviterName}'s invite, so you get a free week on Destira.`
        : `You joined through ${inviterName}'s invite, so you get ${PAID_REWARD_VIEWS} extra profile views.`,
    )
    .catch(() => {});
  const referrerLine =
    outcome.referrerReward === "week"
      ? `${friendName} finished setting up, so you get a free week on Destira.`
      : outcome.referrerReward === "views"
        ? `${friendName} finished setting up, so you get ${PAID_REWARD_VIEWS} extra profile views.`
        : `${friendName} finished setting up and got their reward. You've reached this month's limit of ${REWARDS_CAP_PER_30_DAYS} invite rewards.`;
  storage
    .createNotification(outcome.referrerUserId, "referral_reward", `${friendName} joined from your invite`, referrerLine)
    .catch(() => {});
}

/** For a user who signed up before entering a code. Same once-only rules. */
export async function claimCode(userId: string, rawCode: string): Promise<AttachResult> {
  const result = await attachReferral(userId, rawCode);
  if (result.ok) await checkQualification(userId);
  return result;
}

export interface ReferralSummary {
  code: string;
  counts: { pending: number; qualified: number; rewarded: number };
  viewsEarned: number;
  daysEarned: number;
  rewardDays: number;
  paidRewardViews: number;
  monthlyCap: number;
  // Friends who joined with this member's code — first name only.
  friends: { firstName: string; status: "setting_up" | "joined"; joinedAt: string | null }[];
}

export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const code = await getOrCreateCode(userId);

  const rows = await db
    .select({ status: referrals.status, n: sql<number>`count(*)` })
    .from(referrals)
    .where(eq(referrals.referrerUserId, userId))
    .groupBy(referrals.status);

  const counts = { pending: 0, qualified: 0, rewarded: 0 };
  for (const r of rows) {
    if (r.status in counts) counts[r.status as keyof typeof counts] = Number(r.n);
  }

  const [{ earned }] = await db
    .select({ earned: sql<number>`coalesce(sum(${profileViewGrants.amount}), 0)` })
    .from(profileViewGrants)
    .where(and(eq(profileViewGrants.userId, userId), eq(profileViewGrants.reason, "referral")));

  const mine = await db
    .select({
      invitedUserId: referrals.invitedUserId,
      status: referrals.status,
      days: referrals.referrerRewardDays,
      createdAt: referrals.createdAt,
    })
    .from(referrals)
    .where(eq(referrals.referrerUserId, userId))
    .orderBy(desc(referrals.createdAt))
    .limit(50);
  const names = mine.length
    ? await db
        .select({ userId: profiles.userId, displayName: profiles.displayName })
        .from(profiles)
        .where(inArray(profiles.userId, mine.map((m) => m.invitedUserId)))
    : [];
  const nameOf = new Map(names.map((n) => [n.userId, (n.displayName || "").trim().split(/\s+/)[0]]));
  const friends = mine.map((m) => ({
    firstName: nameOf.get(m.invitedUserId) || "A friend",
    status: (m.status === "pending" ? "setting_up" : "joined") as "setting_up" | "joined",
    joinedAt: m.createdAt ? m.createdAt.toISOString() : null,
  }));
  const daysEarned = mine.reduce((sum, m) => sum + (m.days ?? 0), 0);

  return {
    code,
    counts,
    viewsEarned: Number(earned),
    daysEarned,
    rewardDays: REFERRAL_REWARD_DAYS,
    paidRewardViews: PAID_REWARD_VIEWS,
    monthlyCap: REWARDS_CAP_PER_30_DAYS,
    friends,
  };
}

/** Who a code belongs to — first name only, for "Rudo invited you". */
export async function getInviterFirstName(rawCode: string): Promise<string | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code)) return null;
  const [owner] = await db.select().from(referralCodes).where(eq(referralCodes.code, code));
  if (!owner) return null;
  return firstName(owner.userId);
}
