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
import { subscriptions, profiles, interviews, groupMembers, dailyLikeCounts } from "@shared/schema";
import { and, eq, gte, count } from "drizzle-orm";
import { LIMITS, tierRank, FEATURE_MIN_TIER, type Tier, type Feature } from "@shared/entitlements";

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

/** Local midnight tonight, ISO — "your next likes land at …". Server TZ. */
export function nextMidnightISO(): string {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
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
    default:
      return 0;
  }
}

// Boolean features (see_who_asked, read_transcript full, host_event, create_group)
// gate on tier rank. Metered features (likes, interviews, group membership) gate
// on a count vs the tier limit.
export async function checkGate(
  userId: string,
  feature: Feature,
  opts: { countOverride?: number } = {},
): Promise<GateResult> {
  const tier = await getEffectiveTier(userId);
  const limits = LIMITS[tier];

  const boolMap: Partial<Record<Feature, boolean>> = {
    see_who_asked: limits.seeWhoAsked,
    read_transcript: limits.transcriptLines == null,
    host_event: limits.canHostEvent,
    create_group: limits.groupsCreatedMax > 0,
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
          message: upgradeMessage(feature, FEATURE_MIN_TIER[feature]),
        };
  }

  const limit =
    feature === "daily_likes"
      ? limits.dailyLikes
      : feature === "start_interview"
        ? limits.weeklyInterviews
        : feature === "join_group"
          ? limits.groupsMax
          : feature === "lounge_post"
            ? limits.loungePostsPerDay
            : null;

  if (limit == null) return { ok: true, tier, limit: null };
  const used = opts.countOverride ?? (await usage(userId, feature));
  if (used < limit) return { ok: true, tier, limit, used };

  return {
    ok: false,
    tier,
    limit,
    used,
    resetAt: feature === "daily_likes" || feature === "lounge_post" ? nextMidnightISO() : undefined,
    requiredTier: nextTierUp(tier),
    message: meteredMessage(feature, limit, feature === "daily_likes" || feature === "lounge_post"),
  };
}

function nextTierUp(t: Tier): Tier {
  const order: Tier[] = ["free", "spark", "flame", "ember"];
  return order[Math.min(order.indexOf(t) + 1, order.length - 1)];
}

function upgradeMessage(feature: Feature, req: Tier): string {
  const name = req[0].toUpperCase() + req.slice(1);
  switch (feature) {
    case "see_who_asked":
      return `${name} shows you who asked to meet you, not just that someone did.`;
    case "read_transcript":
      return `${name} opens the whole conversation your twins had.`;
    case "host_event":
      return `Hosting events is a ${name} thing.`;
    case "create_group":
      return `Creating groups starts on ${name}.`;
    default:
      return `That's a ${name} feature.`;
  }
}
function meteredMessage(feature: Feature, limit: number, resets: boolean): string {
  const when = resets ? " Your next ones land at midnight." : "";
  switch (feature) {
    case "daily_likes":
      return `That's your ${limit} likes for today.${when}`;
    case "start_interview":
      return `You've started ${limit} twin interviews this week. More room on the next tier.`;
    case "join_group":
      return `You're in ${limit} groups — the most this plan allows. Leave one, or move up a tier.`;
    case "lounge_post":
      return `That's your ${limit} Lounge ${limit === 1 ? "post" : "posts"} for today.${when}`;
    default:
      return "You've hit this plan's limit here.";
  }
}

// The consistent, machine-readable 403 body. Extends the shape Discover already
// expects ({ upgradeRequired, message }).
export function gateBody(g: GateResult, feature: Feature) {
  return {
    upgradeRequired: true,
    feature,
    currentTier: g.tier,
    requiredTier: g.requiredTier ?? "spark",
    message: g.message ?? "Upgrade to keep going.",
    ...(g.resetAt ? { resetAt: g.resetAt } : {}),
    ...(g.limit != null ? { limit: g.limit } : {}),
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
