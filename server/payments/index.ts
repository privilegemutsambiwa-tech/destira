// Payment orchestration. The ONE place that turns a confirmed payment into a
// live subscription. Webhook/poll confirmation activates the plan — never the
// client's word.

import { db } from "../db";
import { payments, subscriptions, profiles } from "@shared/schema";
import { LIMITS } from "@shared/entitlements";
import { and, eq, gte } from "drizzle-orm";
import { MockProvider } from "./mock";
import { PaynowProvider, paynowConfigured } from "./paynow";
import { maskPhone, type PaymentMethod, type PaymentProvider, type PaymentStatus } from "./types";

const mock = new MockProvider();
const paynow = new PaynowProvider();

const useMock = () => process.env.PAYMENTS_MOCK === "1" || !paynowConfigured();

export function providerFor(method: PaymentMethod): { provider: PaymentProvider; name: string } {
  if (useMock()) return { provider: mock, name: "mock" };
  return { provider: paynow, name: method === "card" ? "paynow_card" : method === "ecocash_card" ? "paynow_card" : "paynow_ecocash" };
}

export function priceCentsFor(tier: "spark" | "flame" | "ember"): number {
  return LIMITS[tier].priceCents;
}

// A retried initiate for the same (user, tier) inside 15 min returns the
// existing pending row — a double-tap gets charged once.
export async function initiatePayment(
  userId: string,
  tier: "spark" | "flame" | "ember",
  method: PaymentMethod,
  phone: string | undefined,
  authEmail: string | undefined,
) {
  const amountCents = priceCentsFor(tier);
  const windowStart = new Date(Date.now() - 15 * 60 * 1000);
  const key = `${userId}:${tier}:${method}`;

  const [existing] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.idempotencyKey, key), eq(payments.status, "pending"), gte(payments.createdAt, windowStart)));
  if (existing) {
    return { paymentId: existing.id, status: existing.status as PaymentStatus, pollUrl: existing.pollUrl, resumed: true };
  }

  const { provider, name } = providerFor(method);
  const [row] = await db
    .insert(payments)
    .values({
      userId,
      tier,
      amount: amountCents,
      currency: "usd",
      status: "pending",
      provider: name,
      phoneNumberMasked: maskPhone(phone),
      idempotencyKey: key,
    })
    .returning();

  try {
    const r = await provider.initiate({
      reference: String(row.id),
      amountCents,
      currency: "usd",
      method,
      phone,
      authEmail,
    });
    await db
      .update(payments)
      .set({
        providerReference: r.providerReference ?? null,
        pollUrl: r.pollUrl ?? null,
        rawStatus: r.rawStatus ?? null,
        status: r.status === "failed" ? "failed" : "pending",
        failureReason: r.failureReason ?? null,
      })
      .where(eq(payments.id, row.id));

    return {
      paymentId: row.id,
      status: (r.status === "failed" ? "failed" : "pending") as PaymentStatus,
      instructions: r.instructions,
      redirectUrl: r.redirectUrl,
      pollUrl: r.pollUrl,
      failureReason: r.failureReason,
    };
  } catch (e: any) {
    await db.update(payments).set({ status: "failed", failureReason: String(e?.message || e) }).where(eq(payments.id, row.id));
    throw e;
  }
}

export async function refreshPayment(paymentId: number) {
  const [row] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!row) return null;
  if (row.status !== "pending") return row;
  if (!row.pollUrl) return row;

  const { provider } = providerFor("ecocash");
  const r = await provider.pollStatus(row.pollUrl);
  await db
    .update(payments)
    .set({ rawStatus: r.rawStatus ?? row.rawStatus, lastPolledAt: new Date(), failureReason: r.failureReason ?? row.failureReason })
    .where(eq(payments.id, paymentId));

  if (r.status === "paid") {
    const expected = row.amount;
    if (r.settledCents != null && !provider.verifyAmount(r.settledCents, expected)) {
      await db.update(payments).set({ status: "failed", failureReason: "Settled amount did not match" }).where(eq(payments.id, paymentId));
      return { ...row, status: "failed" as const };
    }
    await activateFromPayment(paymentId);
    const [fresh] = await db.select().from(payments).where(eq(payments.id, paymentId));
    return fresh;
  }
  if (r.status === "failed" || r.status === "cancelled" || r.status === "expired") {
    await db.update(payments).set({ status: r.status }).where(eq(payments.id, paymentId));
  }
  const [fresh] = await db.select().from(payments).where(eq(payments.id, paymentId));
  return fresh;
}

// Idempotent. Writes the payment as paid, creates/extends the subscription,
// sets profiles.subscriptionTier. Features are live on the next request — no
// logout.
export async function activateFromPayment(paymentId: number): Promise<void> {
  const [pay] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!pay || pay.status === "paid") return;
  const tier = pay.tier as "spark" | "flame" | "ember";

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

  const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, pay.userId));
  let subId: number;
  if (existingSub) {
    const base =
      existingSub.currentPeriodEnd && existingSub.currentPeriodEnd.getTime() > now.getTime()
        ? existingSub.currentPeriodEnd
        : now;
    const [s] = await db
      .update(subscriptions)
      .set({
        tier,
        status: "active",
        cancelAtPeriodEnd: false,
        provider: pay.provider,
        providerReference: pay.providerReference,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(base.getTime() + 31 * 24 * 60 * 60 * 1000),
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existingSub.id))
      .returning();
    subId = s.id;
  } else {
    const [s] = await db
      .insert(subscriptions)
      .values({
        userId: pay.userId,
        tier,
        status: "active",
        provider: pay.provider,
        providerReference: pay.providerReference,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();
    subId = s.id;
  }

  await db.update(payments).set({ status: "paid", subscriptionId: subId }).where(eq(payments.id, paymentId));
  await db.update(profiles).set({ subscriptionTier: tier }).where(eq(profiles.userId, pay.userId));
}

// Cancel: as easy as subscribing. Keep the tier until the paid period ends,
// then it drops to free on the next request (getEffectiveTier handles the
// expiry). Content created at the higher tier is never deleted.
export async function cancelSubscription(userId: string): Promise<{ endsAt: Date | null }> {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  if (!sub || sub.status !== "active") return { endsAt: null };
  await db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: true, status: sub.currentPeriodEnd ? "active" : "cancelled", updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id));
  if (!sub.currentPeriodEnd) {
    await db.update(profiles).set({ subscriptionTier: "free" }).where(eq(profiles.userId, userId));
  }
  return { endsAt: sub.currentPeriodEnd ?? null };
}

export function webhookProvider() {
  return providerFor("ecocash").provider;
}
