// Destira Friends (docs/destira-3-upgrade-prompt.md Part O, O1): its own deck,
// waves instead of likes, friendships as their own kind of chat.
//   GET  /api/friends/deck           people here for friends, best fit first
//   GET  /api/friends/waves          who waved at you (free, with names)
//   POST /api/friends/wave/:userId   wave; two waves make friends
//   POST /api/friends/pass/:userId   "not now", Friends side only
import type { Express, Request } from "express";
import { and, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { blockedUsers, friendPasses, friendWaves, matches, profiles, twinProfilesStructured } from "@shared/schema";
import { ageFromDob } from "@shared/essentials";
import { lookingForOf, wantsFriends, wantsLove, type FriendCard } from "@shared/friends";
import { storage } from "../storage";
import { notify, sendCategorizedPush } from "../push";
import * as safety from "../safety";

const DECK_SIZE = 30;
const POOL = 400;

const firstName = (n: string | null | undefined) => (n || "Someone").trim().split(/\s+/)[0] || "Someone";

function ageOf(p: { age: number | null; dateOfBirth?: string | null }): number | null {
  if (p.dateOfBirth) return ageFromDob(p.dateOfBirth) ?? p.age ?? null;
  return p.age ?? null;
}

/**
 * Why two people can't be put together on the dating side, or null if they
 * can. Someone here for friends only never gets a like or an introduction.
 */
export async function loveBlockedReason(fromId: string, toId: string): Promise<string | null> {
  const rows = await db.select({ userId: profiles.userId, lookingFor: profiles.lookingFor }).from(profiles)
    .where(inArray(profiles.userId, [fromId, toId]));
  const of = (id: string) => rows.find((r) => r.userId === id)?.lookingFor;
  if (!wantsLove(of(fromId))) return "You're here for friends. Switch to Love or Both in Settings to date.";
  if (!wantsLove(of(toId))) return "They're here for friends, not dating.";
  return null;
}

async function blockedIds(userId: string): Promise<Set<string>> {
  const rows = await db.select({ a: blockedUsers.blockerId, b: blockedUsers.blockedId }).from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId)));
  return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
}

async function interestsOf(ids: string[]): Promise<Map<string, string[]>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ userId: twinProfilesStructured.userId, interests: twinProfilesStructured.interests })
    .from(twinProfilesStructured).where(inArray(twinProfilesStructured.userId, ids));
  return new Map(rows.map((r) => [r.userId, (r.interests ?? []).filter((i) => typeof i === "string" && i.trim()).slice(0, 8)]));
}

const areaOf = (p: { locationName?: string | null; location?: string | null }) =>
  (p.locationName || p.location || "").split(",")[0].trim() || null;

/**
 * The Friends deck: people who are here for friends (or both), any gender,
 * not blocked, not already waved at, passed or friends. Those who waved at
 * you come first; then shared interests, the same area and a similar age.
 */
export async function friendsDeck(userId: string): Promise<{ on: boolean; cards: FriendCard[] }> {
  const me = await storage.getProfile(userId);
  if (!me || !wantsFriends(me.lookingFor)) return { on: false, cards: [] };

  const [blocked, myWaves, passes, theirWaves, connected] = await Promise.all([
    blockedIds(userId),
    db.select({ id: friendWaves.toId }).from(friendWaves).where(eq(friendWaves.fromId, userId)),
    db.select({ id: friendPasses.targetId }).from(friendPasses).where(eq(friendPasses.userId, userId)),
    db.select({ id: friendWaves.fromId }).from(friendWaves).where(eq(friendWaves.toId, userId)),
    db.select({ a: matches.user1Id, b: matches.user2Id }).from(matches)
      .where(and(eq(matches.status, "matched"), or(eq(matches.user1Id, userId), eq(matches.user2Id, userId)))),
  ]);
  const exclude = new Set<string>([
    userId, ...Array.from(blocked), ...myWaves.map((r) => r.id), ...passes.map((r) => r.id),
    ...connected.map((r) => (r.a === userId ? r.b : r.a)),
  ]);
  const wavedAtMe = new Set(theirWaves.map((r) => r.id));

  const pool = await db.select({
    userId: profiles.userId, displayName: profiles.displayName, age: profiles.age, dateOfBirth: profiles.dateOfBirth,
    location: profiles.location, locationName: profiles.locationName, bio: profiles.bio, isVerified: profiles.isVerified,
    isPublic: profiles.isPublic, coverPhotoUrl: profiles.coverPhotoUrl,
  }).from(profiles).where(and(
    eq(profiles.onboardingCompleted, true), eq(profiles.isPublic, true), eq(profiles.moderationStatus, "active"),
    inArray(profiles.lookingFor, ["friends", "both"]),
    notInArray(profiles.userId, Array.from(exclude)),
  )).orderBy(desc(profiles.createdAt)).limit(POOL);

  const ids = pool.map((p) => p.userId);
  const interests = await interestsOf([userId, ...ids]);
  const mine = new Set((interests.get(userId) ?? []).map((i) => i.toLowerCase()));
  const myAge = ageOf(me as any);
  const myArea = areaOf(me as any)?.toLowerCase() ?? null;

  const scored = pool.map((p) => {
    const theirs = interests.get(p.userId) ?? [];
    const shared = theirs.filter((i) => mine.has(i.toLowerCase()));
    const age = ageOf(p);
    const area = areaOf(p);
    let score = shared.length * 3;
    if (myArea && area && area.toLowerCase() === myArea) score += 4;
    if (myAge != null && age != null) score -= Math.min(10, Math.abs(age - myAge)) / 2;
    if (p.isVerified) score += 1;
    if (wavedAtMe.has(p.userId)) score += 100;
    return { p, theirs, shared, age, area, score };
  }).sort((a, b) => b.score - a.score).slice(0, DECK_SIZE);

  const photos = await storage.resolveProfilePhotos(scored.map(({ p }) => ({
    userId: p.userId, isPublic: p.isPublic, coverPhotoUrl: p.coverPhotoUrl ?? null, profileImageUrl: null,
  })));
  return {
    on: true,
    cards: scored.map(({ p, theirs, shared, age, area }) => ({
      userId: p.userId,
      name: firstName(p.displayName),
      age,
      area,
      photoUrl: photos.get(p.userId) ?? p.coverPhotoUrl ?? null,
      bio: p.bio ? p.bio.slice(0, 280) : null,
      interests: theirs,
      shared,
      isVerified: !!p.isVerified,
      wavedAtYou: wavedAtMe.has(p.userId),
    })),
  };
}

export type WaveOutcome = { status: "waved" } | { status: "friends"; matchId: number };

/** A wave. If they'd already waved, it's a friendship: one chat, made once. */
export async function wave(fromId: string, toId: string): Promise<WaveOutcome | { error: number; message: string }> {
  if (fromId === toId) return { error: 400, message: "That's you." };
  const rows = await db.select({ userId: profiles.userId, lookingFor: profiles.lookingFor, name: profiles.displayName, moderationStatus: profiles.moderationStatus, onboardingCompleted: profiles.onboardingCompleted })
    .from(profiles).where(inArray(profiles.userId, [fromId, toId]));
  const me = rows.find((r) => r.userId === fromId);
  const them = rows.find((r) => r.userId === toId);
  if (!me || !wantsFriends(me.lookingFor)) return { error: 403, message: "Turn on Friends in Settings to wave at people." };
  if (!them || them.moderationStatus !== "active" || !them.onboardingCompleted) return { error: 404, message: "This profile isn't available." };
  if (!wantsFriends(them.lookingFor)) return { error: 403, message: "They're not looking for friends right now." };
  if ((await blockedIds(fromId)).has(toId)) return { error: 403, message: "Cannot connect with this user" };

  await db.insert(friendWaves).values({ fromId, toId }).onConflictDoNothing();
  const [back] = await db.select({ id: friendWaves.id }).from(friendWaves).where(and(eq(friendWaves.fromId, toId), eq(friendWaves.toId, fromId)));
  if (!back) {
    sendCategorizedPush(toId, "matches", {
      title: `${firstName(me.name)} waved at you`,
      body: "On Friends. Wave back and you can chat.",
      url: "/friends",
      tag: "friend-waves",
    }).catch(() => {});
    return { status: "waved" };
  }

  // Two waves. One chat per pair: if they're already connected (a dating
  // match, or this ran twice at once) that chat stands.
  const made = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${[fromId, toId].sort().join(":")}))`);
    const [existing] = await tx.select({ id: matches.id }).from(matches).where(and(
      eq(matches.status, "matched"),
      or(and(eq(matches.user1Id, fromId), eq(matches.user2Id, toId)), and(eq(matches.user1Id, toId), eq(matches.user2Id, fromId))),
    ));
    if (existing) return { id: existing.id, fresh: false };
    const [m] = await tx.insert(matches).values({ user1Id: toId, user2Id: fromId, status: "matched", kind: "friends" }).returning({ id: matches.id });
    return { id: m.id, fresh: true };
  });
  if (made.fresh) {
    for (const [to, other] of [[fromId, them.name], [toId, me.name]] as const) {
      notify(to, "matches", {
        type: "friend",
        title: `You and ${firstName(other)} are friends on Destira`,
        body: "Say hi. Plan a coffee, a walk, a match on TV.",
        url: `/chat/${made.id}`,
        tag: `friends-${made.id}`,
      }).catch(() => {});
    }
  }
  return { status: "friends", matchId: made.id };
}

export function registerFriendRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  app.get("/api/friends/deck", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await friendsDeck(userId));
    } catch (e) {
      console.error("[friends] deck failed:", e);
      res.status(500).json({ message: "Couldn't load Friends" });
    }
  });

  app.get("/api/friends/waves", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const deck = await friendsDeck(userId);
      res.json(deck.cards.filter((c) => c.wavedAtYou));
    } catch (e) {
      console.error("[friends] waves failed:", e);
      res.status(500).json({ message: "Couldn't load your waves" });
    }
  });

  app.post("/api/friends/wave/:userId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (await safety.blockIfHeld(res, userId)) return;
    try {
      const out = await wave(userId, String(req.params.userId));
      if ("error" in out) return res.status(out.error).json({ message: out.message });
      res.status(out.status === "friends" ? 200 : 201).json(out);
    } catch (e) {
      console.error("[friends] wave failed:", e);
      res.status(500).json({ message: "Couldn't send that wave" });
    }
  });

  app.post("/api/friends/pass/:userId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const targetId = String(req.params.userId);
    if (targetId === userId) return res.status(400).json({ message: "That's you." });
    await db.insert(friendPasses).values({ userId, targetId }).onConflictDoNothing();
    res.json({ ok: true });
  });
}

export { lookingForOf };
