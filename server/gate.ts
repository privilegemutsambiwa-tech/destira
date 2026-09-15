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
import { subscriptions, profiles, interviews, groupMembers, groups, dailyLikeCounts } from "@shared/schema";
import { and, eq, gte, count } from "drizzle-orm";
import { LIMITS, tierRank, FEATURE_MIN_TIER, gateCopy, type Tier, type Feature } from "@shared/entitlements";

/** "at midnight" / "at 6:00 PM" from an ISO instant — mirrors the client's
 *  resetLabel so the 403 body and the sheet agree. */
export function resetLabelFromISO(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getHours() === 0) return "at midnight";
  return `at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
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

async function userTimezone(userId: string): Promise<string | null> {
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
}

async function usage(userId: string, feature: Feature): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  switch (feature) {
    case "daily_likes":
      return db
        .select({ n: dailyLikeCounts.count })
        .from(dailyLikeCounts)
        .where(and(eq(dailyLikeCounts.userId, userId), eq(dailyLikeCounts.date, new Date().toISOString().slice(0, 10))))
        .then((r) => r[0]?.n ?? 0);
    case "start_interview":
      return db
        .select({ n: count() })
        .from(interviews)
        .where(and(eq(interviews.requesterId, userId), gte(interviews.createdAt, weekAgo)))
        .then((r) => Number(r[0]?.n ?? 0));
    case "join_group":
      return db
        .select({ n: count() })
        .from(groupMembers)
        .where(eq(groupMembers.userId, userId))
        .then((r) => Number(r[0]?.n ?? 0));
    case "create_group":
      return db
        .select({ n: count() })
        .from(groups)
        .where(eq(groups.ownerId, userId))
        .then((r) => Number(r[0]?.n ?? 0));
    default:
      return 0;
  }
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
  const dailyReset = feature === "daily_likes";

  const boolMap: Partial<Record<Feature, boolean>> = {
    see_who_asked: limits.seeWhoAsked,
    proximity_identity: limits.seeWhoAsked, // same gate: Spark+ sees the person behind an alert
    read_transcript: limits.transcriptLines == null,
    host_event: limits.canHostEvent,
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
      : feature === "start_interview"
        ? limits.weeklyInterviews
        : feature === "join_group"
          ? limits.groupsMax
          : null;

  if (limit == null) return { ok: true, tier, limit: null };
  const used = opts.countOverride ?? (await usage(userId, feature));
  if (used < limit) return { ok: true, tier, limit, used };

  const resetAt = dailyReset ? nextMidnightISO(await userTimezone(userId)) : undefined;
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
export function gateBody(g: GateResult, feature: Feature) {
  const copy = gateCopy(feature, {
    tier: g.tier,
    limit: g.limit,
    used: g.used,
    resetLabel: resetLabelFromISO(g.resetAt),
  });
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
