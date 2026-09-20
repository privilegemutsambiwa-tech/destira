// Payment orchestration. The ONE place that turns a confirmed payment into a
// live subscription. Webhook/poll confirmation activates the plan — never the
// client's word.

import { db } from "../db";
import { payments, subscriptions, profiles } from "@shared/schema";
import { periodPriceCents, PERIOD_DAYS, type BillingPeriod } from "@shared/entitlements";
import { and, eq, gte, lt, isNull, or } from "drizzle-orm";
import { MockProvider } from "./mock";
import { PaynowProvider, paynowConfigured } from "./paynow";
import { maskPhone, type PaymentMethod, type PaymentProvider, type PaymentStatus } from "./types";
import { alertPaymentSuccess, alertPaymentFailed, alertPaymentStuck } from "../email/templates";

const mock = new MockProvider();
const paynow = new PaynowProvider();

const useMock = () => process.env.PAYMENTS_MOCK === "1" || !paynowConfigured();

export function providerFor(method: PaymentMethod): { provider: PaymentProvider; name: string } {
  if (useMock()) return { provider: mock, name: "mock" };
  const name = method === "card" || method === "ecocash_card" ? "paynow_card" : `paynow_${method}`;
  return { provider: paynow, name };
}

export function priceCentsFor(tier: "spark" | "flame" | "ember", period: BillingPeriod = "monthly"): number {
  return periodPriceCents(tier, period);
}

// A retried initiate for the same (user, tier, period) inside 15 min returns
// the existing pending row — a double-tap gets charged once.
export async function initiatePayment(
  userId: string,
  tier: "spark" | "flame" | "ember",
  period: BillingPeriod,
  method: PaymentMethod,
  phone: string | undefined,
  authEmail: string | undefined,
  sourceFeature?: string,
) {
  const amountCents = priceCentsFor(tier, period);
  const windowStart = new Date(Date.now() - 15 * 60 * 1000);
  const key = `${userId}:${tier}:${period}:${method}`;

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
      period,
      amount: amountCents,
      currency: "usd",
      status: "pending",
      provider: name,
      phoneNumberMasked: maskPhone(phone),
      idempotencyKey: key,
      sourceFeature: sourceFeature ?? null,
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
      authorizationCode: r.authorizationCode,
      authorizationExpires: r.authorizationExpires,
      deepLink: r.deepLink,
    };
  } catch (e: any) {
    const reason = String(e?.message || e);
    await db.update(payments).set({ status: "failed", failureReason: reason }).where(eq(payments.id, row.id));
    await alertPaymentFailed({ userId, tier, amountCents, method: name, reason });
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
      await alertPaymentFailed({ userId: row.userId, tier: row.tier || "?", amountCents: row.amount, method: row.provider, reason: "Settled amount did not match" });
      return { ...row, status: "failed" as const };
    }
    await activateFromPayment(paymentId);
    const [fresh] = await db.select().from(payments).where(eq(payments.id, paymentId));
    return fresh;
  }
  if (r.status === "failed" || r.status === "cancelled" || r.status === "expired") {
    await db.update(payments).set({ status: r.status }).where(eq(payments.id, paymentId));
    if (r.status === "failed") {
      await alertPaymentFailed({ userId: row.userId, tier: row.tier || "?", amountCents: row.amount, method: row.provider, reason: row.failureReason ?? r.failureReason ?? null });
    }
  }
  const [fresh] = await db.select().from(payments).where(eq(payments.id, paymentId));
  return fresh;
}

// Payments left "pending" too long with the gateway never confirming them —
// the "took money, gave nothing" case. Alerts once per stuck payment (marks
// it so it isn't re-alerted every sweep) and leaves status as pending; a
// human has to look, this isn't something to auto-fail.
const STUCK_AFTER_MS = 20 * 60 * 1000;
const alertedStuck = new Set<number>();
export async function sweepStuckPayments(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);
  const stuck = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.status, "pending"),
        lt(payments.createdAt, cutoff),
        or(isNull(payments.lastPolledAt), lt(payments.lastPolledAt, cutoff)),
      ),
    );
  let alerted = 0;
  for (const p of stuck) {
    if (alertedStuck.has(p.id)) continue;
    alertedStuck.add(p.id);
    alerted++;
    await alertPaymentStuck({
      paymentId: p.id,
      userId: p.userId,
      tier: p.tier || "?",
      amountCents: p.amount,
      minutesStuck: Math.round((Date.now() - p.createdAt!.getTime()) / 60000),
    });
  }
  return alerted;
}

// Idempotent. Writes the payment as paid, creates/extends the subscription,
// sets profiles.subscriptionTier. Features are live on the next request — no
// logout.
export async function activateFromPayment(paymentId: number): Promise<void> {
  const [pay] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!pay || pay.status === "paid") return;
  const tier = pay.tier as "spark" | "flame" | "ember";
  const period = (pay.period || "monthly") as BillingPeriod;
  const durationMs = PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + durationMs);

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
        period,
        status: "active",
        cancelAtPeriodEnd: false,
        provider: pay.provider,
        providerReference: pay.providerReference,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(base.getTime() + durationMs),
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
        period,
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
  await alertPaymentSuccess({ userId: pay.userId, tier, amountCents: pay.amount, method: pay.provider, phoneMasked: pay.phoneNumberMasked });
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
