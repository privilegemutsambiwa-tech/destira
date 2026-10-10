// "Tonight's three" — a small, fixed set of people released at 19:00 Harare
// time every day: a reason to come back at the same time, and a shortlist
// biased toward people who'll actually answer.
//
// Picks come from the same pool as Discover (getDiscoverableProfiles), so
// every eligibility rule there — reciprocal gender, age range, blocks,
// passes, anyone already liked/matched — applies here too. Within that pool
// they're ranked by things that make a reply likely, and every reason shown
// to the member is a real, checkable fact (never an invented compatibility
// number — see server/resonance.ts for why that matters here).
//
// The three are written once per member per day (daily_picks) the first time
// they're asked for, so they never reshuffle while someone's acting on them.

import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import * as push from "./push";
import {
  dailyPicks, discoverPasses, matches, profiles, pushSubscriptions, userActivityDaily,
} from "@shared/schema";

const HARARE_UTC_OFFSET = 2;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const RELEASE_HOUR = 19;
const PICK_COUNT = 3;

type StoredPick = { userId: string; reasons: string[] };

function harareNow(now: Date) {
  return new Date(now.getTime() + HARARE_UTC_OFFSET * HOUR_MS);
}
/** YYYY-MM-DD of the Harare calendar day `now` falls on. */
function harareDate(now: Date): string {
  return harareNow(now).toISOString().slice(0, 10);
}
function harareHour(now: Date): number {
  return harareNow(now).getUTCHours();
}
/** The UTC instant of the next 19:00 Harare after `now`. */
function nextRelease(now: Date): Date {
  const h = harareNow(now);
  const release = Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate(), RELEASE_HOUR) - HARARE_UTC_OFFSET * HOUR_MS;
  return new Date(release > now.getTime() ? release : release + DAY_MS);
}
/** The Harare day whose picks are current: today from 19:00, yesterday before. */
function currentPickDate(now: Date): string {
  return harareHour(now) >= RELEASE_HOUR ? harareDate(now) : harareDate(new Date(now.getTime() - DAY_MS));
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

async function choosePicks(userId: string, pickDate: string): Promise<StoredPick[]> {
  const me = await storage.getProfile(userId);
  if (!me?.gender || !(me.seekingGenders as string[] | null)?.length) return [];

  // Same seed all day, so a regenerate (e.g. a race) lands on the same order.
  const { profiles: pool } = await storage.getDiscoverableProfiles(userId, undefined, undefined, undefined, null, 60, `picks:${pickDate}`);
  if (pool.length === 0) return [];

  const ids = pool.map((p: any) => p.userId as string);
  const weekAgo = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);
  const [activeRows, likerRows, myInterestsMap] = await Promise.all([
    db.selectDistinct({ userId: userActivityDaily.userId })
      .from(userActivityDaily)
      .where(and(inArray(userActivityDaily.userId, ids), gte(userActivityDaily.date, weekAgo))),
    db.select({ userId: matches.user1Id })
      .from(matches)
      .where(and(eq(matches.user2Id, userId), eq(matches.status, "pending"), inArray(matches.user1Id, ids))),
    storage.getInterestsForUsers([userId]),
  ]);
  const active = new Set(activeRows.map((r) => r.userId));
  const likedMe = new Set(likerRows.map((r) => r.userId));
  const myInterests = new Set((myInterestsMap.get(userId) ?? []).map(norm));
  const myCity = norm(me.location);

  const scored = pool.map((p: any, order: number) => {
    const shared = ((p.interests ?? []) as string[]).filter((i) => myInterests.has(norm(i))).slice(0, 2);
    const sameCity = !!myCity && norm(p.location) === myCity;
    const isActive = active.has(p.userId);
    const hasPhoto = (p.photos?.length ?? 0) > 0 || !!p.coverPhotoUrl;
    const isNew = p.createdAt && Date.now() - new Date(p.createdAt).getTime() < 7 * DAY_MS;

    let score = 0;
    if (isActive) score += 4; // the one that matters most: they'll see a like
    if (hasPhoto) score += 2;
    score += shared.length * 1.5;
    if (sameCity) score += 2;
    if (likedMe.has(p.userId)) score += 2; // never surfaced as a reason

    const reasons: string[] = [];
    if (shared.length) reasons.push(`You both like ${joinNatural(shared)}`);
    if (sameCity) reasons.push(`Also in ${p.location}`);
    if (isActive) reasons.push("Active this week");
    else if (isNew) reasons.push("New on Destira");
    return { userId: p.userId as string, score, order, reasons: reasons.slice(0, 2) };
  });

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, PICK_COUNT).map(({ userId, reasons }) => ({ userId, reasons }));
}

/** The member's picks for `pickDate`, created on first ask. */
async function ensurePicks(userId: string, pickDate: string): Promise<{ picks: StoredPick[]; notifiedAt: Date | null } | null> {
  const [existing] = await db.select().from(dailyPicks)
    .where(and(eq(dailyPicks.userId, userId), eq(dailyPicks.pickDate, pickDate)));
  if (existing) return { picks: existing.picks, notifiedAt: existing.notifiedAt };

  const picks = await choosePicks(userId, pickDate);
  // Nothing to show isn't stored — a member who finishes their essentials
  // later the same evening should still get a set.
  if (picks.length === 0) return null;
  await db.insert(dailyPicks).values({ userId, pickDate, picks }).onConflictDoNothing();
  const [row] = await db.select().from(dailyPicks)
    .where(and(eq(dailyPicks.userId, userId), eq(dailyPicks.pickDate, pickDate)));
  return row ? { picks: row.picks, notifiedAt: row.notifiedAt } : null;
}

export type DailyPicksView = {
  pickDate: string;
  nextReleaseAt: string;
  picks: Array<{
    userId: string;
    displayName: string;
    age: number | null;
    location: string | null;
    photoUrl: string | null;
    reasons: string[];
    status: "open" | "liked" | "passed";
  }>;
};

export async function getDailyPicks(userId: string, now = new Date()): Promise<DailyPicksView> {
  const pickDate = currentPickDate(now);
  const view: DailyPicksView = { pickDate, nextReleaseAt: nextRelease(now).toISOString(), picks: [] };
  const set = await ensurePicks(userId, pickDate);
  if (!set) return view;

  const ids = set.picks.map((p) => p.userId);
  const [rows, galleries, liked, passed] = await Promise.all([
    db.select({
      userId: profiles.userId, displayName: profiles.displayName, age: profiles.age,
      location: profiles.location, coverPhotoUrl: profiles.coverPhotoUrl,
      isPublic: profiles.isPublic, moderationStatus: profiles.moderationStatus,
    }).from(profiles).where(inArray(profiles.userId, ids)),
    storage.getPublicGalleries(ids),
    db.select({ id: matches.user2Id }).from(matches).where(and(eq(matches.user1Id, userId), inArray(matches.user2Id, ids))),
    db.select({ id: discoverPasses.targetId }).from(discoverPasses).where(and(eq(discoverPasses.userId, userId), inArray(discoverPasses.targetId, ids))),
  ]);
  const byId = new Map(rows.map((r) => [r.userId, r]));
  const likedSet = new Set(liked.map((r) => r.id));
  // A pick who liked the member first and got liked back is user2 on the
  // match row, not user1 — still "liked" from the member's point of view.
  const likedBack = await db.select({ id: matches.user1Id }).from(matches)
    .where(and(eq(matches.user2Id, userId), eq(matches.status, "matched"), inArray(matches.user1Id, ids)));
  for (const r of likedBack) likedSet.add(r.id);
  const passedSet = new Set(passed.map((r) => r.id));

  for (const pick of set.picks) {
    const p = byId.get(pick.userId);
    // Someone who went private, got suspended, or deleted since this
    // morning's set was written just drops out — never shown stale.
    if (!p || !p.isPublic || p.moderationStatus !== "active") continue;
    const photos = galleries.get(pick.userId) ?? [];
    const lead = photos.find((ph) => ph.role === "cover") ?? photos[0];
    view.picks.push({
      userId: pick.userId,
      displayName: p.displayName || "Someone",
      age: p.age ?? null,
      location: p.location ?? null,
      photoUrl: lead?.w800 ?? lead?.url ?? p.coverPhotoUrl ?? null,
      reasons: pick.reasons,
      status: likedSet.has(pick.userId) ? "liked" : passedSet.has(pick.userId) ? "passed" : "open",
    });
  }
  return view;
}

/**
 * Between 19:00 and 21:00 Harare: make sure everyone who can receive a push
 * (and has been around in the last 30 days) has tonight's set, and tell them
 * once. notified_at is claimed before sending, so overlapping sweeps or two
 * server instances can never double-notify.
 */
export async function runDailyPicksPushSweep(now = new Date()): Promise<{ notified: number } | { skipped: string }> {
  const hour = harareHour(now);
  if (hour < RELEASE_HOUR || hour >= RELEASE_HOUR + 2) return { skipped: "outside release window" };
  if (!push.pushConfigured()) return { skipped: "push not configured" };

  const pickDate = harareDate(now);
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS).toISOString().slice(0, 10);
  const recipients = await db.selectDistinct({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(sql`exists (select 1 from ${userActivityDaily} a where a.user_id = ${pushSubscriptions.userId} and a.date >= ${monthAgo})`);

  let notified = 0;
  for (const { userId } of recipients) {
    try {
      const set = await ensurePicks(userId, pickDate);
      if (!set || set.notifiedAt) continue;
      const claimed = await db.update(dailyPicks)
        .set({ notifiedAt: now })
        .where(and(eq(dailyPicks.userId, userId), eq(dailyPicks.pickDate, pickDate), isNull(dailyPicks.notifiedAt)))
        .returning({ userId: dailyPicks.userId });
      if (claimed.length === 0) continue;
      await push.sendCategorizedPush(userId, "matches", {
        title: "Tonight's three are here",
        body: `${set.picks.length === 1 ? "One person" : `${set.picks.length} people`} picked for you tonight. Have a look.`,
        url: "/discover",
        tag: `picks-${pickDate}`,
      });
      notified++;
    } catch (e) {
      console.error("[daily-picks] notify failed for", userId, e);
    }
  }
  return { notified };
}
