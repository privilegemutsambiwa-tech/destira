// Guards the line that keeps Events about evenings, not people:
// ATTENDEE RESONANCE MUST NEVER INFLUENCE THE FEED SORT.
//
//   npm run check:feed
//
// scoreEventForUser is pure and takes no attendee data, so the guarantee is
// structural — this asserts it stays that way, and spot-checks the weights.
import { scoreEventForUser, FIT_WEIGHTS, type FeedContext } from "../server/events-fit";
import type { Event, EventPreferences } from "../shared/schema";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "  ok  " : " FAIL "} ${name}`);
  if (!cond) failures += 1;
};

const ctx: FeedContext = {
  originLat: -17.8292,
  originLng: 31.0522,
  centroidBySuburb: new Map([["Avondale", { lat: -17.7969, lng: 31.0389 }]]),
  myGroupIds: new Set<number>(),
  now: new Date("2026-01-01T09:00:00.000Z"),
};

const baseEvent = (over: Partial<Event> = {}): Event => ({
  id: 1,
  groupId: null,
  hostUserId: "host",
  title: "t",
  description: null,
  venueName: null,
  suburb: "Avondale",
  city: "Harare",
  startsAt: new Date("2026-02-15T18:00:00.000Z"), // well beyond 7 days from ctx.now
  endsAt: null,
  seatModel: "open",
  seatCount: null,
  emberFirstPick: false,
  coverImageUrl: null,
  status: "published",
  createdAt: null,
  kind: "music",
  vibes: ["seated"],
  placeType: "venue",
  lat: null,
  lng: null,
  isSober: false,
  accessibility: null,
  ageMin: null,
  ageMax: null,
  createdByUserId: null,
  visibility: "public",
  ...over,
});

const basePrefs = (over: Partial<EventPreferences> = {}): EventPreferences => ({
  userId: "u",
  kinds: null,
  vibes: null,
  maxDistanceKm: 50,
  placeTypes: null,
  groupSizeMax: null,
  daysOfWeek: null,
  timeWindows: null,
  ageRangeMin: null,
  ageRangeMax: null,
  soberOnly: false,
  accessibilityNeeds: null,
  notifyOnGoodMatch: true,
  notifyThreshold: 82,
  updatedAt: null,
  ...over,
});

// 1 — the core guarantee: two events identical except their id (i.e. differ only
// in "which event, and by extension who is going") score identically.
{
  const prefs = basePrefs({ kinds: ["music"], vibes: ["seated"], placeTypes: ["venue"] });
  const a = scoreEventForUser(baseEvent({ id: 1 }), prefs, ctx);
  const b = scoreEventForUser(baseEvent({ id: 999 }), prefs, ctx);
  check("attendees / event identity cannot change fit score", a.score === b.score && a.pass === b.pass);
}

// 2 — scoreEventForUser takes exactly (event, prefs, ctx). A 4th param would be
// where an attendee-resonance term crept in.
check("scoreEventForUser arity is 3 (no attendee param)", scoreEventForUser.length === 3);

// 3 — weights land where documented
check(
  "kind match = +30",
  scoreEventForUser(baseEvent(), basePrefs({ kinds: ["music"] }), ctx).score === FIT_WEIGHTS.kind,
);
check(
  "vibe matches cap at +24",
  scoreEventForUser(
    baseEvent({ vibes: ["quiet", "loud", "active", "seated"] }),
    basePrefs({ vibes: ["quiet", "loud", "active", "seated"] }),
    ctx,
  ).score === FIT_WEIGHTS.vibeCap,
);
check(
  "placeType match = +12",
  scoreEventForUser(baseEvent(), basePrefs({ placeTypes: ["venue"] }), ctx).score === FIT_WEIGHTS.placeType,
);
check(
  "no preferences → score 0 but still passes",
  (() => {
    const r = scoreEventForUser(baseEvent(), basePrefs(), ctx);
    return r.pass && r.score === 0;
  })(),
);
check(
  "starts within 7 days → +10",
  scoreEventForUser(
    baseEvent({ startsAt: new Date(ctx.now.getTime() + 2 * 864e5) }),
    basePrefs(),
    ctx,
  ).score === FIT_WEIGHTS.soon,
);

// 4 — hard filters drop, never score
check(
  "distance beyond maxDistanceKm → dropped",
  scoreEventForUser(baseEvent(), basePrefs({ maxDistanceKm: 1 }), ctx).pass === false,
);
check(
  "unresolvable location → dropped (no null-distance path)",
  scoreEventForUser(baseEvent({ suburb: "Nowhere", lat: null, lng: null }), basePrefs(), ctx).pass === false,
);
check(
  "past event → dropped",
  scoreEventForUser(baseEvent({ startsAt: new Date("2020-01-01T00:00:00.000Z") }), basePrefs(), ctx).pass === false,
);
check(
  "invite-only → dropped",
  scoreEventForUser(baseEvent({ visibility: "invite" }), basePrefs(), ctx).pass === false,
);
check(
  "soberOnly + non-sober event → dropped",
  scoreEventForUser(baseEvent({ isSober: false }), basePrefs({ soberOnly: true }), ctx).pass === false,
);

console.log(failures === 0 ? "\nfeed sort: all checks passed" : `\nfeed sort: ${failures} FAILED`);
process.exit(failures ? 1 : 0);
