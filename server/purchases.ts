// One-off purchases (server/purchase-kinds.ts for the registry).
//   POST /api/purchases/initiate   { kind, ref, method, phone? }  -> same shape as /api/payments/initiate
// The price always comes from the kind's quote on the server, never the
// client. Status is polled through the usual GET /api/payments/:id.
import type { Express, Request } from "express";
import { and, count, eq } from "drizzle-orm";
import { db } from "./db";
import { payments } from "@shared/schema";
import { PAYMENT_METHODS } from "@shared/schema";
import { providerFor } from "./payments";
import { maskPhone, type PaymentMethod, type PaymentStatus } from "./payments/types";
import { purchaseKind } from "./purchase-kinds";
import { alertPaymentFailed } from "./email/templates";

const WALLETS = new Set(["ecocash", "onemoney", "innbucks"]);

export async function initiatePurchase(userId: string, kind: string, ref: number, method: PaymentMethod, phone?: string, authEmail?: string) {
  const k = purchaseKind(kind);
  if (!k) return { error: 400, message: "Nothing to buy here." } as const;
  const q = await k.quote(userId, ref);
  if ("error" in q) return q;
  // One row per (member, thing, method), reused on retries like plan payments.
  // A repeatable kind counts the ones already paid into the key, so a retry
  // still reuses the pending row but the next purchase gets a new one.
  let key = `${userId}:purchase:${kind}:${ref}:${method}`;
  if (k.repeatable) {
    const [r] = await db.select({ n: count() }).from(payments)
      .where(and(eq(payments.userId, userId), eq(payments.purchaseKind, kind), eq(payments.status, "paid")));
    key += `:${Number(r?.n ?? 0)}`;
  }
  const [existing] = await db.select().from(payments).where(eq(payments.idempotencyKey, key));
  if (existing?.status === "paid") return { error: 409, message: "That's paid for already." } as const;
  const fresh = existing?.createdAt && existing.createdAt.getTime() > Date.now() - 15 * 60e3;
  if (existing && fresh && existing.status === "pending") {
    return { paymentId: existing.id, status: "pending" as PaymentStatus, pollUrl: existing.pollUrl, resumed: true };
  }
  const { provider, name } = providerFor(method);
  const values = {
    amount: q.cents, currency: "usd", status: "pending", provider: name, phoneNumberMasked: maskPhone(phone),
    providerReference: null, pollUrl: null, rawStatus: null, failureReason: null, lastPolledAt: null,
    purchaseKind: kind, purchaseRef: ref, purchaseLabel: q.label, createdAt: new Date(),
  };
  const [row] = existing
    ? await db.update(payments).set(values).where(eq(payments.id, existing.id)).returning()
    : await db.insert(payments).values({ ...values, userId, tier: "purchase", period: "once", idempotencyKey: key }).returning();
  try {
    const r = await provider.initiate({ reference: String(row.id), amountCents: q.cents, currency: "usd", method, phone, authEmail, userId });
    const status = r.status === "failed" ? "failed" : "pending";
    await db.update(payments).set({
      providerReference: r.providerReference ?? null, pollUrl: r.pollUrl ?? null, rawStatus: r.rawStatus ?? null, status, failureReason: r.failureReason ?? null,
    }).where(eq(payments.id, row.id));
    return {
      paymentId: row.id, status: status as PaymentStatus, instructions: r.instructions, redirectUrl: r.redirectUrl, pollUrl: r.pollUrl,
      failureReason: r.failureReason, authorizationCode: r.authorizationCode, authorizationExpires: r.authorizationExpires, deepLink: r.deepLink,
    };
  } catch (e: any) {
    const reason = String(e?.message || e);
    await db.update(payments).set({ status: "failed", failureReason: reason }).where(eq(payments.id, row.id));
    await alertPaymentFailed({ userId, tier: `purchase:${kind}`, amountCents: q.cents, method: name, reason });
    throw e;
  }
}

export function registerPurchaseRoutes(app: Express, getUserId: (req: Request) => string | null) {
  app.post("/api/purchases/initiate", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const kind = typeof req.body?.kind === "string" ? req.body.kind : "";
    const ref = Number(req.body?.ref);
    const method = req.body?.method as PaymentMethod;
    const phone = typeof req.body?.phone === "string" ? req.body.phone : undefined;
    if (!kind || !Number.isInteger(ref) || !(PAYMENT_METHODS as readonly string[]).includes(method)) {
      return res.status(400).json({ message: "Invalid payment request" });
    }
    const wallet = WALLETS.has(method);
    if (wallet && providerFor(method).name.startsWith("paynow") && !/^0?7\d{8}$/.test((phone || "").replace(/\D/g, ""))) {
      return res.status(400).json({ message: "Enter the wallet number as 07XX XXX XXX." });
    }
    try {
      const out = await initiatePurchase(userId, kind, ref, method, phone, (req as any).user?.claims?.email);
      if ("error" in out) return res.status((out as { error: number }).error).json({ message: (out as { message: string }).message });
      res.json(out);
    } catch (err: any) {
      console.error("[purchase initiate]", err);
      const notConfigured = String(err?.message ?? "").includes("not configured");
      res.status(400).json({ message: notConfigured ? err.message : "Couldn't reach the payment gateway. Try again." });
    }
  });
}

/** For GET /api/payments/:id: where a paid purchase sends the member back to. */
export async function purchaseReturnTo(kind: string | null, ref: number | null): Promise<string | null> {
  const k = purchaseKind(kind);
  return k && ref != null ? k.returnTo(ref).catch(() => null) : null;
}
