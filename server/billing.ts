// Money that works without card subscriptions (docs/destira-3-upgrade-prompt.md
// Part G). Nothing renews by itself in Zimbabwe, so every renewal is a fresh
// decision; this makes it timely and one tap away:
//
//   - Plan reminders: 3 days before a plan or free trial ends (not for weekly
//     plans, where that's half the plan), the day before, and the day it ends.
//     Push and an in-app notification always; email too once member email is
//     live (Console > Member emails) and the member hasn't turned it off.
//     Each one is sent once: billing_notices holds the keys.
//   - A receipt email for every confirmed payment (no unsubscribe: it's a
//     record), and the payment history in Settings.
import type { Express, Request } from "express";
import { and, desc, eq, gt, inArray, lte, ne } from "drizzle-orm";
import { db } from "./db";
import { billingNotices, payments, profiles, subscriptions } from "@shared/schema";
import { users } from "@shared/models/auth";
import { PLAN_CARDS, PERIOD_LABEL, periodPriceCents, priceLabel, type BillingPeriod, type Tier } from "@shared/entitlements";
import * as memberEmail from "./member-email";
import * as T from "./member-email/templates";
import { storage } from "./storage";
import { activeCrownIds } from "./crown";
import { CROWN_NAME, CROWN_PERIOD_LABEL, CROWN_PRICE_CENTS } from "@shared/crown";
import { notify } from "./push";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const receiptNo = (paymentId: number) => `DST-${String(paymentId).padStart(6, "0")}`;

export function planName(tier: string): string {
  if (tier === "crown") return CROWN_NAME;
  return PLAN_CARDS.find((c) => c.tier === tier)?.name ?? tier;
}

/** "week", "month", "6 months", "3 months" */
function periodLabel(period: string | null | undefined): string {
  if (period === "threeMonth") return CROWN_PERIOD_LABEL.threeMonth;
  return PERIOD_LABEL[asPeriod(period)];
}

export function methodLabel(provider: string | null | undefined): string {
  const p = (provider ?? "").toLowerCase();
  if (p.includes("ecocash")) return "EcoCash";
  if (p.includes("onemoney")) return "OneMoney";
  if (p.includes("innbucks")) return "InnBucks";
  if (p.includes("card")) return "Card";
  if (p === "mock") return "Test payment";
  if (p === "admin_grant") return "Given by Destira";
  return "Paynow";
}

function asPeriod(p: string | null | undefined): BillingPeriod {
  return p === "weekly" || p === "sixMonth" ? p : "monthly";
}
function asPaidTier(t: string): Exclude<Tier, "free"> | null {
  return t === "spark" || t === "flame" || t === "ember" ? t : null;
}

/** "$9.99 a month" / "$3.49 a week" / "$49.99 for 6 months" */
export function priceLine(tier: Exclude<Tier, "free">, period: BillingPeriod): string {
  const p = priceLabel(periodPriceCents(tier, period));
  return period === "sixMonth" ? `${p} for 6 months` : `${p} a ${PERIOD_LABEL[period]}`;
}

/** The other everyday option, so a smaller amount is always on the table. */
function cheaperLine(tier: Exclude<Tier, "free">, period: BillingPeriod): string | null {
  if (period === "monthly") return `or ${priceLine(tier, "weekly")}`;
  if (period === "weekly") return `or ${priceLine(tier, "monthly")}`;
  return null;
}

async function emailTarget(userId: string) {
  const [r] = await db
    .select({
      email: users.email,
      firstName: users.firstName,
      displayName: profiles.displayName,
      prefs: profiles.notificationPrefs,
      moderationStatus: profiles.moderationStatus,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId));
  if (!r?.email) return null;
  return {
    userId,
    email: r.email,
    firstName: (r.firstName || r.displayName || "").trim().split(" ")[0],
    prefs: (r.prefs ?? {}) as Record<string, boolean>,
    active: (r.moderationStatus ?? "active") === "active",
  };
}

async function sendMoneyEmail(
  userId: string,
  kind: "plan_ending" | "trial_ending" | "receipt",
  dedupeKey: string,
  build: (ctx: T.LayoutCtx) => T.EmailContent,
): Promise<string> {
  const settings = await memberEmail.getMemberEmailSettings();
  if (settings.mode !== "live") return "mode off";
  if (!settings.kinds[kind]) return "kind off";
  const m = await emailTarget(userId);
  if (!m) return "no email";
  if (!m.active && kind !== "receipt") return "not active";
  if (!memberEmail.allowed(m, kind)) return "member turned it off";
  const ctx = memberEmail.ctxFor(m, kind);
  return memberEmail.deliver({
    userId,
    kind,
    dedupeKey,
    to: m.email,
    content: build(ctx),
    unsubscribeScope: kind === "receipt" ? "" : "email_billing",
  });
}

// ── receipts ──────────────────────────────────────────────────────

/** After a payment is confirmed (server/payments activateFromPayment). Never throws. */
export async function sendReceipt(paymentId: number): Promise<void> {
  try {
    const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
    if (!p || p.status !== "paid" || !p.tier) return;
    const [sub] = await db.select({ end: subscriptions.currentPeriodEnd }).from(subscriptions).where(eq(subscriptions.userId, p.userId));
    const origin = memberEmail.appOrigin();
    await sendMoneyEmail(p.userId, "receipt", `receipt:${p.id}`, (ctx) =>
      T.receiptEmail(ctx, {
        receiptNo: receiptNo(p.id),
        paidOn: memberEmail.fmtDay(p.createdAt ?? new Date()),
        planName: planName(p.tier!),
        periodLabel: periodLabel(p.period),
        amount: priceLabel(p.amount),
        method: methodLabel(p.provider),
        phoneMasked: p.phoneNumberMasked ?? null,
        activeUntil: sub?.end ? memberEmail.fmtDay(sub.end) : null,
        historyHref: `${origin}/settings#payments`,
      }),
    );
  } catch (e) {
    console.error("[billing] receipt failed:", e);
  }
}

// ── plan reminders ────────────────────────────────────────────────

export type NoticeStage = "3d" | "1d" | "ended";

/** Which reminder (if any) is due for a plan ending at `end`. Pure. */
export function stageFor(end: Date, now: Date, period: BillingPeriod, isTrial: boolean): NoticeStage | null {
  const left = end.getTime() - now.getTime();
  if (left > 2 * DAY_MS && left <= 3 * DAY_MS) return period === "weekly" && !isTrial ? null : "3d";
  if (left > 0 && left <= DAY_MS) return "1d";
  if (left <= 0 && left > -DAY_MS) return "ended";
  return null;
}

function noticeText(stage: NoticeStage, name: string, isTrial: boolean): { title: string; body: string } {
  const what = isTrial ? `Your free ${name} trial` : `Your ${name} plan`;
  if (stage === "ended") {
    return {
      title: `${what} has ended`,
      body: isTrial
        ? "You're on the free plan now and everything you made is still there. Keep the extras from a few dollars."
        : "Your matches and chats are all still there. Renew in a minute with EcoCash.",
    };
  }
  return {
    title: `${what} ends ${stage === "1d" ? "tomorrow" : "in 3 days"}`,
    body: isTrial
      ? "Nothing happens automatically: you'll move to the free plan. Tap to keep it."
      : "Nothing renews by itself. Tap to renew; the new time is added on top.",
  };
}

const harareHour = (now: Date) => (now.getUTCHours() + 2) % 24;

/** The periodic job: reminders due now, in Harare daytime only. */
export async function runBillingNoticeSweep(now = new Date()): Promise<{ sent: number } | { skipped: string }> {
  const h = harareHour(now);
  if (h < 8 || h >= 20) return { skipped: "quiet hours" };
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        ne(subscriptions.tier, "free"),
        ne(subscriptions.cancelAtPeriodEnd, true),
        gt(subscriptions.currentPeriodEnd, new Date(now.getTime() - DAY_MS)),
        lte(subscriptions.currentPeriodEnd, new Date(now.getTime() + 3 * DAY_MS)),
      ),
    );
  let sent = 0;
  const crowns = await activeCrownIds();
  for (const s of rows) {
    const tier = asPaidTier(s.tier);
    if (!tier || !s.currentPeriodEnd) continue;
    const isTrial = s.provider === "trial";
    const period = asPeriod(s.period);
    const stage = stageFor(s.currentPeriodEnd, now, period, isTrial);
    if (!stage) continue;
    const endDay = s.currentPeriodEnd.toISOString().slice(0, 10);
    const key = `${isTrial ? "trial" : "plan"}:${stage}:${endDay}`;
    const [claimed] = await db.insert(billingNotices).values({ userId: s.userId, key }).onConflictDoNothing().returning({ id: billingNotices.id });
    if (!claimed) continue;
    sent++;

    // A Crown member's plan underneath is Ember; the reminder is about Crown.
    const crown = !isTrial && crowns.has(s.userId);
    const name = crown ? CROWN_NAME : planName(tier);
    // A trial is a taste; the renew link opens the plans so they can pick.
    const path = crown ? "/crown" : isTrial ? "/plans" : `/plans/pay?tier=${tier}&period=${period}`;
    const { title, body } = noticeText(stage, name, isTrial);
    await notify(s.userId, "plan", { type: "plan", title, body, url: path, tag: "plan" }).catch(() => {});

    const trialPeriod: BillingPeriod = "weekly";
    const linePeriod = isTrial ? trialPeriod : period;
    const data: T.PlanEndingData = {
      planName: name,
      when: stage,
      endsOn: memberEmail.fmtDay(s.currentPeriodEnd),
      renewHref: `${memberEmail.appOrigin()}${path}`,
      priceLine: crown ? `${priceLabel(CROWN_PRICE_CENTS.monthly)} a month` : priceLine(tier, linePeriod),
      cheaperLine: crown ? `or ${priceLabel(CROWN_PRICE_CENTS.threeMonth)} for 3 months` : cheaperLine(tier, linePeriod),
    };
    await sendMoneyEmail(s.userId, isTrial ? "trial_ending" : "plan_ending", key, (ctx) =>
      isTrial ? T.trialEndingEmail(ctx, data) : T.planEndingEmail(ctx, data),
    ).catch((e) => console.error("[billing] reminder email failed:", e));
  }
  return { sent };
}

// ── member routes ─────────────────────────────────────────────────

export function registerBillingRoutes(app: Express, getUserId: (req: Request) => string | null) {
  // Settings > Payments. Only finished payments: paid ones are receipts,
  // failed ones explain a charge the member might be wondering about.
  app.get("/api/payments/history", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const rows = await db
        .select()
        .from(payments)
        .where(and(eq(payments.userId, userId), inArray(payments.status, ["paid", "failed"])))
        .orderBy(desc(payments.createdAt))
        .limit(50);
      res.json(
        rows.map((p) => ({
          id: p.id,
          receiptNo: p.status === "paid" ? receiptNo(p.id) : null,
          createdAt: p.createdAt,
          tier: p.tier,
          planName: p.tier ? planName(p.tier) : null,
          period: p.period === "threeMonth" ? "threeMonth" : asPeriod(p.period),
          amountCents: p.amount,
          status: p.status,
          method: methodLabel(p.provider),
          phoneMasked: p.phoneNumberMasked ?? null,
        })),
      );
    } catch (e) {
      console.error("[billing] history failed:", e);
      res.status(500).json({ message: "Couldn't load your payments" });
    }
  });

  const sweep = () =>
    runBillingNoticeSweep()
      .then((r) => {
        if ("sent" in r && r.sent) console.log("[billing] reminders sent:", r.sent);
      })
      .catch((e) => console.error("[billing] reminder sweep failed:", e));
  setTimeout(sweep, 40_000);
  setInterval(sweep, 30 * 60 * 1000);
}
