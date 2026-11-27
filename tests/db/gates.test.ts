// Plan enforcement (server/gate.ts): which tier a member is really on, and
// what each gate allows. The client can lie; this is what decides.
import { describe, expect, it } from "vitest";
import { LIMITS } from "@shared/entitlements";
import { checkGate, gateBody, getEffectiveTier } from "../../server/gate";
import { addMember } from "./fixtures";

describe("the tier a member is really on", () => {
  it("no plan is free", async () => {
    await addMember("g-free");
    expect(await getEffectiveTier("g-free")).toBe("free");
  });
  it("an active plan counts", async () => {
    await addMember("g-flame", {}, { tier: "flame", endsInDays: 20 });
    expect(await getEffectiveTier("g-flame")).toBe("flame");
  });
  it("a plan past its end is free again, whatever the profile says", async () => {
    await addMember("g-lapsed", { subscriptionTier: "flame" }, { tier: "flame", endsInDays: -1 });
    expect(await getEffectiveTier("g-lapsed")).toBe("free");
  });
  it("a cancelled plan is free", async () => {
    await addMember("g-cancelled", {}, { tier: "ember", endsInDays: 20, status: "cancelled" });
    expect(await getEffectiveTier("g-cancelled")).toBe("free");
  });
  it("old tier names still map", async () => {
    await addMember("g-legacy", { subscriptionTier: "plus" });
    expect(await getEffectiveTier("g-legacy")).toBe("flame");
  });
});

describe("gates", () => {
  it("a tier feature: free can't host an event, Flame can", async () => {
    const free = await checkGate("g-free", "host_event");
    expect(free).toMatchObject({ ok: false, tier: "free" });
    expect(free.requiredTier).toBeTruthy();
    expect((await checkGate("g-flame", "host_event")).ok).toBe(LIMITS.flame.canHostEvent);
  });

  it("a daily count: allowed under the limit, refused at it with a reset time", async () => {
    const limit = LIMITS.free.dailyLikes!;
    expect((await checkGate("g-free", "daily_likes", { countOverride: limit - 1 })).ok).toBe(true);
    const at = await checkGate("g-free", "daily_likes", { countOverride: limit });
    expect(at).toMatchObject({ ok: false, limit, used: limit, requiredTier: "spark" });
    expect(new Date(at.resetAt!).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(at.resetAt!).getTime() - Date.now()).toBeLessThanOrEqual(86_400_000);
  });

  it("no limit means no count is checked", async () => {
    await addMember("g-ember", {}, { tier: "ember", endsInDays: 20 });
    expect(await checkGate("g-ember", "daily_likes", { countOverride: 10_000 })).toMatchObject({ ok: true, limit: null });
  });

  it("rooms you create: none on free, a cap on Flame, Ember lifts it", async () => {
    expect((await checkGate("g-free", "create_group")).ok).toBe(false);
    const cap = LIMITS.flame.groupsCreatedMax;
    if (cap != null && cap > 0) {
      expect((await checkGate("g-flame", "create_group", { countOverride: cap - 1 })).ok).toBe(true);
      expect(await checkGate("g-flame", "create_group", { countOverride: cap })).toMatchObject({ ok: false, requiredTier: "ember" });
    }
    expect((await checkGate("g-ember", "create_group", { countOverride: 50 })).ok).toBe(true);
  });

  it("the refusal body the app reads", async () => {
    const g = await checkGate("g-free", "daily_likes", { countOverride: LIMITS.free.dailyLikes! });
    const body = gateBody(g, "daily_likes");
    expect(body).toMatchObject({ upgradeRequired: true, feature: "daily_likes", currentTier: "free", requiredTier: "spark" });
    expect(body.message.length).toBeGreaterThan(10);
    expect(body.resetAt).toBe(g.resetAt);
  });
});
