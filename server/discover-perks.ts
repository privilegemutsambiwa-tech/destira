// Rewind, super like and boost (docs/destira-3-upgrade-prompt.md Part D5-D7).
//
// - Undo right after a pass stays free for everyone (UNDO_WINDOW_MS).
//   Bringing someone back after that is a rewind: Spark 1 a day, Flame and
//   Ember no limit.
// - A super like is a like the receiver sees first, marked as one. Flame
//   gets a few a week, Ember more; bought ones (profiles.superMatchesRemaining)
//   are used once the week's are gone.
// - A boost puts the member at the front of decks near them for 30 minutes.
//   Ember gets one a week; bought ones (profiles.boostsRemaining) on top.
//   It's real placement only: the member must already be someone that
//   viewer's deck would show (same query, filters, blocks and passes), and
//   the member who boosted sees how many decks it reached.
import type { Express } from "express";
import { and, count, desc, eq, gt, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { discoverBoosts, discoverBoostViews, discoverPasses, discoverRewinds, matches, profiles } from "@shared/schema";
import { LIMITS, TIERS, TIER_NAME, priceLabel, type Tier } from "@shared/entitlements";
import { storage } from "./storage";
import * as gate from "./gate";
import * as push from "./push";
import * as safety from "./safety";

export const UNDO_WINDOW_MS = 10 * 60 * 1000;
export const BOOST_MS = 30 * 60 * 1000;
/** Boosted people placed at the front of one deck, at most. */
const BOOSTS_PER_DECK = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const rows = (r: any) => (r?.rows ?? r ?? []) as any[];

async function dayStart(userId: string): Promise<Date> {
  return new Date(new Date(gate.nextMidnightISO(await gate.userTimezone(userId))).getTime() - 24 * 60 * 60 * 1000);
}

function deckSeed(userId: string, tz: string | null | undefined) {
  return `${userId}:${gate.localDayKey(tz)}`;
}

/**
 * The 403 for a perk. Without a message it's "your plan doesn't include
 * this" (the gate copy, pointing at the plan that does). With one, the plan
 * includes it but it's used up, and the button points one plan up.
 */
function refused(tier: Tier, feature: "rewind" | "super_like" | "boost", message?: string, resetAt?: string) {
  const body: any = gate.gateBody({ ok: false, tier, limit: null, message, resetAt } as any, feature);
  if (message) {
    const up = TIERS[Math.min(TIERS.indexOf(tier) + 1, TIERS.length - 1)];
    if (up === tier) {
      delete body.requiredTier;
      delete body.requiredTierName;
      delete body.requiredPrice;
    } else {
      body.requiredTier = up;
      body.requiredTierName = TIER_NAME[up];
      body.requiredPrice = priceLabel(LIMITS[up].priceCents);
    }
  }
  return { status: 403, body };
}

// ── Rewind ────────────────────────────────────────────────────────

async function rewindsToday(userId: string): Promise<number> {
  const since = await dayStart(userId);
  const [r] = await db.select({ n: count() }).from(discoverRewinds)
    .where(and(eq(discoverRewinds.userId, userId), gte(discoverRewinds.createdAt, since)));
  return Number(r?.n ?? 0);
}

/** null = allowed; otherwise the 403 to send. */
async function rewindRefusal(userId: string, tier: Tier) {
  const limit = LIMITS[tier].dailyRewinds;
  if (limit === 0) return refused(tier, "rewind");
  if (limit == null) return null;
  if ((await rewindsToday(userId)) < limit) return null;
  const resetAt = gate.nextMidnightISO(await gate.userTimezone(userId));
  return refused(tier, "rewind", `That's today's rewind on ${TIER_NAME[tier]}. Another one tomorrow, or Flame brings back as many as you like.`, resetAt);
}

/**
 * Takes a pass back. Inside UNDO_WINDOW_MS of the pass it's the free undo;
 * after that it's a rewind (counted, and refused on Free).
 */
export async function undoOrRewind(userId: string, targetId: string): Promise<{ status: number; body: any }> {
  // Compared in the database: the pass time came from its clock.
  const [pass] = await db.select({
    fresh: sql<boolean>`${discoverPasses.createdAt} > now() - make_interval(secs => ${UNDO_WINDOW_MS / 1000})`,
  }).from(discoverPasses)
    .where(and(eq(discoverPasses.userId, userId), eq(discoverPasses.targetId, targetId)));
  if (!pass) return { status: 200, body: { ok: true } };
  const fresh = !!pass.fresh;
  if (!fresh) {
    const tier = await gate.getEffectiveTier(userId);
    const no = await rewindRefusal(userId, tier);
    if (no) return no;
    await db.insert(discoverRewinds).values({ userId, targetId, createdAt: new Date() });
  }
  await storage.undoDiscoverPass(userId, targetId);
  return { status: 200, body: { ok: true, rewind: !fresh } };
}

/**
 * The newest pass whose person this deck would still show: their pass is
 * removed, a rewind recorded, and their card returned for the front of the
 * deck. Passes on people who've left or that the filters now hide are
 * skipped (and kept).
 */
async function rewindLast(userId: string, lat?: number, lng?: number) {
  const recent = await db.select({ targetId: discoverPasses.targetId, createdAt: discoverPasses.createdAt })
    .from(discoverPasses).where(eq(discoverPasses.userId, userId))
    .orderBy(desc(discoverPasses.createdAt)).limit(10);
  const seed = deckSeed(userId, await gate.userTimezone(userId));
  for (const p of recent) {
    await storage.undoDiscoverPass(userId, p.targetId);
    const { profiles: found } = await storage.getDiscoverableProfiles(userId, undefined, lat, lng, null, 1, seed, { onlyUserIds: [p.targetId] });
    if (found.length > 0) {
      await db.insert(discoverRewinds).values({ userId, targetId: p.targetId, createdAt: new Date() });
      return found[0];
    }
    await db.insert(discoverPasses).values({ userId, targetId: p.targetId, createdAt: p.createdAt }).onConflictDoNothing();
  }
  return null;
}

// ── Super like ────────────────────────────────────────────────────

async function superLikesThisWeek(userId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(matches)
    .where(and(eq(matches.user1Id, userId), eq(matches.isSuper, true), sql`${matches.createdAt} > now() - interval '7 days'`));
  return Number(r?.n ?? 0);
}

/** Uses one: the week's from the plan first, then a bought one. */
async function spendSuperLike(userId: string, tier: Tier): Promise<"plan" | "credit" | null> {
  if ((await superLikesThisWeek(userId)) < LIMITS[tier].superLikesPerWeek) return "plan";
  const r = rows(await db.execute(sql`
    update ${profiles} set super_matches_remaining = super_matches_remaining - 1
    where ${profiles.userId} = ${userId} and coalesce(super_matches_remaining, 0) > 0
    returning super_matches_remaining`));
  return r.length > 0 ? "credit" : null;
}

// ── Boost ─────────────────────────────────────────────────────────

async function activeBoost(userId: string) {
  const [b] = await db.select().from(discoverBoosts)
    .where(and(eq(discoverBoosts.userId, userId), gt(discoverBoosts.endsAt, new Date())))
    .orderBy(desc(discoverBoosts.endsAt)).limit(1);
  return b ?? null;
}

async function boostsThisWeek(userId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(discoverBoosts)
    .where(and(eq(discoverBoosts.userId, userId), eq(discoverBoosts.source, "plan"), gte(discoverBoosts.startedAt, new Date(Date.now() - WEEK_MS))));
  return Number(r?.n ?? 0);
}

async function boostViews(boostId: number): Promise<number> {
  const [r] = await db.select({ n: count() }).from(discoverBoostViews).where(eq(discoverBoostViews.boostId, boostId));
  return Number(r?.n ?? 0);
}

let boostedCache: { at: number; ids: Map<string, number> } | null = null;
/** Who's boosted right now (userId → boostId), cached for 20 seconds. */
async function boostedNow(): Promise<Map<string, number>> {
  if (boostedCache && Date.now() - boostedCache.at < 20_000) return boostedCache.ids;
  const live = await db.select({ id: discoverBoosts.id, userId: discoverBoosts.userId }).from(discoverBoosts)
    .where(gt(discoverBoosts.endsAt, new Date()));
  boostedCache = { at: Date.now(), ids: new Map(live.map((b) => [b.userId, b.id])) };
  return boostedCache.ids;
}
function forgetBoostCache() {
  boostedCache = null;
}

/**
 * First page of a deck: put up to BOOSTS_PER_DECK boosted members this deck
 * would show anyway right after any super likes, and count the view.
 */
export async function applyBoosts(viewerId: string, page: any[], filter: string | undefined, lat?: number, lng?: number): Promise<any[]> {
  const live = await boostedNow();
  const ids = [...live.keys()].filter((id) => id !== viewerId);
  if (ids.length === 0) return page;
  const seed = deckSeed(viewerId, await gate.userTimezone(viewerId));
  const { profiles: found } = await storage.getDiscoverableProfiles(viewerId, filter, lat, lng, null, BOOSTS_PER_DECK, seed, { onlyUserIds: ids });
  if (found.length === 0) return page;
  const lifted = new Set(found.map((p: any) => p.userId));
  const rest = page.filter((p) => !lifted.has(p.userId));
  const supers = rest.filter((p) => p.superLiked).length;
  // Super likes keep the very front; boosts come straight after.
  const leading = rest.slice(0, supers);
  await db.insert(discoverBoostViews)
    .values(found.map((p: any) => ({ boostId: live.get(p.userId)!, viewerId })))
    .onConflictDoNothing();
  return [...leading, ...found, ...rest.slice(supers)];
}

/** Later pages: drop anyone boosted, who may already be on page one. */
export async function dropBoosted(viewerId: string, page: any[]): Promise<any[]> {
  const live = await boostedNow();
  if (live.size === 0) return page;
  return page.filter((p) => !live.has(p.userId) || p.userId === viewerId);
}

// ── State ─────────────────────────────────────────────────────────

export async function perksState(userId: string) {
  const tier = await gate.getEffectiveTier(userId);
  const L = LIMITS[tier];
  const [p] = await db.select({ supers: profiles.superMatchesRemaining, boosts: profiles.boostsRemaining })
    .from(profiles).where(eq(profiles.userId, userId));
  const [rewUsed, superUsed, boostUsed, boost] = await Promise.all([
    rewindsToday(userId), superLikesThisWeek(userId), boostsThisWeek(userId), activeBoost(userId),
  ]);
  return {
    tier,
    rewind: { perDay: L.dailyRewinds, usedToday: rewUsed },
    superLike: {
      perWeek: L.superLikesPerWeek,
      usedThisWeek: superUsed,
      bought: p?.supers ?? 0,
      left: Math.max(0, L.superLikesPerWeek - superUsed) + (p?.supers ?? 0),
    },
    boost: {
      perWeek: L.boostsPerWeek,
      usedThisWeek: boostUsed,
      bought: p?.boosts ?? 0,
      left: Math.max(0, L.boostsPerWeek - boostUsed) + (p?.boosts ?? 0),
      active: boost ? { endsAt: boost.endsAt.toISOString(), shownTo: await boostViews(boost.id) } : null,
    },
  };
}

// ── Routes ────────────────────────────────────────────────────────

export function registerDiscoverPerkRoutes(
  app: Express,
  getUserId: (req: any) => string | null,
  decorate: (viewerId: string, cards: any[]) => Promise<any[]>,
) {
  app.get("/api/discover/perks", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    res.json(await perksState(userId));
  });

  app.post("/api/discover/rewind", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const tier = await gate.getEffectiveTier(userId);
      const no = await rewindRefusal(userId, tier);
      if (no) return res.status(no.status).json(no.body);
      const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
      const card = await rewindLast(userId, Number.isFinite(lat) ? lat : undefined, Number.isFinite(lng) ? lng : undefined);
      if (!card) return res.status(404).json({ message: "Nobody to bring back. The people you passed on have left, or your filters hide them now." });
      const [decorated] = await decorate(userId, [card]);
      res.json({ profile: decorated, perks: await perksState(userId) });
    } catch (e) {
      console.error("Rewind error:", e);
      res.status(500).json({ message: "Couldn't bring them back" });
    }
  });

  app.post("/api/discover/super-like", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const targetId = typeof req.body?.targetId === "string" ? req.body.targetId : "";
    if (!targetId || targetId === userId) return res.status(400).json({ message: "targetId is required" });
    if (await safety.blockIfHeld(res, userId)) return;
    try {
      if ((await storage.isBlocked(targetId, userId)) || (await storage.isBlocked(userId, targetId))) {
        return res.status(403).json({ message: "Cannot connect with this user" });
      }
      const existing = await storage.getActiveMatchBetweenUsers(userId, targetId);
      // They already liked you: a plain like makes the match, so nothing is
      // spent. The client sends the regular like.
      if (existing && existing.status === "pending" && existing.user1Id === targetId) {
        return res.status(409).json({ code: "liked_you", message: "They already liked you. Liking them back makes it a match." });
      }
      if (existing) return res.status(409).json({ message: "Match request already exists", match: existing });

      const tier = await gate.getEffectiveTier(userId);
      const source = await spendSuperLike(userId, tier);
      if (!source) {
        const perWeek = LIMITS[tier].superLikesPerWeek;
        return res.status(403).json(
          perWeek > 0
            ? refused(tier, "super_like", `That's this week's ${perWeek} super likes on ${TIER_NAME[tier]}. They come back a week after each one was sent.`).body
            : refused(tier, "super_like").body,
        );
      }
      const match = await storage.createMatch(userId, targetId);
      const [marked] = await db.update(matches).set({ isSuper: true }).where(eq(matches.id, match.id)).returning();
      res.status(201).json({ match: marked, source, perks: await perksState(userId) });
      safety.checkLikeBurst(userId).catch(() => {});
      const me = await storage.getProfile(userId);
      const first = (me?.displayName || "Someone").trim().split(/\s+/)[0];
      // A super like is meant to be seen: the name goes in, unlike a plain like.
      push.sendCategorizedPush(targetId, "matches", {
        title: `${first} super liked you`,
        body: "They're first in your Discover. Like them back and it's a match.",
        url: "/discover",
        tag: `super-${userId}`,
      }).catch(() => {});
    } catch (e) {
      console.error("Super like error:", e);
      res.status(500).json({ message: "Couldn't send that super like" });
    }
  });

  app.post("/api/discover/boost", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const on = await activeBoost(userId);
      if (on) return res.status(409).json({ message: "Your boost is already on.", perks: await perksState(userId) });
      const tier = await gate.getEffectiveTier(userId);
      let source: "plan" | "credit" | null = null;
      if ((await boostsThisWeek(userId)) < LIMITS[tier].boostsPerWeek) source = "plan";
      else {
        const r = rows(await db.execute(sql`
          update ${profiles} set boosts_remaining = boosts_remaining - 1
          where ${profiles.userId} = ${userId} and coalesce(boosts_remaining, 0) > 0
          returning boosts_remaining`));
        if (r.length > 0) source = "credit";
      }
      if (!source) {
        const perWeek = LIMITS[tier].boostsPerWeek;
        return res.status(403).json(
          perWeek > 0
            ? refused(tier, "boost", `You've used this week's boost. The next one is ready a week after the last.`).body
            : refused(tier, "boost").body,
        );
      }
      const now = new Date();
      await db.insert(discoverBoosts).values({ userId, source, startedAt: now, endsAt: new Date(now.getTime() + BOOST_MS) });
      forgetBoostCache();
      res.status(201).json({ source, perks: await perksState(userId) });
    } catch (e) {
      console.error("Boost error:", e);
      res.status(500).json({ message: "Couldn't start your boost" });
    }
  });
}
