// Server-side plan enforcement. One place decides a user's tier and whether a
// gated action is allowed. A client that lies gets a 403 with a consistent,
// machine-readable body.
//
// DOWNGRADE / EXPIRY: getEffectiveTier drops a user to free the moment their
// subscription is not active or has passed its period end — the gates come back
// on the very next request. Nothing the user created at a higher tier is
// deleted: a user who hosted three events on Flame and lapses keeps all three
// (they stay published and manageable); they simply can't host a fourth until
// they're back on Flame+.

import { db } from "./db";
import { subscriptions, profiles, interviews, groupMembers, groups, dailyLikeCounts, storyComments, chatRequests, videoCalls, discoverPasses } from "@shared/schema";
import { and, eq, gte, count, asc, isNotNull, sql } from "drizzle-orm";
import { LIMITS, tierRank, FEATURE_MIN_TIER, gateCopy, type Tier, type Feature } from "@shared/entitlements";

/** "at midnight" / "at 6:00 PM" / "in 3 days" from an ISO instant — mirrors
 *  the client's resetLabel so the 403 body and the sheet agree. A same-day
 *  reset (daily_likes) gets a clock time; a rolling-window reset more than a
 *  day out (weekly caps) gets a day count instead, since "at 9:04 PM" with no
 *  date is misleading a week from now. */
export function resetLabelFromISO(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const msAway = d.getTime() - Date.now();
  if (msAway > 20 * 3_600_000) {
    const days = Math.max(1, Math.round(msAway / 86_400_000));
    return days === 1 ? "in 1 day" : `in ${days} days`;
  }
  if (d.getHours() === 0) return "at midnight";
  return `at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

/** For a rolling N-day window: the instant the oldest row currently inside
 *  the window ages out and frees up a slot. Undefined when the caller isn't
 *  actually over the limit (no rows to age out yet). */
async function rollingWindowResetAt(
  userId: string,
  windowDays: number,
  oldestInWindow: (userId: string, since: Date) => Promise<Date | undefined>,
): Promise<string | undefined> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const oldest = await oldestInWindow(userId, since);
  if (!oldest) return undefined;
  return new Date(oldest.getTime() + windowDays * 24 * 60 * 60 * 1000).toISOString();
}

function coerceTier(t: unknown): Tier {
  if (t === "spark" || t === "flame" || t === "ember" || t === "free") return t;
  if (t === "plus") return "flame"; // legacy
  if (t === "vip") return "ember"; // legacy
  return "free";
}

export async function getEffectiveTier(userId: string): Promise<Tier> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(subscriptions.createdAt);
  if (sub) {
    const active =
      sub.status === "active" &&
      (!sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > Date.now());
    if (active) return coerceTier(sub.tier);
    // lapsed / cancelled → fall through to free
  }
  const [p] = await db
    .select({ tier: profiles.subscriptionTier })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  // profiles.subscriptionTier is only ever set by a confirmed payment (Phase 4);
  // if a sub row exists but is lapsed, that wins → free.
  return sub ? "free" : coerceTier(p?.tier);
}

// Free time on a plan: the sign-up trial and invite-a-friend weeks. A
// referral week added to a plan someone pays for keeps that plan's provider.
const UNPAID_PROVIDERS = new Set(["trial", "referral"]);

/** On a plan they paid for (not a trial or a free week). Owner decision:
 *  starting video dates is for paying members only. Reads the same row
 *  getEffectiveTier does. */
export async function onPaidPlan(userId: string): Promise<boolean> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(subscriptions.createdAt);
  if (sub) {
    const active = sub.status === "active" && (!sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > Date.now());
    return active && coerceTier(sub.tier) !== "free" && !UNPAID_PROVIDERS.has(sub.provider ?? "");
  }
  const [p] = await db.select({ tier: profiles.subscriptionTier }).from(profiles).where(eq(profiles.userId, userId));
  // Only ever set by a confirmed payment.
  return coerceTier(p?.tier) !== "free";
}

/** The instant of the next local midnight in `tz` (IANA), as an ISO string.
 *  Falls back to server time when tz is missing or invalid. */
export function nextMidnightISO(tz?: string | null): string {
  const now = new Date();
  let wall = now;
  try {
    if (tz) wall = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  } catch {
    wall = now;
  }
  const msIntoDay =
    wall.getHours() * 3_600_000 +
    wall.getMinutes() * 60_000 +
    wall.getSeconds() * 1_000 +
    wall.getMilliseconds();
  return new Date(now.getTime() + (86_400_000 - msIntoDay)).toISOString();
}

/** Today's date (YYYY-MM-DD) in `tz` — the key the daily like counter is
 *  stored under. Must agree with nextMidnightISO: the sheet says the likes
 *  come back "at midnight", so the counter has to roll over at the user's
 *  own midnight, not UTC's (02:00 in Harare). Server time when tz is bad. */
export function localDayKey(tz?: string | null): string {
  try {
    if (tz) {
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    }
  } catch {}
  return new Date().toISOString().slice(0, 10);
}

export async function userTimezone(userId: string): Promise<string | null> {
  const [p] = await db.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  return p?.tz ?? null;
}

export interface GateResult {
  ok: boolean;
  tier: Tier;
  limit: number | null;
  used?: number;
  resetAt?: string;
  requiredTier?: Tier;
  message?: string;
  /** Refused because the plan is a trial or a free week, not a paid one. */
  unpaid?: boolean;
}

async function usage(userId: string, feature: Feature): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  switch (feature) {
    case "daily_likes":
      return db
        .select({ n: dailyLikeCounts.count })
        .from(dailyLikeCounts)
        .where(and(eq(dailyLikeCounts.userId, userId), eq(dailyLikeCounts.date, localDayKey(await userTimezone(userId)))))
        .then((r) => r[0]?.n ?? 0);
    case "daily_passes":
      return passesToday(userId);
    case "start_interview":
      return db
        .select({ n: count() })
        .from(interviews)
        .where(and(eq(interviews.requesterId, userId), gte(interviews.createdAt, weekAgo)))
        .then((r) => Number(r[0]?.n ?? 0));
    case "join_group":
      // Lounge rooms only: event chats, Sunday Table chats and friend
      // circles are hidden rooms and never count against the cap.
      return db
        .select({ n: count() })
        .from(groupMembers)
        .innerJoin(groups, eq(groups.id, groupMembers.groupId))
        .where(and(eq(groupMembers.userId, userId), sql`coalesce(${groups.isEventChat}, false) = false`))
        .then((r) => Number(r[0]?.n ?? 0));
    case "create_group":
      return db
        .select({ n: count() })
        .from(groups)
        .where(eq(groups.ownerId, userId))
        .then((r) => Number(r[0]?.n ?? 0));
    case "story_reply":
      return db
        .select({ n: count() })
        .from(storyComments)
        .where(and(eq(storyComments.userId, userId), gte(storyComments.createdAt, weekAgo)))
        .then((r) => Number(r[0]?.n ?? 0));
    case "group_chat_request":
      return db
        .select({ n: count() })
        .from(chatRequests)
        .where(and(eq(chatRequests.requesterId, userId), gte(chatRequests.createdAt, weekAgo)))
        .then((r) => Number(r[0]?.n ?? 0));
    case "video_call":
      return videoMinutesUsedToday(userId);
    default:
      return 0;
  }
}

/** Discover passes since this member's local midnight. A pass taken back is
 *  deleted, so it gives the pass back too. */
export async function passesToday(userId: string): Promise<number> {
  const dayStart = new Date(new Date(nextMidnightISO(await userTimezone(userId))).getTime() - 24 * 60 * 60 * 1000);
  return db
    .select({ n: count() })
    .from(discoverPasses)
    .where(and(eq(discoverPasses.userId, userId), gte(discoverPasses.createdAt, dayStart)))
    .then((r) => Number(r[0]?.n ?? 0));
}

/** Whole minutes of video dates this member STARTED since their local
 *  midnight (answering never counts). A call still going counts up to now. */
export async function videoMinutesUsedToday(userId: string): Promise<number> {
  return Math.floor((await videoMsUsedToday(userId)) / 60_000);
}

export async function videoMsUsedToday(userId: string): Promise<number> {
  const dayStart = new Date(new Date(nextMidnightISO(await userTimezone(userId))).getTime() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ answeredAt: videoCalls.answeredAt, endedAt: videoCalls.endedAt })
    .from(videoCalls)
    .where(and(eq(videoCalls.callerId, userId), isNotNull(videoCalls.answeredAt), gte(videoCalls.answeredAt, dayStart)));
  const now = Date.now();
  return rows.reduce((sum, r) => sum + Math.max(0, (r.endedAt?.getTime() ?? now) - r.answeredAt!.getTime()), 0);
}

/** When a bought "see who liked you" pass ends (shared/single-purchases.ts), if any. */
export async function likesPassUntil(userId: string): Promise<Date | null> {
  const [p] = await db.select({ until: profiles.seeLikesUntil }).from(profiles).where(eq(profiles.userId, userId));
  return p?.until ?? null;
}

async function oldestInterviewInWindow(userId: string, since: Date): Promise<Date | undefined> {
  const [row] = await db
    .select({ createdAt: interviews.createdAt })
    .from(interviews)
    .where(and(eq(interviews.requesterId, userId), gte(interviews.createdAt, since)))
    .orderBy(asc(interviews.createdAt))
    .limit(1);
  return row?.createdAt ?? undefined;
}

async function oldestStoryReplyInWindow(userId: string, since: Date): Promise<Date | undefined> {
  const [row] = await db
    .select({ createdAt: storyComments.createdAt })
    .from(storyComments)
    .where(and(eq(storyComments.userId, userId), gte(storyComments.createdAt, since)))
    .orderBy(asc(storyComments.createdAt))
    .limit(1);
  return row?.createdAt ?? undefined;
}

async function oldestChatRequestInWindow(userId: string, since: Date): Promise<Date | undefined> {
  const [row] = await db
    .select({ createdAt: chatRequests.createdAt })
    .from(chatRequests)
    .where(and(eq(chatRequests.requesterId, userId), gte(chatRequests.createdAt, since)))
    .orderBy(asc(chatRequests.createdAt))
    .limit(1);
  return row?.createdAt ?? undefined;
}

// Pure booleans (see_who_asked, full read_transcript, host_event) gate on tier.
// create_group is a "can, up to N" — a boolean floor AND a count cap (Flame = 3).
// The rest (likes, interviews, room membership) are metered on a count vs the
// tier limit. Lounge posting itself is never metered — only how many rooms
// you're in at once (join_group / groupsMax).
export async function checkGate(
  userId: string,
  feature: Feature,
  opts: { countOverride?: number } = {},
): Promise<GateResult> {
  const tier = await getEffectiveTier(userId);
  const limits = LIMITS[tier];
  const dailyReset = feature === "daily_likes" || feature === "daily_passes" || feature === "video_call";

  // Starting a video date needs a plan someone paid for: a trial or a free
  // week doesn't open it, whatever tier it carries. (Answering is free.)
  if (feature === "video_call" && tier !== "free" && !(await onPaidPlan(userId))) {
    return {
      ok: false,
      tier,
      limit: 0,
      requiredTier: "spark",
      unpaid: true,
      message: "Video dates are for members on a paid plan. Your free time covers everything else, and you can still answer when a match calls you.",
    };
  }

  // A bought 24-hour pass (server/single-purchases.ts) opens "see who liked you".
  if (feature === "see_who_asked" && !limits.seeWhoAsked) {
    const until = await likesPassUntil(userId);
    if (until && until.getTime() > Date.now()) return { ok: true, tier, limit: null };
  }

  const boolMap: Partial<Record<Feature, boolean>> = {
    see_who_asked: limits.seeWhoAsked,
    proximity_identity: limits.seeWhoAsked, // same gate: Spark+ sees the person behind an alert
    read_transcript: limits.transcriptLines == null,
    host_event: limits.canHostEvent,
    see_story_engagers: limits.seeStoryEngagers,
    advanced_filters: tierRank(tier) >= tierRank(FEATURE_MIN_TIER.advanced_filters),
  };
  if (feature in boolMap) {
    const allowed = boolMap[feature]!;
    return allowed
      ? { ok: true, tier, limit: null }
      : {
          ok: false,
          tier,
          limit: null,
          requiredTier: FEATURE_MIN_TIER[feature],
          message: gateCopy(feature, { tier }).line,
        };
  }

  if (feature === "create_group") {
    const cap = limits.groupsCreatedMax; // 0 / 0 / 3 / null (unlimited)
    if (cap == null) return { ok: true, tier, limit: null };
    if (cap <= 0) {
      return {
        ok: false,
        tier,
        limit: 0,
        requiredTier: FEATURE_MIN_TIER.create_group,
        message: gateCopy("create_group", { tier }).line,
      };
    }
    const owned = opts.countOverride ?? (await usage(userId, "create_group"));
    if (owned < cap) return { ok: true, tier, limit: cap, used: owned };
    return {
      ok: false,
      tier,
      limit: cap,
      used: owned,
      requiredTier: nextTierUp(tier),
      message: `You've created ${cap} rooms — that's the ${TIER_LABEL(tier)} limit. ${TIER_LABEL(nextTierUp(tier))} lifts it.`,
    };
  }

  const limit =
    feature === "daily_likes"
      ? limits.dailyLikes
      : feature === "daily_passes"
        ? limits.dailyPasses
      : feature === "start_interview"
        ? limits.weeklyInterviews
        : feature === "join_group"
          ? limits.groupsMax
          : feature === "story_reply"
            ? limits.storyRepliesPerWeek
            : feature === "group_chat_request"
              ? limits.groupChatRequestsPerWeek
              : feature === "video_call"
                ? limits.videoMinutesPerDay
                : null;

  if (limit == null) return { ok: true, tier, limit: null };
  const used = opts.countOverride ?? (await usage(userId, feature));
  if (used < limit) return { ok: true, tier, limit, used };

  const resetAt = dailyReset
    ? nextMidnightISO(await userTimezone(userId))
    : feature === "start_interview"
      ? await rollingWindowResetAt(userId, 7, oldestInterviewInWindow)
      : feature === "story_reply"
        ? await rollingWindowResetAt(userId, 7, oldestStoryReplyInWindow)
        : feature === "group_chat_request"
          ? await rollingWindowResetAt(userId, 7, oldestChatRequestInWindow)
          : undefined;
  return {
    ok: false,
    tier,
    limit,
    used,
    resetAt,
    requiredTier: nextTierUp(tier),
    message: gateCopy(feature, { tier, limit, used, resetLabel: resetLabelFromISO(resetAt) }).line,
  };
}

function TIER_LABEL(t: Tier): string {
  return t[0].toUpperCase() + t.slice(1);
}

function nextTierUp(t: Tier): Tier {
  const order: Tier[] = ["free", "spark", "flame", "ember"];
  return order[Math.min(order.indexOf(t) + 1, order.length - 1)];
}

// The consistent, machine-readable 403 body. Extends the shape Discover already
// expects ({ upgradeRequired, message }).
/** The refusal copy for a gate result. Someone on free time is offered
 *  the plans as if they were on free: those are what they'd pay for. */
export function gateCopyFor(g: GateResult, feature: Feature) {
  const copy = gateCopy(feature, g.unpaid
    ? { tier: "free", limit: 0 }
    : { tier: g.tier, limit: g.limit, used: g.used, resetLabel: resetLabelFromISO(g.resetAt) });
  return g.unpaid && g.message ? { ...copy, line: g.message } : copy;
}

export function gateBody(g: GateResult, feature: Feature) {
  const copy = gateCopyFor(g, feature);
  return {
    upgradeRequired: true,
    feature,
    action: copy.action,
    currentTier: g.tier,
    requiredTier: g.requiredTier ?? copy.requiredTier,
    requiredTierName: copy.requiredTierName,
    requiredPrice: copy.requiredPrice,
    message: g.message ?? copy.line,
    ...(g.resetAt ? { resetAt: g.resetAt } : {}),
    ...(g.limit != null ? { limit: g.limit } : {}),
    ...(g.used != null ? { used: g.used } : {}),
  };
}

// Sugar for a route handler: `if (await denyIfGated(res, userId, "host_event")) return;`
export async function denyIfGated(res: any, userId: string, feature: Feature): Promise<boolean> {
  const g = await checkGate(userId, feature);
  if (!g.ok) {
    res.status(403).json(gateBody(g, feature));
    return true;
  }
  return false;
}
