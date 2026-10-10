// Referrals service. Growth that never touches matching: a qualified referral
// gives BOTH people a free week of plan time (grantPlanDays below) and the
// referrer five profile_view_grants (looking someone up) — never an extra
// daily read, never placement.
//
// The reward transaction locks the pending referral row FOR UPDATE and
// re-asserts status = 'pending' before granting, so a double-fired
// checkQualification (e.g. two profile writes in quick succession) can never
// double-grant.
import { db } from "./db";
import { referralCodes, referrals, profileViewGrants, subscriptions, profiles } from "@shared/schema";
import { storage } from "./storage";
import { and, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";

// Crockford-ish: 32 glyphs, no O/0/I/1 so a code is safe to read aloud.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LEN = 8;
const REFERRAL_REWARD_VIEWS = 5;
const READINESS_GATE = 40; // getProfileCompletion score, 0-100
const CAP_PER_30_DAYS = 50;
export const REFERRAL_REWARD_DAYS = 7;
// Free weeks a referrer can earn per 30 days. Each one needs a real friend
// to finish onboarding, but this bounds what a farm of throwaway accounts
// could ever mint. The invited friend's own week is never capped.
const WEEKS_CAP_PER_30_DAYS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
    const [[{ n: viewGrants }], [{ n: weekGrants }]] = await Promise.all([
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
            gt(referrals.referrerRewardDays, 0),
            gte(referrals.qualifiedAt, since),
          ),
        ),
    ]);
    const referrerGetsViews = Number(viewGrants) < CAP_PER_30_DAYS;
    const referrerGetsWeek = Number(weekGrants) < WEEKS_CAP_PER_30_DAYS;

    // The friend who joined always gets their week.
    await grantPlanDays(tx, invitedUserId, REFERRAL_REWARD_DAYS);
    if (referrerGetsWeek) await grantPlanDays(tx, row.referrerUserId, REFERRAL_REWARD_DAYS);
    if (referrerGetsViews) {
      await tx.insert(profileViewGrants).values({
        userId: row.referrerUserId,
        amount: REFERRAL_REWARD_VIEWS,
        reason: "referral",
        expiresAt: null,
      });
    }
    const rewarded = referrerGetsWeek || referrerGetsViews;
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
        referrerRewardDays: referrerGetsWeek ? REFERRAL_REWARD_DAYS : 0,
        invitedRewardDays: REFERRAL_REWARD_DAYS,
      })
      .where(eq(referrals.id, row.id));
    return { referrerUserId: row.referrerUserId, referrerGetsWeek };
  });
  if (!outcome) return;

  // Tell both of them, outside the transaction.
  const [inviterName, friendName] = await Promise.all([firstName(outcome.referrerUserId), firstName(invitedUserId)]);
  storage
    .createNotification(
      invitedUserId,
      "referral_reward",
      "A free week, from a friend",
      `You joined through ${inviterName}'s invite, so you both get a free week on Destira.`,
    )
    .catch(() => {});
  storage
    .createNotification(
      outcome.referrerUserId,
      "referral_reward",
      `${friendName} joined from your invite`,
      outcome.referrerGetsWeek
        ? `${friendName} finished setting up, so you both get a free week on Destira.`
        : `${friendName} finished setting up and got a free week. You've reached this month's limit of free weeks from invites.`,
    )
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

  return { code, counts, viewsEarned: Number(earned), daysEarned, rewardDays: REFERRAL_REWARD_DAYS, friends };
}

/** Who a code belongs to — first name only, for "Rudo invited you". */
export async function getInviterFirstName(rawCode: string): Promise<string | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code)) return null;
  const [owner] = await db.select().from(referralCodes).where(eq(referralCodes.code, code));
  if (!owner) return null;
  return firstName(owner.userId);
}
