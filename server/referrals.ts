// Referrals service. Growth that never touches matching: a qualified referral
// grants the REFERRER five profile_view_grants (looking someone up), never an
// extra daily read.
//
// The reward transaction locks the pending referral row FOR UPDATE and
// re-asserts status = 'pending' before granting, so a double-fired
// checkQualification (e.g. two profile writes in quick succession) can never
// double-grant.
import { db } from "./db";
import { referralCodes, referrals, profileViewGrants } from "@shared/schema";
import { storage } from "./storage";
import { and, eq, gte, sql } from "drizzle-orm";

// Crockford-ish: 32 glyphs, no O/0/I/1 so a code is safe to read aloud.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LEN = 8;
const REFERRAL_REWARD_VIEWS = 5;
const READINESS_GATE = 40; // getProfileCompletion score, 0-100
const CAP_PER_30_DAYS = 50;

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

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(referrals)
      .where(and(eq(referrals.invitedUserId, invitedUserId), eq(referrals.status, "pending")))
      .for("update");
    if (!row) return; // already handled by a concurrent call

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(profileViewGrants)
      .where(
        and(
          eq(profileViewGrants.userId, row.referrerUserId),
          eq(profileViewGrants.reason, "referral"),
          gte(profileViewGrants.createdAt, since),
        ),
      );

    if (Number(n) >= CAP_PER_30_DAYS) {
      await tx
        .update(referrals)
        .set({ status: "qualified", qualifiedAt: new Date() })
        .where(eq(referrals.id, row.id));
      console.warn(
        `[referrals] 30-day cap hit for referrer ${row.referrerUserId}; referral ${row.id} held at 'qualified', no grant`,
      );
      return;
    }

    await tx
      .update(referrals)
      .set({ status: "rewarded", qualifiedAt: new Date() })
      .where(eq(referrals.id, row.id));
    await tx.insert(profileViewGrants).values({
      userId: row.referrerUserId,
      amount: REFERRAL_REWARD_VIEWS,
      reason: "referral",
      expiresAt: null,
    });
  });
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

  return { code, counts, viewsEarned: Number(earned) };
}
