// Crown perks (docs/destira-3-upgrade-prompt.md Part P): Spotlight, direct
// introductions and private mode. Crown itself (apply, pay, seats) is in
// server/crown.ts.
//
// The rule over all of it: Crown never overrides anyone's choices. Spotlight
// only lifts someone the viewer's own deck would show anyway (same query,
// same filters, blocks and passes); an introduction is a like with a note,
// declined silently; private mode only ever hides a Crown member.
import type { Express, Request } from "express";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import { crownIntros, crownMembers, crownSpotlights, matches, profiles, userPhotos } from "@shared/schema";
import { storage } from "./storage";
import * as gate from "./gate";
import * as push from "./push";
import * as safety from "./safety";
import { loveBlockedReason } from "./friends";
import { activeCrownIds, forgetCrownCache, isCrown, privateCrownIds } from "./crown";

/** Spotlights a viewer sees in a day, at most; each Crown member once. */
export const SPOTLIGHTS_PER_DAY = 2;
/** Direct introductions a Crown member can send in a day. */
export const INTROS_PER_DAY = 3;
export const INTRO_MAX = 280;
export const INTRO_MIN = 10;

const rows = (r: any) => (r?.rows ?? r ?? []) as any[];

// ── Spotlight ─────────────────────────────────────────────────────

/**
 * First page of a viewer's deck: lift one Crown member near the top, if
 * their own deck would show one at all. Never ahead of anyone who already
 * liked the viewer; each Crown member once per viewer per day; at most
 * SPOTLIGHTS_PER_DAY a day. Marks the card { spotlight: true }.
 */
export async function applySpotlight(
  viewerId: string,
  page: any[],
  filter: string | undefined,
  lat?: number,
  lng?: number,
): Promise<any[]> {
  try {
    if (filter === "new") return page;
    // A copy: the cached set is shared.
    const crown = new Set(await activeCrownIds());
    crown.delete(viewerId);
    if (crown.size === 0) return page;
    const day = gate.localDayKey(await gate.userTimezone(viewerId));
    const today = await db
      .select({ crownId: crownSpotlights.crownId })
      .from(crownSpotlights)
      .where(and(eq(crownSpotlights.viewerId, viewerId), eq(crownSpotlights.day, day)));
    const liftedToday = new Set(today.map((r) => r.crownId));
    // Someone already lifted today stays lifted on a reload (same card, same
    // place, no new spotlight used). A new one only while under the cap.
    const pool = Array.from(crown).filter((id) => liftedToday.has(id) || today.length < SPOTLIGHTS_PER_DAY);
    if (pool.length === 0) return page;

    // The viewer's own deck, narrowed to these Crown members: every rule
    // applies (filters, distance, blocks, passes, already liked, private mode).
    const { profiles: eligible } = await storage.getDiscoverableProfiles(
      viewerId,
      filter,
      lat,
      lng,
      null,
      5,
      `spotlight:${viewerId}:${day}`,
      { onlyUserIds: pool },
    );
    const pick = eligible.find((p: any) => liftedToday.has(p.userId)) ?? eligible[0];
    if (!pick) return page;

    // Where: right after the last person near the top who already liked the
    // viewer (they always come first), otherwise the second card.
    const likerRows = await db
      .select({ id: matches.user1Id })
      .from(matches)
      .where(and(eq(matches.user2Id, viewerId), eq(matches.status, "pending")));
    const likers = new Set(likerRows.map((r) => r.id));
    const rest = page.filter((p) => p.userId !== pick.userId);
    let lastLiker = -1;
    rest.forEach((p, i) => {
      if (likers.has(p.userId) && i < 15) lastLiker = i;
    });
    const at = Math.min(rest.length, Math.max(1, lastLiker + 1));
    const out = [...rest];
    out.splice(at, 0, { ...pick, spotlight: true });

    if (!liftedToday.has(pick.userId)) {
      await db.insert(crownSpotlights).values({ viewerId, crownId: pick.userId, day }).onConflictDoNothing();
    }
    return out;
  } catch (e) {
    // Spotlight is a nicety; the deck itself must never fail because of it.
    console.error("[crown] spotlight failed:", e);
    return page;
  }
}

/** Later pages: drop whoever was lifted today, so they aren't dealt twice. */
export async function dropLiftedToday(viewerId: string, page: any[]): Promise<any[]> {
  try {
    const day = gate.localDayKey(await gate.userTimezone(viewerId));
    const r = await db
      .select({ crownId: crownSpotlights.crownId })
      .from(crownSpotlights)
      .where(and(eq(crownSpotlights.viewerId, viewerId), eq(crownSpotlights.day, day)));
    if (!r.length) return page;
    const lifted = new Set(r.map((x) => x.crownId));
    return page.filter((p) => !lifted.has(p.userId));
  } catch {
    return page;
  }
}

// ── private mode ──────────────────────────────────────────────────

/**
 * Can `viewerId` open `targetId`'s profile? Always, unless the target is a
 * Crown member in private mode: then only if the target liked the viewer
 * (or they're matched).
 */
export async function privateModeHides(targetId: string, viewerId: string): Promise<boolean> {
  if (targetId === viewerId) return false;
  if (!(await privateCrownIds()).has(targetId)) return false;
  const [m] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      or(
        and(eq(matches.user1Id, targetId), eq(matches.user2Id, viewerId), inArray(matches.status, ["pending", "matched"])),
        and(eq(matches.user1Id, viewerId), eq(matches.user2Id, targetId), eq(matches.status, "matched")),
      ),
    )
    .limit(1);
  return !m;
}

// ── introductions ─────────────────────────────────────────────────

// A day is a Harare day (UTC+2, no daylight saving), like the rest of billing.
async function introsSentToday(userId: string): Promise<number> {
  const [r] = await db.execute(sql`
    select count(*)::int as n from crown_intros
    where from_user_id = ${userId}
      and (created_at + interval '2 hours')::date = (now() + interval '2 hours')::date
  `).then(rows);
  return Number(r?.n ?? 0);
}

/** Pending match ids that carry an introduction (the Likes list shows them
 *  in their own section, not as a plain like). */
export async function introMatchIds(toUserId: string): Promise<Set<number>> {
  const r = await db.select({ matchId: crownIntros.matchId }).from(crownIntros).where(eq(crownIntros.toUserId, toUserId));
  return new Set(r.map((x) => x.matchId));
}

// ── routes ────────────────────────────────────────────────────────

export function registerCrownPerkRoutes(app: Express, getUserId: (req: Request) => string | null) {
  // A Crown member's own perk state: private mode and introductions left.
  app.get("/api/crown/perks", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const [row] = await db.select({ privateMode: crownMembers.privateMode }).from(crownMembers).where(eq(crownMembers.userId, userId));
      const sent = await introsSentToday(userId);
      res.json({
        crown: await isCrown(userId),
        privateMode: !!row?.privateMode,
        introsLeft: Math.max(0, INTROS_PER_DAY - sent),
        introsPerDay: INTROS_PER_DAY,
      });
    } catch (e) {
      console.error("[crown] perks failed:", e);
      res.status(500).json({ message: "Couldn't load" });
    }
  });

  app.patch("/api/crown/private-mode", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (typeof req.body?.on !== "boolean") return res.status(400).json({ message: "on must be true or false" });
    try {
      if (!(await isCrown(userId))) return res.status(403).json({ message: "Private mode is a Crown perk." });
      await db.update(crownMembers).set({ privateMode: req.body.on, updatedAt: new Date() }).where(eq(crownMembers.userId, userId));
      forgetCrownCache();
      res.json({ privateMode: req.body.on });
    } catch (e) {
      console.error("[crown] private mode failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });

  // Send a like with a note. Same checks as an ordinary like, plus: Crown
  // only, INTROS_PER_DAY a day, and the note goes through the scam scanner.
  app.post("/api/crown/intros", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const targetId = typeof req.body?.targetId === "string" ? req.body.targetId : "";
    const note = typeof req.body?.note === "string" ? req.body.note.trim().replace(/\s+\n/g, "\n") : "";
    if (!targetId || targetId === userId) return res.status(400).json({ message: "Who is this for?" });
    if (note.length < INTRO_MIN) return res.status(400).json({ message: "Write a line or two: what made you want to say hello?" });
    if (note.length > INTRO_MAX) return res.status(400).json({ message: `Keep it under ${INTRO_MAX} characters.` });
    if (await safety.blockIfHeld(res, userId)) return;
    try {
      if (!(await isCrown(userId))) return res.status(403).json({ message: "Introductions are a Crown perk." });
      if ((await introsSentToday(userId)) >= INTROS_PER_DAY) {
        return res.status(429).json({ message: `That's your ${INTROS_PER_DAY} introductions for today. More tomorrow.` });
      }
      const [target] = await db
        .select({ moderationStatus: profiles.moderationStatus, onboardingCompleted: profiles.onboardingCompleted })
        .from(profiles)
        .where(eq(profiles.userId, targetId));
      if (!target || target.moderationStatus !== "active" || !target.onboardingCompleted) {
        return res.status(404).json({ message: "This profile isn't available." });
      }
      if ((await storage.isBlocked(targetId, userId)) || (await storage.isBlocked(userId, targetId))) {
        return res.status(403).json({ message: "Cannot connect with this user" });
      }
      // Never an introduction to, or from, someone here for friends only.
      const notDating = await loveBlockedReason(userId, targetId);
      if (notDating) return res.status(403).json({ message: notDating });
      const existing = await storage.getActiveMatchBetweenUsers(userId, targetId);
      if (existing) {
        return res.status(409).json({
          message: existing.user1Id === targetId && existing.status === "pending"
            ? "They've already liked you. Like them back instead."
            : "You've already liked them.",
        });
      }

      await storage.incrementDailyLikes(userId);
      const match = await storage.createMatch(userId, targetId);
      const [intro] = await db.insert(crownIntros).values({ matchId: match.id, fromUserId: userId, toUserId: targetId, note }).returning();
      res.status(201).json({ matchId: match.id, introId: intro.id, introsLeft: Math.max(0, INTROS_PER_DAY - (await introsSentToday(userId))) });

      // "Allowance" and other money talk: same scanner as chats.
      safety.scanText({ senderId: userId, text: note, source: "intro", refId: intro.id, recipientId: targetId }).catch(() => {});
      safety.checkLikeBurst(userId).catch(() => {});
      push
        .sendCategorizedPush(targetId, "matches", {
          title: "Someone introduced themselves",
          body: "A Crown member sent you a note. See it on your Likes page.",
          url: "/matches",
          tag: "crown-intro",
        })
        .catch(() => {});
    } catch (e) {
      console.error("[crown] intro failed:", e);
      res.status(500).json({ message: "Couldn't send your introduction" });
    }
  });

  // Introductions waiting for me. Shown with name and photo whatever my plan:
  // an introduction is a direct request, and that's the point of it.
  app.get("/api/crown/intros/incoming", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const list = await db
        .select({
          matchId: crownIntros.matchId,
          fromUserId: crownIntros.fromUserId,
          note: crownIntros.note,
          createdAt: crownIntros.createdAt,
          status: matches.status,
          displayName: profiles.displayName,
          age: profiles.age,
          location: profiles.location,
          isVerified: profiles.isVerified,
          moderationStatus: profiles.moderationStatus,
        })
        .from(crownIntros)
        .innerJoin(matches, eq(matches.id, crownIntros.matchId))
        .innerJoin(profiles, eq(profiles.userId, crownIntros.fromUserId))
        .where(and(eq(crownIntros.toUserId, userId), eq(matches.status, "pending")))
        .orderBy(desc(crownIntros.createdAt))
        .limit(30);
      const visible = [];
      for (const r of list) {
        if (r.moderationStatus !== "active") continue;
        if ((await storage.isBlocked(userId, r.fromUserId)) || (await storage.isBlocked(r.fromUserId, userId))) continue;
        visible.push(r);
      }
      const ids = visible.map((r) => r.fromUserId);
      const photos = ids.length
        ? await db
            .select({ userId: userPhotos.userId, url: userPhotos.photoUrl, variants: userPhotos.variants, order: userPhotos.orderIndex })
            .from(userPhotos)
            .where(inArray(userPhotos.userId, ids))
        : [];
      const lead = new Map<string, string>();
      for (const p of photos.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
        if (!lead.has(p.userId)) lead.set(p.userId, ((p.variants as any)?.w800 as string) ?? p.url);
      }
      res.json(
        visible.map(({ moderationStatus: _m, status: _s, ...r }) => ({ ...r, photoUrl: lead.get(r.fromUserId) ?? null })),
      );
    } catch (e) {
      console.error("[crown] intros incoming failed:", e);
      res.status(500).json({ message: "Couldn't load introductions" });
    }
  });
}

/** Introductions sent in the last `days` days (console). */
export async function introStats(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const r = await db
    .select({ status: matches.status, n: sql<number>`count(*)::int` })
    .from(crownIntros)
    .innerJoin(matches, eq(matches.id, crownIntros.matchId))
    .where(gte(crownIntros.createdAt, since))
    .groupBy(matches.status);
  const by = Object.fromEntries(r.map((x) => [x.status, Number(x.n)]));
  return { sent: r.reduce((s, x) => s + Number(x.n), 0), accepted: by.matched ?? 0, declined: by.rejected ?? 0, waiting: by.pending ?? 0 };
}
