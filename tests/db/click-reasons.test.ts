// "Why you might click" (server/click-reasons.ts): only things both people
// said, or the app saw. At most three, nothing invented, empty when nothing
// is true.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../server/db";
import { twinProfilesStructured, userActivityDaily } from "@shared/schema";
import { withClickReasons } from "../../server/click-reasons";
import { addMember, DAY } from "./fixtures";

const old = new Date(Date.now() - 60 * DAY);

beforeAll(async () => {
  await addMember("c-me", { location: "Harare", datingIntent: "relationship", details: { faith: "catholic", wantsChildren: "yes" } as any });
  await db.insert(twinProfilesStructured).values({ userId: "c-me", interests: ["Hiking", "jazz", "cooking"] });

  await addMember("c-alike", { location: "harare ", datingIntent: "relationship", details: { faith: "catholic", wantsChildren: "yes" } as any });
  await addMember("c-stranger", { location: "Bulawayo", datingIntent: "see", details: { faith: "muslim" } as any });
  await addMember("c-new", { location: "Mutare" });
  await addMember("c-active", { location: "Gweru" });
  await db.insert(userActivityDaily).values({ userId: "c-active", date: new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10) });
});

const reasonsFor = async (c: { userId: string; location?: string; interests?: string[]; createdAt?: Date }) =>
  (await withClickReasons("c-me", [c]))[0].reasons;

describe("why you might click", () => {
  it("shared interests, case aside, named naturally", async () => {
    const r = await reasonsFor({ userId: "c-alike", location: "Harare", interests: ["jazz", "HIKING", "chess"], createdAt: old });
    expect(r[0]).toEqual({ kind: "interests", text: "You both like jazz and HIKING" });
  });

  it("never more than three, strongest first", async () => {
    const r = await reasonsFor({ userId: "c-alike", location: "Harare", interests: ["jazz"], createdAt: old });
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r.map((x) => x.kind)).toEqual(["interests", "intent", "details"]);
  });

  it("same intent and same answers on the profile", async () => {
    const r = await reasonsFor({ userId: "c-alike", location: "Harare", createdAt: old });
    expect(r.map((x) => x.kind)).toContain("intent");
    expect(r.find((x) => x.kind === "details")?.text).toMatch(/Catholic/i);
  });

  it("nothing in common, nothing said", async () => {
    expect(await reasonsFor({ userId: "c-stranger", location: "Bulawayo", interests: ["golf"], createdAt: old })).toEqual([]);
  });

  it("new this week, or active this week", async () => {
    expect(await reasonsFor({ userId: "c-new", location: "Mutare", createdAt: new Date(Date.now() - DAY) })).toEqual([{ kind: "new", text: "New on Destira" }]);
    expect(await reasonsFor({ userId: "c-active", location: "Gweru", createdAt: old })).toEqual([{ kind: "active", text: "Active this week" }]);
  });

  it("no candidates, no work", async () => {
    expect(await withClickReasons("c-me", [])).toEqual([]);
  });
});
