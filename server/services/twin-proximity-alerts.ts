// Twin Proximity Alerts — "someone worth knowing is at the same place as you".
//
// Sibling of twin-event-alerts.ts. The twin is the one speaking. It is NOT a
// radar and NOT a "3 people nearby" counter. Place-keyed, not radius-keyed:
// two people are "together" iff they resolved to the same verified place row
// within the freshness window — so the hot path is a GROUP-BY, never N×N.
//
// v1 (option B): NO pairwise number. There is no real "you vs. them" resonance
// score in this codebase (see server/resonance.ts). The alert gates on mutual
// preference fit + a named place + freshness, and says so honestly.
//
// GATES (all in twin_proximity, keyed by recipient — no localStorage):
//   a. once per (recipient, subject, place) ever; re-openable after 90 days
//   b. >= 6h between ANY two alerts to a recipient   (global cooldown)
//   c. <= 2 alerts per recipient per day
//   d. <= 4 alerts per recipient per rolling 7 days
//   e. nothing during the recipient's quiet hours (their timezone)
//
// SAFETY (see docs report §8):
//   - both sides must be isVerified (the only age signal we have)
//   - free payload carries ZERO identity — built by a separate serializer
//   - distance is a coarse bucket, identical for free and paid
//   - symmetric: A alertable about B ⟺ B alertable about A, each under own settings
//   - blocks absolute both ways; "invisible here" checked in the candidate query
//   - latest ping only, no trail

import { db } from "../db";
import {
  profiles,
  places,
  proximityAlerts,
  placeInvisibility,
  pushSubscriptions,
  twinNotifications,
  blockedUsers,
  matches,
} from "@shared/schema";
import { and, eq, or, gte, count, ne, isNull, isNotNull, lt } from "drizzle-orm";
import { haversineKm } from "../events-fit";
import { sendPush } from "../push";

const FRESHNESS_MS = 12 * 60 * 1000;
const GLOBAL_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DAILY_CAP = 2;
const WEEKLY_CAP = 4;
const PAIR_REOPEN_DAYS = 90;
const ALERT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SENDS_PER_RUN = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export const PROXIMITY_ENABLED = () => process.env.PROXIMITY_ALERTS_ENABLED !== "0";

// ── place resolution ────────────────────────────────────────────────────
export interface ResolvedPlace {
  id: number;
  name: string;
  placeType: string;
  radiusM: number;
  distM: number;
}

export async function resolvePlace(lat: number, lng: number): Promise<ResolvedPlace | null> {
  // Verified places only. Nearest whose own radius contains the point wins.
  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      placeType: places.placeType,
      radiusM: places.radiusM,
      lat: places.lat,
      lng: places.lng,
    })
    .from(places)
    .where(isNotNull(places.verifiedAt));
  let best: ResolvedPlace | null = null;
  for (const p of rows) {
    if (p.lat == null || p.lng == null) continue;
    const distM = haversineKm(lat, lng, Number(p.lat), Number(p.lng)) * 1000;
    if (distM <= p.radiusM && (!best || distM < best.distM)) {
      best = { id: p.id, name: p.name, placeType: p.placeType, radiusM: p.radiusM, distM };
    }
  }
  return best;
}

export function distanceBucketFor(distM: number, placeType: string): string {
  if (placeType === "campus") return distM <= 120 ? "same_place" : "this_campus";
  if (placeType === "mall" || placeType === "office") return distM <= 60 ? "same_place" : "few_hundred_m";
  if (distM <= 40) return "same_place";
  if (distM <= 200) return "few_hundred_m";
  return "this_area";
}

export function placePhrase(placeType: string, name: string): { label: string; where: string } {
  switch (placeType) {
    case "campus":
      return { label: name, where: `at ${name}` };
    case "transit":
      return { label: name, where: "on your route" };
    case "office":
      return { label: name, where: "in this building" };
    case "mall":
      return { label: name, where: `at ${name}` };
    default:
      return { label: name, where: `at ${name}` };
  }
}

// ── gates (pure — scripts/assert-proximity-alerts.ts checks each) ────────
export interface GateState {
  everSentForPair: boolean;
  msSinceLastAlert: number | null;
  alertsToday: number;
  alertsThisWeek: number;
  localHour: number;
  quietStart: number;
  quietEnd: number;
}

export function inQuietHours(h: number, start: number, end: number): boolean {
  return start > end ? h >= start || h < end : h >= start && h < end;
}

export function evaluateGates(s: GateState): { send: boolean; blockedBy: string | null } {
  if (s.everSentForPair) return { send: false, blockedBy: "pair-cooldown" };
  if (s.msSinceLastAlert != null && s.msSinceLastAlert < GLOBAL_COOLDOWN_MS)
    return { send: false, blockedBy: "global-cooldown" };
  if (s.alertsToday >= DAILY_CAP) return { send: false, blockedBy: "daily-cap" };
  if (s.alertsThisWeek >= WEEKLY_CAP) return { send: false, blockedBy: "weekly-cap" };
  if (inQuietHours(s.localHour, s.quietStart, s.quietEnd)) return { send: false, blockedBy: "quiet-hours" };
  return { send: true, blockedBy: null };
}

function localHour(tz: string | null): number {
  const now = new Date();
  try {
    if (tz) {
      const h = new Date(now.toLocaleString("en-US", { timeZone: tz })).getHours();
      if (Number.isFinite(h)) return h;
    }
  } catch {}
  return (now.getUTCHours() + 2) % 24; // CAT fallback
}

// ── preference fit (both ways) ─────────────────────────────────────────
type P = typeof profiles.$inferSelect;

function ageOk(viewer: P, other: P): boolean {
  if (other.age == null) return false;
  const min = viewer.ageMinPreference ?? 18;
  const max = viewer.ageMaxPreference ?? 99;
  return other.age >= min && other.age <= max;
}
function genderOk(viewer: P, other: P): boolean {
  // opposite-gender only; unknown on either side = allow (same rule the old
  // proximity check used)
  const a = viewer.gender?.toLowerCase();
  const b = other.gender?.toLowerCase();
  if (!a || !b) return true;
  return a !== b;
}

export function preferenceFitBothWays(a: P, b: P): boolean {
  return (
    ageOk(a, b) &&
    ageOk(b, a) &&
    genderOk(a, b) &&
    genderOk(b, a) &&
    a.showDistance !== false &&
    b.showDistance !== false
  );
}

async function hasPriorContact(u1: string, u2: string): Promise<boolean> {
  const [m] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      or(
        and(eq(matches.user1Id, u1), eq(matches.user2Id, u2)),
        and(eq(matches.user1Id, u2), eq(matches.user2Id, u1)),
      ),
    )
    .limit(1);
  return !!m;
}

async function blockedEitherWay(u1: string, u2: string): Promise<boolean> {
  const [b] = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .where(
      or(
        and(eq(blockedUsers.blockerId, u1), eq(blockedUsers.blockedId, u2)),
        and(eq(blockedUsers.blockerId, u2), eq(blockedUsers.blockedId, u1)),
      ),
    )
    .limit(1);
  return !!b;
}

function modeAllows(mode: string, placeType: string): boolean {
  if (mode === "off") return false;
  if (mode === "everywhere") return true;
  // campus_work
  return placeType === "campus" || placeType === "office";
}

async function alertCounts(recipientId: string, now: Date) {
  const [today] = await db
    .select({ c: count() })
    .from(proximityAlerts)
    .where(and(eq(proximityAlerts.recipientId, recipientId), gte(proximityAlerts.createdAt, new Date(now.getTime() - DAY_MS))));
  const [week] = await db
    .select({ c: count() })
    .from(proximityAlerts)
    .where(and(eq(proximityAlerts.recipientId, recipientId), gte(proximityAlerts.createdAt, new Date(now.getTime() - 7 * DAY_MS))));
  const recent = await db
    .select({ at: proximityAlerts.createdAt })
    .from(proximityAlerts)
    .where(and(eq(proximityAlerts.recipientId, recipientId), gte(proximityAlerts.createdAt, new Date(now.getTime() - GLOBAL_COOLDOWN_MS))))
    .limit(1);
  return {
    today: Number(today?.c ?? 0),
    week: Number(week?.c ?? 0),
    msSinceLast: recent.length > 0 ? 0 : null,
  };
}

// ── the job: fire alerts after `reporterId` reports a location ──────────
export async function runProximityForReporter(reporterId: string): Promise<{ sent: number }> {
  if (!PROXIMITY_ENABLED()) return { sent: 0 };
  const now = new Date();

  const [reporter] = await db.select().from(profiles).where(eq(profiles.userId, reporterId));
  if (!reporter || !reporter.currentPlaceId) return { sent: 0 };
  if (reporter.proximityMode === "off" || !reporter.isVerified) return { sent: 0 };
  if (reporter.proximityPausedUntil && reporter.proximityPausedUntil.getTime() > now.getTime()) return { sent: 0 };

  const [place] = await db.select().from(places).where(eq(places.id, reporter.currentPlaceId));
  if (!place) return { sent: 0 };
  if (!modeAllows(reporter.proximityMode, place.placeType)) return { sent: 0 };

  const freshCutoff = new Date(now.getTime() - FRESHNESS_MS);
  const coPresent = await db
    .select()
    .from(profiles)
    .where(
      and(
        eq(profiles.currentPlaceId, reporter.currentPlaceId),
        gte(profiles.locationUpdatedAt, freshCutoff),
        ne(profiles.userId, reporterId),
        eq(profiles.isPublic, true),
        eq(profiles.onboardingCompleted, true),
        eq(profiles.isVerified, true),
        ne(profiles.proximityMode, "off"),
        or(isNull(profiles.proximityPausedUntil), lt(profiles.proximityPausedUntil, now)),
      ),
    );

  if (coPresent.length === 0) return { sent: 0 };

  // invisible-here set for this place
  const invis = new Set(
    (
      await db
        .select({ userId: placeInvisibility.userId })
        .from(placeInvisibility)
        .where(eq(placeInvisibility.placeId, place.id))
    ).map((r) => r.userId),
  );

  // rank candidates the REPORTER could be told about: freshest first
  const rankedForReporter = [...coPresent]
    .filter((c) => !invis.has(c.userId))
    .sort((a, b) => (b.locationUpdatedAt?.getTime() ?? 0) - (a.locationUpdatedAt?.getTime() ?? 0));

  let sent = 0;

  const tryEmit = async (recipient: P, subject: P): Promise<boolean> => {
    if (sent >= MAX_SENDS_PER_RUN) return false;
    if (invis.has(subject.userId)) return false;
    if (recipient.proximityMode === "off" || !recipient.isVerified) return false;
    if (recipient.proximityPausedUntil && recipient.proximityPausedUntil.getTime() > now.getTime()) return false;
    if (!modeAllows(recipient.proximityMode, place.placeType)) return false;
    if (!preferenceFitBothWays(recipient, subject)) return false;
    if (await blockedEitherWay(recipient.userId, subject.userId)) return false;
    if (await hasPriorContact(recipient.userId, subject.userId)) return false;

    // pair cooldown: a row inside the 90-day window blocks a re-send
    const [pair] = await db
      .select({ createdAt: proximityAlerts.createdAt })
      .from(proximityAlerts)
      .where(
        and(
          eq(proximityAlerts.recipientId, recipient.userId),
          eq(proximityAlerts.subjectId, subject.userId),
          eq(proximityAlerts.placeId, place.id),
        ),
      )
      .limit(1);
    const everSentForPair =
      !!pair && now.getTime() - (pair.createdAt?.getTime() ?? 0) < PAIR_REOPEN_DAYS * DAY_MS;

    const counts = await alertCounts(recipient.userId, now);
    const gate = evaluateGates({
      everSentForPair,
      msSinceLastAlert: counts.msSinceLast,
      alertsToday: counts.today,
      alertsThisWeek: counts.week,
      localHour: localHour(recipient.timezone),
      quietStart: recipient.proximityQuietStart ?? 21,
      quietEnd: recipient.proximityQuietEnd ?? 8,
    });
    if (!gate.send) return false;

    const distM =
      recipient.locationLat && subject.locationLat
        ? haversineKm(
            Number(recipient.locationLat),
            Number(recipient.locationLng),
            Number(subject.locationLat),
            Number(subject.locationLng),
          ) * 1000
        : place.radiusM;
    const bucket = distanceBucketFor(distM, place.placeType);
    const tier = recipient.subscriptionTier ?? "free";
    const id = `pa_${Math.random().toString(36).slice(2, 10)}`;

    const claimed = await db
      .insert(proximityAlerts)
      .values({
        id,
        recipientId: recipient.userId,
        subjectId: subject.userId,
        placeId: place.id,
        placeType: place.placeType,
        distanceBucket: bucket,
        tierAtSend: tier,
        expiresAt: new Date(now.getTime() + ALERT_TTL_MS),
      })
      .onConflictDoNothing()
      .returning({ id: proximityAlerts.id });
    if (claimed.length === 0) return false; // lost the race / dedupe

    const { where } = placePhrase(place.placeType, place.name);
    const body = `Someone ${where} is well inside what you're looking for. I'd start there.`;
    await db.insert(twinNotifications).values({
      userId: recipient.userId,
      type: "proximity",
      title: "Your twin",
      body,
    });
    sendPush(recipient.userId, {
      title: "Your twin",
      body: `${body}`,
      url: "/notifications",
      tag: `proximity-${place.id}`,
    }).catch(() => {});
    sent += 1;
    return true;
  };

  // 1) tell the reporter about the single best co-present match
  for (const cand of rankedForReporter) {
    if (await tryEmit(reporter, cand)) break;
  }
  // 2) tell each co-present person about the reporter (their own gates apply)
  for (const cand of rankedForReporter) {
    await tryEmit(cand, reporter);
  }

  if (sent > 0) console.log(`[proximity] reporter ${reporterId} @ place ${place.id}: ${sent} sent`);
  return { sent };
}

// ── serializers: free carries ZERO identity, paid adds the subject ─────
const BUCKET_LABEL: Record<string, string> = {
  same_place: "RIGHT HERE",
  few_hundred_m: "A FEW HUNDRED METRES",
  this_campus: "ON THIS CAMPUS",
  this_area: "IN THIS AREA",
};

export function freshnessLabel(createdAt: Date, now = new Date()): string {
  const min = Math.max(1, Math.round((now.getTime() - createdAt.getTime()) / 60000));
  return `SEEN ${min} MINUTE${min === 1 ? "" : "S"} AGO`;
}

type AlertRow = typeof proximityAlerts.$inferSelect;

export function serializeAlert(
  row: AlertRow,
  place: { name: string; placeType: string },
  canSeeIdentity: boolean,
  subject: { userId: string; firstName: string; portraitUrl: string | null } | null,
) {
  const base = {
    id: row.id,
    kind: "proximity" as const,
    createdAt: row.createdAt,
    seenAt: row.seenAt,
    place: { label: place.name, type: place.placeType },
    distanceBucket: row.distanceBucket,
    distanceLabel: BUCKET_LABEL[row.distanceBucket] ?? "NEARBY",
    freshness: row.createdAt ? freshnessLabel(row.createdAt) : "JUST NOW",
    read: {
      kind: "preference_match" as const,
      line: `Someone ${placePhrase(place.placeType, place.name).where} is well inside what you're looking for.`,
    },
  };
  if (canSeeIdentity && subject) {
    return {
      ...base,
      subject: {
        userId: subject.userId,
        firstName: subject.firstName,
        portraitUrl: subject.portraitUrl,
        profileUrl: `/u/${subject.userId}`,
      },
      actions: ["open_profile", "ask_twin", "dismiss", "report"],
    };
  }
  return {
    ...base,
    locked: {
      reason: "tier" as const,
      requiredTier: "spark" as const,
      line: "Spark opens the profile and lets you ask their twin.",
    },
    actions: ["dismiss", "report", "open_plans"],
  };
}

// Sweep stale pings (no trail): null out location on rows older than 30 min.
export async function sweepStaleLocations(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const res = await db
    .update(profiles)
    .set({ currentPlaceId: null, locationLat: null, locationLng: null, locationName: null })
    .where(and(lt(profiles.locationUpdatedAt, cutoff), isNotNull(profiles.currentPlaceId)))
    .returning({ id: profiles.id });
  return res.length;
}
