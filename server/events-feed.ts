// The Events "feed" view: filtered by the caller's saved event_preferences,
// sorted by FIT, capped at 30. This is deliberately NOT a searchable list —
// see docs/CURSOR-PROMPTS-events-v2.md §1. Search is a separate path
// (searchEvents) that ignores preferences and sorts by date.
//
// FIT SORT — deterministic, two passes:
//   1. HARD FILTERS — drop, don't score:
//        published + starts in the future
//        visibility: public always; group only if the user is in that group;
//                    invite never surfaces here
//        distance <= prefs.maxDistanceKm   (no null-distance path: an event
//                    whose location can't be resolved is dropped)
//        prefs.soberOnly       -> event.isSober must be true
//        prefs.accessibilityNeeds -> every need must be in event.accessibility
//        age ranges (only when BOTH sides set one) must overlap
//   2. ADDITIVE SCORE — weights, asserted in scripts/assert-feed-sort.mjs:
//        kind match ................... +30
//        each vibe match (cap 24) ..... +8
//        placeType match .............. +12
//        time-window match ............ +10
//        weekday match ................ +6
//        seatCount <= groupSizeMax .... +8
//        starts within 7 days ......... +10
//        hosted by a group I'm in ..... +15
//   3. TIE-BREAK: startsAt ascending. Never random.
//
// ATTENDEE RESONANCE CONTRIBUTES ZERO. scoreEventForUser does not even receive
// the attendee list. The twin surfaces people separately; the ordering of
// events must never be driven by who is going.

import { db } from "./db";
import {
  events,
  eventAttendees,
  eventPreferences,
  suburbCentroids,
  groupMembers,
  profiles,
  twinAlertLog,
  type Event,
  type EventPreferences,
  type UpdateEventPreferences,
} from "@shared/schema";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { buildResonanceBlocks } from "./events";
import {
  scoreEventForUser,
  resolveEventLocation,
  haversineKm,
  type FeedContext,
} from "./events-fit";

export { scoreEventForUser, type FeedContext } from "./events-fit";

export const FEED_CAP = 30;

const HARARE_CBD = { lat: -17.8292, lng: 31.0522 };

const PREF_DEFAULTS = {
  kinds: null as string[] | null,
  vibes: null as string[] | null,
  maxDistanceKm: 15,
  placeTypes: null as string[] | null,
  groupSizeMax: null as number | null,
  daysOfWeek: null as number[] | null,
  timeWindows: null as string[] | null,
  ageRangeMin: null as number | null,
  ageRangeMax: null as number | null,
  soberOnly: false,
  accessibilityNeeds: null as string[] | null,
  notifyOnGoodMatch: true,
  notifyThreshold: 82,
};

export async function getOrCreatePreferences(userId: string): Promise<EventPreferences> {
  const [existing] = await db.select().from(eventPreferences).where(eq(eventPreferences.userId, userId));
  if (existing) return existing;
  await db.insert(eventPreferences).values({ userId, ...PREF_DEFAULTS }).onConflictDoNothing();
  const [row] = await db.select().from(eventPreferences).where(eq(eventPreferences.userId, userId));
  return row;
}

export async function updatePreferences(
  userId: string,
  patch: UpdateEventPreferences,
): Promise<EventPreferences> {
  await getOrCreatePreferences(userId);
  const [row] = await db
    .update(eventPreferences)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(eventPreferences.userId, userId))
    .returning();
  return row;
}

export async function buildContext(userId: string): Promise<FeedContext> {
  const [profileRows, groupRows, centroids] = await Promise.all([
    db
      .select({ lat: profiles.locationLat, lng: profiles.locationLng, location: profiles.location })
      .from(profiles)
      .where(eq(profiles.userId, userId)),
    db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, userId)),
    db.select().from(suburbCentroids),
  ]);

  const profile = profileRows[0];
  const centroidBySuburb = new Map(
    centroids.map((c) => [c.suburb, { lat: Number(c.lat), lng: Number(c.lng) }]),
  );

  let originLat = profile?.lat != null ? Number(profile.lat) : NaN;
  let originLng = profile?.lng != null ? Number(profile.lng) : NaN;
  if (Number.isNaN(originLat) || Number.isNaN(originLng)) {
    const loc = (profile?.location ?? "").trim().toLowerCase();
    const match = centroids.find(
      (c) => c.suburb.toLowerCase() === loc || c.city.toLowerCase() === loc,
    );
    if (match) {
      originLat = Number(match.lat);
      originLng = Number(match.lng);
    } else {
      originLat = HARARE_CBD.lat;
      originLng = HARARE_CBD.lng;
      console.warn(`[events-feed] no resolvable origin for ${userId}; defaulting to Harare CBD`);
    }
  }

  return {
    originLat,
    originLng,
    centroidBySuburb,
    myGroupIds: new Set(groupRows.map((r) => r.groupId)),
    now: new Date(),
  };
}

type ResonanceBlock = NonNullable<ReturnType<Awaited<ReturnType<typeof buildResonanceBlocks>>["get"]>>;

export interface FeedEvent extends Event {
  distanceKm: number;
  fitScore: number;
  resonance: ResonanceBlock;
  myStatus: string | null;
  twinFlagged: boolean;
}

const EMPTY_BLOCK: ResonanceBlock = { goingCount: 0, highReadCount: 0, notableAttendees: [] };

async function decorate(
  scored: Array<{ event: Event; score: number; distanceKm: number }>,
  userId: string,
): Promise<FeedEvent[]> {
  const ids = scored.map((s) => s.event.id);
  const [blocks, myRows, flaggedRows] = await Promise.all([
    buildResonanceBlocks(ids, userId),
    ids.length
      ? db
          .select({ eventId: eventAttendees.eventId, status: eventAttendees.status })
          .from(eventAttendees)
          .where(and(inArray(eventAttendees.eventId, ids), eq(eventAttendees.userId, userId)))
      : Promise.resolve([] as Array<{ eventId: number; status: string }>),
    ids.length
      ? db
          .select({ eventId: twinAlertLog.eventId })
          .from(twinAlertLog)
          .where(and(inArray(twinAlertLog.eventId, ids), eq(twinAlertLog.userId, userId)))
      : Promise.resolve([] as Array<{ eventId: number }>),
  ]);
  const myStatusByEvent = new Map(myRows.map((r) => [r.eventId, r.status]));
  const flagged = new Set(flaggedRows.map((r) => r.eventId));
  return scored.map((s) => ({
    ...s.event,
    distanceKm: Math.round(s.distanceKm * 10) / 10,
    fitScore: s.score,
    resonance: blocks.get(s.event.id) ?? EMPTY_BLOCK,
    myStatus: myStatusByEvent.get(s.event.id) ?? null,
    twinFlagged: flagged.has(s.event.id),
  }));
}

// Live count for the distance slider on the preferences screen: published,
// future events within `distanceKm`, ignoring every other preference.
export async function countEventsWithinDistance(userId: string, distanceKm: number): Promise<number> {
  const ctx = await buildContext(userId);
  const rows = await db.select().from(events).where(eq(events.status, "published"));
  let n = 0;
  for (const e of rows) {
    if (e.startsAt.getTime() <= ctx.now.getTime()) continue;
    if (e.visibility === "invite") continue;
    if (e.visibility === "group" && (e.groupId == null || !ctx.myGroupIds.has(e.groupId))) continue;
    const loc = resolveEventLocation(e, ctx);
    if (!loc) continue;
    if (haversineKm(ctx.originLat, ctx.originLng, loc.lat, loc.lng) <= distanceKm) n += 1;
  }
  return n;
}

export async function getEventsFeed(userId: string): Promise<{ events: FeedEvent[]; moreThanShown: boolean }> {
  const prefs = await getOrCreatePreferences(userId);
  const ctx = await buildContext(userId);

  const rows = await db.select().from(events).where(eq(events.status, "published"));

  const scored = rows
    .map((event) => {
      const r = scoreEventForUser(event, prefs, ctx);
      return { event, score: r.score, distanceKm: r.distanceKm, pass: r.pass };
    })
    .filter((r) => r.pass)
    // FIT: score desc, then startsAt asc. Nothing else. Never random.
    .sort((a, b) => b.score - a.score || a.event.startsAt.getTime() - b.event.startsAt.getTime());

  const moreThanShown = scored.length > FEED_CAP;
  const decorated = await decorate(scored.slice(0, FEED_CAP), userId);
  return { events: decorated, moreThanShown };
}

// ── SEARCH — ignores saved preferences, sorts by date ────────────────
export interface SearchParams {
  q?: string;
  kind?: string[];
  placeType?: string[];
  distanceKm?: number;
  when?: "any" | "week" | "weekend" | "month";
  sober?: boolean;
  stepFree?: boolean;
}

function whenBounds(when: SearchParams["when"], now: Date): { from: Date; to: Date | null } {
  if (!when || when === "any") return { from: now, to: null };
  if (when === "month") return { from: now, to: new Date(now.getTime() + 30 * 864e5) };
  if (when === "week") return { from: now, to: new Date(now.getTime() + 7 * 864e5) };
  // weekend: from now, to end of the coming Sunday
  const d = new Date(now);
  const daysToSun = (7 - d.getDay()) % 7;
  const sunEnd = new Date(d);
  sunEnd.setDate(d.getDate() + daysToSun);
  sunEnd.setHours(23, 59, 59, 999);
  return { from: now, to: sunEnd };
}

export async function searchEvents(
  userId: string,
  params: SearchParams,
): Promise<{ events: FeedEvent[]; moreThanShown: boolean }> {
  const ctx = await buildContext(userId);
  const { from, to } = whenBounds(params.when, ctx.now);

  const conds = [eq(events.status, "published")];
  if (params.q) {
    const like = `%${params.q}%`;
    conds.push(
      or(
        ilike(events.title, like),
        ilike(events.description, like),
        ilike(events.venueName, like),
        ilike(events.suburb, like),
      )!,
    );
  }
  if (params.kind?.length) conds.push(inArray(events.kind, params.kind));
  if (params.placeType?.length) conds.push(inArray(events.placeType, params.placeType));
  if (params.sober) conds.push(eq(events.isSober, true));

  const rows = await db.select().from(events).where(and(...conds));

  const distanceCap = params.distanceKm ?? 100;
  const filtered = rows
    .map((event) => {
      const loc = resolveEventLocation(event, ctx);
      if (!loc) return null;
      const distanceKm = haversineKm(ctx.originLat, ctx.originLng, loc.lat, loc.lng);
      if (distanceKm > distanceCap) return null;
      if (event.startsAt.getTime() <= ctx.now.getTime()) return null;
      if (to && event.startsAt.getTime() > to.getTime()) return null;
      if (event.startsAt.getTime() < from.getTime()) return null;
      if (event.visibility === "invite") return null;
      if (event.visibility === "group" && (event.groupId == null || !ctx.myGroupIds.has(event.groupId))) return null;
      if (params.stepFree && !(event.accessibility ?? []).includes("step-free")) return null;
      return { event, score: 0, distanceKm };
    })
    .filter((r): r is { event: Event; score: number; distanceKm: number } => r != null)
    // SEARCH sorts by DATE. An explicit search means the user has their own criteria.
    .sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime());

  const moreThanShown = filtered.length > FEED_CAP;
  const decorated = await decorate(filtered.slice(0, FEED_CAP), userId);
  return { events: decorated, moreThanShown };
}
