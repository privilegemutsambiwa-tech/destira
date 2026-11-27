// The Discover deck score (server/matching.ts matchScoreExpr): a better fit
// comes up sooner, nobody falls below the floor, and someone shown to a great
// many people yesterday is damped today.
import { beforeAll, describe, expect, it } from "vitest";
import { desc, inArray } from "drizzle-orm";
import { db } from "../../server/db";
import { memberMatchStats, profiles, type Profile } from "@shared/schema";
import { matchScoreExpr, POPULAR_CAP } from "../../server/matching";
import type { MatchPrefs } from "@shared/match-prefs";
import { addMember, DAY } from "./fixtures";

const old = new Date(Date.now() - 60 * DAY);
const IDS = ["d-same-faith", "d-christian", "d-other", "d-clash", "d-popular", "d-twin", "d-replies", "d-silent", "d-pref"];
let viewer: Profile;

beforeAll(async () => {
  await addMember("d-viewer", { age: 30, details: { faith: "catholic", wantsChildren: "yes" } as any });
  viewer = (await db.select().from(profiles).where(inArray(profiles.userId, ["d-viewer"])))[0];
  const base = { createdAt: old, ageMinPreference: 18, ageMaxPreference: 99 };
  await addMember("d-same-faith", { ...base, details: { faith: "catholic" } as any });
  await addMember("d-christian", { ...base, details: { faith: "methodist" } as any });
  await addMember("d-other", { ...base, details: { faith: "spiritual" } as any });
  await addMember("d-clash", { ...base, details: { faith: "spiritual", wantsChildren: "no" } as any, ageMinPreference: 40, ageMaxPreference: 50 });
  // Identical, except one was dealt into far too many decks yesterday.
  await addMember("d-popular", { ...base, details: { faith: "catholic" } as any });
  await addMember("d-twin", { ...base, details: { faith: "catholic" } as any });
  await db.insert(memberMatchStats).values({ userId: "d-popular", shownYesterday: POPULAR_CAP * 4 });
  // Identical, except one answers and one never does.
  await addMember("d-replies", { ...base, details: { faith: "spiritual" } as any });
  await addMember("d-silent", { ...base, details: { faith: "spiritual" } as any });
  await db.insert(memberMatchStats).values([
    { userId: "d-replies", replyRate: 1, replySample: 10 },
    { userId: "d-silent", replyRate: 0, replySample: 10 },
  ]);
  await addMember("d-pref", { ...base, details: { faith: "spiritual", marriage: "1y" } as any });
});

async function scores(prefs: MatchPrefs = {}) {
  const expr = matchScoreExpr(viewer, prefs);
  const rows = await db
    .select({ id: profiles.userId, score: expr })
    .from(profiles)
    .where(inArray(profiles.userId, IDS))
    .orderBy(desc(expr));
  return new Map(rows.map((r) => [r.id, Number(r.score)]));
}

describe("discover order", () => {
  it("same faith > both Christian > neither", async () => {
    const s = await scores();
    expect(s.get("d-same-faith")!).toBeGreaterThan(s.get("d-christian")!);
    expect(s.get("d-christian")!).toBeGreaterThan(s.get("d-other")!);
  });

  it("opposite answers on children, outside their age range: lowest, but never below the floor", async () => {
    const s = await scores();
    const undamped = [...s].filter(([id]) => id !== "d-popular").map(([, v]) => v);
    expect(Math.min(...undamped)).toBe(s.get("d-clash"));
    expect(s.get("d-clash")!).toBeGreaterThanOrEqual(0.3);
  });

  it("someone shown to everyone yesterday is damped today, to no less than a quarter", async () => {
    const s = await scores();
    expect(s.get("d-popular")!).toBeLessThan(s.get("d-twin")!);
    expect(s.get("d-popular")!).toBeCloseTo(s.get("d-twin")! * 0.25, 5);
  });

  it("people who answer come up before people who never do", async () => {
    const s = await scores();
    expect(s.get("d-replies")!).toBeGreaterThan(s.get("d-silent")!);
  });

  it("a preference that isn't a dealbreaker lifts those who meet it, and hides nobody", async () => {
    const without = await scores();
    const withPref = await scores({ marriage: { values: ["1y"], must: false } } as MatchPrefs);
    expect(withPref.get("d-pref")!).toBeGreaterThan(without.get("d-pref")!);
    expect(withPref.size).toBe(without.size);
  });
});
