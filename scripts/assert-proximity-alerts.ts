// Guards the safety + "never nag" rules for Twin Proximity Alerts:
//
//   npm run check:proximity
//
// evaluateGates() / inQuietHours() / distanceBucketFor() / preferenceFitBothWays()
// are pure — each is asserted in isolation here. The load-bearing one is the
// LAST block: the free serializer must carry ZERO identifying data.
import {
  evaluateGates,
  inQuietHours,
  distanceBucketFor,
  preferenceFitBothWays,
  serializeAlert,
  freshnessLabel,
  type GateState,
} from "../server/services/twin-proximity-alerts";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "  ok  " : " FAIL "} ${name}`);
  if (!cond) failures += 1;
};

const OPEN: GateState = {
  everSentForPair: false,
  msSinceLastAlert: null,
  alertsToday: 0,
  alertsThisWeek: 0,
  localHour: 12,
  quietStart: 21,
  quietEnd: 8,
};

// ── a clean state sends ──
check("clean state -> send", evaluateGates(OPEN).send === true);

// ── gate a: once per (recipient, subject, place); re-openable after 90d ──
check(
  "already alerted for this pair+place -> blocked",
  evaluateGates({ ...OPEN, everSentForPair: true }).blockedBy === "pair-cooldown",
);

// ── gate b: >= 6h between ANY two alerts ──
check(
  "alerted 5h ago -> blocked",
  evaluateGates({ ...OPEN, msSinceLastAlert: 5 * 3600_000 }).blockedBy === "global-cooldown",
);
check(
  "alerted 7h ago -> not blocked by cooldown",
  evaluateGates({ ...OPEN, msSinceLastAlert: 7 * 3600_000 }).send === true,
);

// ── gate c: <= 2 per day ──
check("1 alert today -> send", evaluateGates({ ...OPEN, alertsToday: 1 }).send === true);
check("2 alerts today -> blocked", evaluateGates({ ...OPEN, alertsToday: 2 }).blockedBy === "daily-cap");

// ── gate d: <= 4 per rolling 7 days ──
check("3 alerts this week -> send", evaluateGates({ ...OPEN, alertsThisWeek: 3 }).send === true);
check(
  "4 alerts this week -> blocked",
  evaluateGates({ ...OPEN, alertsThisWeek: 4 }).blockedBy === "weekly-cap",
);

// ── gate e: quiet hours in the RECIPIENT's timezone ──
check("20:00 local -> send", evaluateGates({ ...OPEN, localHour: 20 }).send === true);
check("21:00 local -> blocked", evaluateGates({ ...OPEN, localHour: 21 }).blockedBy === "quiet-hours");
check("03:00 local -> blocked", evaluateGates({ ...OPEN, localHour: 3 }).blockedBy === "quiet-hours");
check("08:00 local -> send", evaluateGates({ ...OPEN, localHour: 8 }).send === true);

// priority order: pair-cooldown beats everything
check(
  "everSentForPair wins over a fresh window",
  evaluateGates({ ...OPEN, everSentForPair: true, msSinceLastAlert: null }).blockedBy ===
    "pair-cooldown",
);

// ── inQuietHours: wrap-around window 21..8 ──
check("inQuietHours(22, 21, 8) true", inQuietHours(22, 21, 8) === true);
check("inQuietHours(2, 21, 8) true", inQuietHours(2, 21, 8) === true);
check("inQuietHours(12, 21, 8) false", inQuietHours(12, 21, 8) === false);
check("inQuietHours(8, 21, 8) false (end exclusive)", inQuietHours(8, 21, 8) === false);
check("inQuietHours(21, 21, 8) true (start inclusive)", inQuietHours(21, 21, 8) === true);
// non-wrapping window 9..17
check("inQuietHours(12, 9, 17) true", inQuietHours(12, 9, 17) === true);
check("inQuietHours(20, 9, 17) false", inQuietHours(20, 9, 17) === false);

// ── distanceBucketFor: coarse only, place-type aware ──
check("campus @ 80m -> same_place", distanceBucketFor(80, "campus") === "same_place");
check("campus @ 300m -> this_campus", distanceBucketFor(300, "campus") === "this_campus");
check("mall @ 40m -> same_place", distanceBucketFor(40, "mall") === "same_place");
check("mall @ 100m -> few_hundred_m", distanceBucketFor(100, "mall") === "few_hundred_m");
check("cafe @ 30m -> same_place", distanceBucketFor(30, "cafe") === "same_place");
check("street @ 500m -> this_area", distanceBucketFor(500, "street") === "this_area");
check(
  "bucket set is closed",
  ["same_place", "few_hundred_m", "this_campus", "this_area"].includes(
    distanceBucketFor(9999, "campus"),
  ),
);

// ── preferenceFitBothWays: symmetric, honours showDistance ──
const base = {
  age: 25,
  gender: "female",
  ageMinPreference: 21,
  ageMaxPreference: 35,
  showDistance: true,
} as any;
const him = {
  age: 28,
  gender: "male",
  ageMinPreference: 22,
  ageMaxPreference: 30,
  showDistance: true,
} as any;
check("mutual fit -> true", preferenceFitBothWays(base, him) === true);
check(
  "her age outside his window -> false",
  preferenceFitBothWays({ ...base, age: 40 }, him) === false,
);
check(
  "his age outside her window -> false",
  preferenceFitBothWays(base, { ...him, age: 50 }) === false,
);
check(
  "same gender -> false (mirrors checkNearby)",
  preferenceFitBothWays(base, { ...him, gender: "female" }) === false,
);
check(
  "she hid distance -> false",
  preferenceFitBothWays({ ...base, showDistance: false }, him) === false,
);
check(
  "he hid distance -> false",
  preferenceFitBothWays(base, { ...him, showDistance: false }) === false,
);
check(
  "unknown gender either side -> allowed",
  preferenceFitBothWays({ ...base, gender: null }, { ...him, gender: null }) === true,
);

// ── freshnessLabel ──
check(
  "freshnessLabel 1 min",
  freshnessLabel(new Date(Date.now() - 60_000)) === "SEEN 1 MINUTE AGO",
);
check(
  "freshnessLabel 5 min plural",
  freshnessLabel(new Date(Date.now() - 5 * 60_000)) === "SEEN 5 MINUTES AGO",
);

// ── THE LOAD-BEARING CHECK: free payload carries ZERO identity ──
const row = {
  id: "pa_test1234",
  recipientId: "rec-1",
  subjectId: "subj-secret-1",
  placeId: 7,
  placeType: "campus",
  distanceBucket: "same_place",
  tierAtSend: "free",
  identityReleased: false,
  createdAt: new Date(Date.now() - 3 * 60_000),
  seenAt: null,
  dismissedAt: null,
  expiresAt: new Date(Date.now() + 3600_000),
} as any;
const place = { name: "University of Zimbabwe", placeType: "campus" };
const subject = {
  userId: "subj-secret-1",
  firstName: "Tadiwa",
  portraitUrl: "/uploads/tadiwa.jpg",
};

const free = serializeAlert(row, place, false, null);
const freeJson = JSON.stringify(free);
check("free: no subjectId", !freeJson.includes("subj-secret-1"));
check("free: no first name", !freeJson.includes("Tadiwa"));
check("free: no portrait url", !freeJson.includes("tadiwa.jpg"));
check("free: no /u/ profile link", !freeJson.includes("/u/"));
check("free: no lat/lng/bearing keys", !/lat|lng|bearing|heading|coord/i.test(freeJson));
check("free: has a locked upsell", (free as any).locked?.requiredTier === "spark");
check(
  "free: actions are dismiss/report/open_plans only",
  JSON.stringify((free as any).actions) === JSON.stringify(["dismiss", "report", "open_plans"]),
);

const paid = serializeAlert(row, place, true, subject);
const paidJson = JSON.stringify(paid);
check("paid: exposes the subject", (paid as any).subject?.userId === "subj-secret-1");
check("paid: exposes first name", paidJson.includes("Tadiwa"));
check("paid: profile link is /u/:id", (paid as any).subject?.profileUrl === "/u/subj-secret-1");
check("paid: no lat/lng/bearing", !/\blat\b|\blng\b|bearing|heading/i.test(paidJson));
check(
  "paid: actions include open_profile + ask_twin",
  (paid as any).actions.includes("open_profile") && (paid as any).actions.includes("ask_twin"),
);

// distance bucket is byte-identical between free and paid — money buys identity,
// never finer location.
check(
  "distanceBucket identical free vs paid",
  (free as any).distanceBucket === (paid as any).distanceBucket &&
    (free as any).distanceLabel === (paid as any).distanceLabel,
);

console.log(failures === 0 ? "\nall proximity checks passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
