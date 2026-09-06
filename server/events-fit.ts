// Pure fit-scoring for the Events feed. No DB import — so scripts/assert-feed-sort.mjs
// can exercise it directly, and the "attendee resonance never sorts the feed"
// guarantee is structural: scoreEventForUser never receives attendee data.
//
// WEIGHTS (asserted in scripts/assert-feed-sort.mjs):
//   kind match ................... +30
//   each vibe match (cap 24) ..... +8
//   placeType match .............. +12
//   time-window match ............ +10
//   weekday match ................ +6
//   seatCount <= groupSizeMax .... +8
//   starts within 7 days ......... +10
//   hosted by a group I'm in ..... +15
// Tie-break (applied by the caller): startsAt ascending. Never random.

import type { Event, EventPreferences } from "@shared/schema";

export const FIT_WEIGHTS = {
  kind: 30,
  vibePer: 8,
  vibeCap: 24,
  placeType: 12,
  timeWindow: 10,
  weekday: 6,
  groupSize: 8,
  soon: 10,
  myGroup: 15,
} as const;

export interface FeedContext {
  originLat: number;
  originLng: number;
  centroidBySuburb: Map<string, { lat: number; lng: number }>;
  myGroupIds: Set<number>;
  now: Date;
}

export interface ScoreResult {
  pass: boolean;
  score: number;
  distanceKm: number;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function timeWindowOf(d: Date): "morning" | "afternoon" | "evening" | "late" {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "late";
}

export function resolveEventLocation(
  event: Pick<Event, "lat" | "lng" | "suburb">,
  ctx: FeedContext,
): { lat: number; lng: number } | null {
  if (event.lat != null && event.lng != null) return { lat: Number(event.lat), lng: Number(event.lng) };
  if (event.suburb) {
    const c = ctx.centroidBySuburb.get(event.suburb);
    if (c) return c;
  }
  return null;
}

/** Hard filters + additive fit score for one event. Pure. Takes no attendee
 *  data — resonance cannot influence the result by construction. */
export function scoreEventForUser(event: Event, prefs: EventPreferences, ctx: FeedContext): ScoreResult {
  const loc = resolveEventLocation(event, ctx);
  if (!loc) return { pass: false, score: 0, distanceKm: Infinity };
  const distanceKm = haversineKm(ctx.originLat, ctx.originLng, loc.lat, loc.lng);
  const fail: ScoreResult = { pass: false, score: 0, distanceKm };

  // ── hard filters ──
  if (event.status !== "published") return fail;
  if (!(event.startsAt.getTime() > ctx.now.getTime())) return fail;
  if (event.visibility === "invite") return fail;
  if (event.visibility === "group" && (event.groupId == null || !ctx.myGroupIds.has(event.groupId))) return fail;
  if (distanceKm > prefs.maxDistanceKm) return fail;
  if (prefs.soberOnly && !event.isSober) return fail;
  if (prefs.accessibilityNeeds?.length) {
    const have = new Set(event.accessibility ?? []);
    if (!prefs.accessibilityNeeds.every((n) => have.has(n))) return fail;
  }
  if (
    prefs.ageRangeMin != null && prefs.ageRangeMax != null &&
    event.ageMin != null && event.ageMax != null
  ) {
    const overlap = event.ageMin <= prefs.ageRangeMax && event.ageMax >= prefs.ageRangeMin;
    if (!overlap) return fail;
  }

  // ── additive score ──
  let score = 0;
  if (prefs.kinds?.length && event.kind && prefs.kinds.includes(event.kind)) score += FIT_WEIGHTS.kind;
  if (prefs.vibes?.length && event.vibes?.length) {
    const pv = new Set(prefs.vibes);
    const hits = event.vibes.filter((v) => pv.has(v)).length;
    score += Math.min(hits * FIT_WEIGHTS.vibePer, FIT_WEIGHTS.vibeCap);
  }
  if (prefs.placeTypes?.length && event.placeType && prefs.placeTypes.includes(event.placeType)) {
    score += FIT_WEIGHTS.placeType;
  }
  if (prefs.timeWindows?.length && prefs.timeWindows.includes(timeWindowOf(event.startsAt))) {
    score += FIT_WEIGHTS.timeWindow;
  }
  if (prefs.daysOfWeek?.length && prefs.daysOfWeek.includes(event.startsAt.getDay())) {
    score += FIT_WEIGHTS.weekday;
  }
  if (prefs.groupSizeMax != null && event.seatCount != null && event.seatCount <= prefs.groupSizeMax) {
    score += FIT_WEIGHTS.groupSize;
  }
  if (event.startsAt.getTime() <= ctx.now.getTime() + 7 * 24 * 60 * 60 * 1000) score += FIT_WEIGHTS.soon;
  if (event.groupId != null && ctx.myGroupIds.has(event.groupId)) score += FIT_WEIGHTS.myGroup;

  return { pass: true, score, distanceKm };
}
