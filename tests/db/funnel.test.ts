// The console Funnel (server/admin/funnel.ts): a confirmed date counts as
// "planned" for both people, a proposed one doesn't; selfie-verified
// members are counted; and sign-up time is measured from the account to the
// basics being saved.
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../server/db";
import { users } from "@shared/models/auth";
import { datePlans, matches, profiles } from "@shared/schema";
import { funnelReport } from "../../server/admin/funnel";
import { addMember } from "./fixtures";
import { duration } from "../../client/src/admin/AdminFunnel";

const MIN = 60_000;

let before: Awaited<ReturnType<typeof funnelReport>>["total"];

beforeAll(async () => {
  before = (await funnelReport(30)).total;
  await addMember("fun-a", { isVerified: true });
  await addMember("fun-b");
  await addMember("fun-c");
  // Sign-up took 90 s for a, 3 min for b, 10 min for c.
  for (const [id, sec] of [["fun-a", 90], ["fun-b", 180], ["fun-c", 600]] as const) {
    const created = new Date(Date.now() - 60 * MIN);
    await db.update(users).set({ createdAt: created }).where(eq(users.id, id));
    await db.update(profiles).set({ createdAt: new Date(created.getTime() + sec * 1000) }).where(eq(profiles.userId, id));
  }
  const [ab] = await db.insert(matches).values({ user1Id: "fun-a", user2Id: "fun-b", status: "matched" }).returning();
  const [ac] = await db.insert(matches).values({ user1Id: "fun-a", user2Id: "fun-c", status: "matched" }).returning();
  const base = { kind: "coffee", placeName: "Sam Levy's Village", times: [new Date().toISOString()] };
  await db.insert(datePlans).values({ ...base, matchId: ab.id, proposerId: "fun-a", status: "confirmed" });
  await db.insert(datePlans).values({ ...base, matchId: ac.id, proposerId: "fun-c", status: "proposed" });
});

describe("the Funnel", () => {
  it("counts a confirmed date for both people, not a proposed one", async () => {
    const t = (await funnelReport(30)).total;
    expect(t.signups - before.signups).toBe(3);
    expect(t.planned - before.planned).toBe(2);
    expect(t.verified - before.verified).toBe(1);
  });

  it("measures sign-up time from the account to the basics", async () => {
    // A fresh database: only these three members, so the median is exact.
    const { signup } = await funnelReport(30);
    expect(signup.finished).toBe(3);
    expect(signup.medianSec).toBe(180);
    expect(signup.p90Sec).toBeGreaterThan(180);
    expect(signup.p90Sec).toBeLessThanOrEqual(600);
  });

  it("writes durations plainly", () => {
    expect(duration(null)).toBe("–");
    expect(duration(48)).toBe("48 s");
    expect(duration(94)).toBe("1 min 34 s");
    expect(duration(120)).toBe("2 min");
    expect(duration(7500)).toBe("2 h 5 min");
  });
});
