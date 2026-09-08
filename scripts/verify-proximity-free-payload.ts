// One-shot live check of the safety non-negotiable: a FREE proximity alert
// payload — as the GET /api/proximity/alerts route assembles it — carries zero
// identifying data about the subject. Exercises the real job path (co-present
// query, gates, insert), not just the serializer.
//
//   (stop the dev server first — single DB writer)
//   npx tsx scripts/verify-proximity-free-payload.ts
//
// Seeds two throwaway users at the University of Zimbabwe, runs the job, reads
// the alert row B receives about A, serializes it the free way, and asserts no
// identity leaks. Cleans up after itself.

import { db } from "../server/db";
import { users } from "../shared/models/auth";
import { profiles, places, proximityAlerts, twinNotifications, matches, blockedUsers } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";
import { runProximityForReporter, serializeAlert } from "../server/services/twin-proximity-alerts";
import { checkGate } from "../server/gate";

const A = "px_verify_a";
const B = "px_verify_b";
const UZ_LAT = -17.784;
const UZ_LNG = 31.053;

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "  ok  " : " FAIL "} ${name}`);
  if (!cond) failures += 1;
};

async function cleanup() {
  await db.delete(proximityAlerts).where(inArray(proximityAlerts.recipientId, [A, B]));
  await db.delete(proximityAlerts).where(inArray(proximityAlerts.subjectId, [A, B]));
  await db.delete(twinNotifications).where(inArray(twinNotifications.userId, [A, B]));
  await db.delete(profiles).where(inArray(profiles.userId, [A, B]));
  await db.delete(users).where(inArray(users.id, [A, B]));
}

async function main() {
  const [uz] = await db.select().from(places).where(eq(places.name, "University of Zimbabwe"));
  if (!uz) throw new Error("UZ place not seeded — start the server once, then retry.");

  await cleanup();
  const now = new Date();

  await db.insert(users).values([
    { id: A, email: `${A}@example.test`, firstName: "Tendai" },
    { id: B, email: `${B}@example.test`, firstName: "Rutendo" },
  ]);

  const common = {
    onboardingCompleted: true,
    isPublic: true,
    isVerified: true,
    subscriptionTier: "free",
    showDistance: true,
    currentPlaceId: uz.id,
    locationLat: String(UZ_LAT),
    locationLng: String(UZ_LNG),
    locationName: uz.name,
    locationUpdatedAt: now,
    proximityMode: "everywhere",
    proximityPausedUntil: null,
    proximityQuietStart: 0,
    proximityQuietEnd: 0,
  } as const;

  await db.insert(profiles).values([
    { userId: A, displayName: "Tendai M", age: 28, gender: "male", ageMinPreference: 20, ageMaxPreference: 45, ...common },
    { userId: B, displayName: "Rutendo K", age: 26, gender: "female", ageMinPreference: 22, ageMaxPreference: 40, ...common },
  ]);

  // A reports in → job fires. Step 2 tells each co-present person about A, so B
  // gets an alert whose subject is A.
  const res = await runProximityForReporter(A);
  console.log(`\njob: ${JSON.stringify(res)}`);

  const [rowForB] = await db.select().from(proximityAlerts).where(eq(proximityAlerts.recipientId, B));
  check("B received an alert about A", !!rowForB && rowForB.subjectId === A);
  if (!rowForB) {
    await cleanup();
    console.log("\nno alert row — cannot verify payload");
    process.exit(1);
  }

  // Assemble the response exactly as GET /api/proximity/alerts does for B.
  const g = await checkGate(B, "proximity_identity");
  check("B is gated out of identity (free tier)", g.ok === false);

  const free = serializeAlert(
    rowForB,
    { name: uz.name, placeType: uz.placeType },
    g.ok,
    null,
  );
  const payload = JSON.stringify({ alerts: [free], canSeeIdentity: g.ok, upsell: null });
  console.log(`\nfree payload B would receive:\n${JSON.stringify(free, null, 2)}\n`);

  check("no subject user id", !payload.includes(A));
  check("no subject first name (Tendai)", !/tendai/i.test(payload));
  check("no /u/ profile link", !payload.includes("/u/"));
  check("no portrait / photo key", !/portrait|photoUrl|avatar/i.test(payload));
  check("no coordinates or bearing", !/\blat\b|\blng\b|latitude|longitude|bearing|heading/i.test(payload));
  check("distance is a coarse bucket only", ["same_place", "few_hundred_m", "this_campus", "this_area"].includes((free as any).distanceBucket));
  check("free branch exposes a tier lock, not a person", (free as any).locked?.requiredTier === "spark" && !(free as any).subject);

  // sanity: the PAID serialization of the same row *does* carry identity
  const paid = serializeAlert(
    rowForB,
    { name: uz.name, placeType: uz.placeType },
    true,
    { userId: A, firstName: "Tendai", portraitUrl: "/uploads/x.jpg" },
  );
  check("paid serialization does expose the subject", (paid as any).subject?.userId === A);
  check("bucket identical free vs paid", (free as any).distanceBucket === (paid as any).distanceBucket);

  await cleanup();
  console.log(failures === 0 ? "\nfree payload carries no identity — verified" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  process.exit(1);
});
