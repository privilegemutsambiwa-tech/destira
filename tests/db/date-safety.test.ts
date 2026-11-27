// The date safety check-in (server/date-safety.ts, Part B6): "All good?" goes
// out once, an hour into a confirmed date, only to whoever turned it on, and
// never for a date that was called off or long over.
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../server/db";
import { datePlans, dateSafetyChecks, matches, twinNotifications } from "@shared/schema";
import { runSafetyChecks } from "../../server/date-safety";
import { addMember } from "./fixtures";
import { helpMessageText, normalizeContactNumber, safetyCheckAt, safetyDue } from "@shared/date-safety";

const HOUR = 3_600_000;
const NOW = new Date();

let matchId: number;
async function plan(startedHoursAgo: number, status = "confirmed") {
  const startsAt = new Date(NOW.getTime() - startedHoursAgo * HOUR);
  const [p] = await db.insert(datePlans).values({ matchId, proposerId: "safe-a", kind: "coffee", placeName: "Sam Levy's Village", times: [startsAt.toISOString()], startsAt, status }).returning();
  await db.insert(dateSafetyChecks).values({ planId: p.id, userId: "safe-a", checkAt: safetyCheckAt(startsAt) });
  return p.id;
}
const check = async (planId: number) => (await db.select().from(dateSafetyChecks).where(eq(dateSafetyChecks.planId, planId)))[0];

beforeAll(async () => {
  await addMember("safe-a");
  await addMember("safe-b");
  const [m] = await db.insert(matches).values({ user1Id: "safe-a", user2Id: "safe-b", status: "matched" }).returning();
  matchId = m.id;
});

describe("the check-in sweep", () => {
  it("asks once, an hour in, and puts it in the bell", async () => {
    const due = await plan(1.5);
    const early = await plan(0.5);
    expect(await runSafetyChecks(NOW)).toBe(1);
    expect((await check(due)).pushedAt).not.toBeNull();
    expect((await check(early)).pushedAt).toBeNull();
    const bell = await db.select().from(twinNotifications).where(eq(twinNotifications.userId, "safe-a"));
    expect(bell.some((n) => n.type === "safety" && n.url === `/date-check/${due}`)).toBe(true);
    // Never twice.
    expect(await runSafetyChecks(NOW)).toBe(0);
  });

  it("skips a date that was called off, or is long over", async () => {
    const cancelled = await plan(1.5, "cancelled");
    const over = await plan(6);
    expect(await runSafetyChecks(NOW)).toBe(0);
    expect((await check(cancelled)).pushedAt).toBeNull();
    expect((await check(over)).pushedAt).toBeNull();
  });

  it("skips one already answered", async () => {
    const id = await plan(1.5);
    await db.update(dateSafetyChecks).set({ answer: "fine", answeredAt: new Date() }).where(eq(dateSafetyChecks.planId, id));
    expect(await runSafetyChecks(NOW)).toBe(0);
  });
});

describe("the pieces the phone uses", () => {
  it("is due from the check time until four hours later, unless answered", () => {
    const at = new Date(NOW.getTime() - HOUR);
    expect(safetyDue(at, null, NOW.getTime())).toBe(true);
    expect(safetyDue(at, "fine", NOW.getTime())).toBe(false);
    expect(safetyDue(new Date(NOW.getTime() + 60_000), null, NOW.getTime())).toBe(false);
    expect(safetyDue(new Date(NOW.getTime() - 5 * HOUR), null, NOW.getTime())).toBe(false);
  });

  it("turns a Zimbabwe number into one WhatsApp understands", () => {
    expect(normalizeContactNumber("077 123 4567")).toBe("263771234567");
    expect(normalizeContactNumber("+263 77 123 4567")).toBe("263771234567");
    expect(normalizeContactNumber("0771")).toBeNull();
    expect(normalizeContactNumber("call me")).toBeNull();
  });

  it("tells the contact where, when and who", () => {
    const text = helpMessageText({ kind: "coffee", placeName: "Sam Levy's Village", placeDetail: "Borrowdale", startsAt: "2026-11-29T12:00:00Z" }, "Tendai");
    expect(text).toContain("Tendai");
    expect(text).toContain("Coffee at Sam Levy's Village, Borrowdale");
    expect(text).toContain("14:00");
    expect(text).toContain("995");
  });
});
