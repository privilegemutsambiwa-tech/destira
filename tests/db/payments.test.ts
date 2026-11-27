// A plan payment from start to finish (server/payments), on the mock
// gateway: pending -> paid switches the plan on once; a decline, an expiry or
// a wrong amount never does.
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../server/db";
import { payments, profiles, subscriptions } from "@shared/schema";
import { activateFromPayment, initiatePayment, refreshPayment } from "../../server/payments";
import { getEffectiveTier } from "../../server/gate";
import { LIMITS } from "@shared/entitlements";
import { addMember, DAY } from "./fixtures";

const subOf = async (id: string) => (await db.select().from(subscriptions).where(eq(subscriptions.userId, id)))[0];
const payment = async (id: number) => (await db.select().from(payments).where(eq(payments.id, id)))[0];

describe("paying for a plan", () => {
  it("pending, then paid: the plan is on, for a month, at the server's price", async () => {
    await addMember("p-ok");
    const init = await initiatePayment("p-ok", "flame", "monthly", "ecocash", "0771234567", undefined);
    expect(init.status).toBe("pending");
    const row = await payment(init.paymentId);
    expect(row.amount).toBe(LIMITS.flame.priceCents);
    expect(row.phoneNumberMasked).toBe("07•• ••• 4567");

    const after = await refreshPayment(init.paymentId);
    expect(after?.status).toBe("paid");
    const sub = await subOf("p-ok");
    expect(sub).toMatchObject({ tier: "flame", status: "active" });
    const days = (sub.currentPeriodEnd!.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect(await getEffectiveTier("p-ok")).toBe("flame");
    const [p] = await db.select({ tier: profiles.subscriptionTier }).from(profiles).where(eq(profiles.userId, "p-ok"));
    expect(p.tier).toBe("flame");
  });

  it("the app's poll and the gateway's webhook arriving together extend the plan once", async () => {
    const before = (await subOf("p-ok")).currentPeriodEnd!.getTime();
    const [row] = await db.select().from(payments).where(eq(payments.userId, "p-ok"));
    await Promise.all([activateFromPayment(row.id), activateFromPayment(row.id)]);
    expect((await subOf("p-ok")).currentPeriodEnd!.getTime()).toBe(before);
    expect((await refreshPayment(row.id))?.status).toBe("paid"); // a paid payment stays paid
  });

  it("a second tap within minutes hands back the same payment", async () => {
    await addMember("p-twice");
    const a = await initiatePayment("p-twice", "spark", "monthly", "ecocash", "0771234567", undefined);
    const b = await initiatePayment("p-twice", "spark", "monthly", "ecocash", "0771234567", undefined);
    expect(b.paymentId).toBe(a.paymentId);
    expect((b as any).resumed).toBe(true);
  });

  it("declined on the phone: failed, no plan", async () => {
    await addMember("p-declined");
    const init = await initiatePayment("p-declined", "flame", "monthly", "ecocash", "0770000000", undefined);
    expect((await refreshPayment(init.paymentId))?.status).toBe("failed");
    expect(await subOf("p-declined")).toBeUndefined();
    expect(await getEffectiveTier("p-declined")).toBe("free");
  });

  it("the prompt expired: expired, no plan", async () => {
    await addMember("p-expired");
    const init = await initiatePayment("p-expired", "flame", "monthly", "ecocash", "0779999999", undefined);
    expect((await refreshPayment(init.paymentId))?.status).toBe("expired");
    expect(await getEffectiveTier("p-expired")).toBe("free");
  });

  it("the gateway settled a different amount: failed, no plan", async () => {
    await addMember("p-short");
    const init = await initiatePayment("p-short", "ember", "monthly", "ecocash", "0771234567", undefined);
    // What we expect no longer matches what the gateway will say settled.
    await db.update(payments).set({ amount: LIMITS.ember.priceCents + 500 }).where(eq(payments.id, init.paymentId));
    const after = await refreshPayment(init.paymentId);
    expect(after?.status).toBe("failed");
    expect((await payment(init.paymentId)).failureReason).toMatch(/did not match/);
    expect(await getEffectiveTier("p-short")).toBe("free");
  });
});
