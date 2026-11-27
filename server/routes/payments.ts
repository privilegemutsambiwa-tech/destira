// Plans, payments and their webhooks.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient";
import { db } from "../db";
import { sql, and } from "drizzle-orm";
import * as payments from "../payments";
import * as push from "../push";
import { initiatePaymentSchema } from "@shared/schema";
import * as gate from "../gate";
import { canPayCrown } from "../crown";
import { purchaseReturnTo } from "../purchases";
import { isCrownPeriod } from "@shared/crown";
import * as emailTemplates from "../email/templates";
import { getUserId } from "./shared";

export function registerPaymentsRoutes(app: Express) {
  app.get("/api/subscription", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const sub = await storage.getSubscription(userId);
      const tier = await gate.getEffectiveTier(userId);
      const isTrial = sub?.provider === "trial";
      const daysRemaining = sub?.currentPeriodEnd
        ? Math.max(0, Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : null;
      const trialExpiresAt = sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null;
      res.json(
        sub
          ? { ...sub, tier, isTrial, daysRemaining, trialExpiresAt }
          : { tier, status: "active", isTrial: false, daysRemaining: null, trialExpiresAt: null },
      );
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  // ── Payments (EcoCash via Paynow first; card via Paynow/Stripe) ──
  // The client sends a plan tier, NEVER an amount. The server resolves the
  // price, initiates, and only a poll/webhook confirmation activates the plan.

  // Which gateway actually handles the wallet methods right now — env-driven
  // (providerFor), so the client can decide upfront whether to collect a
  // phone number itself (Paynow's direct USSD push) or skip straight to a
  // hosted redirect (NardoPay's own picker) before ever calling initiate.
  app.get("/api/payments/config", async (req, res) => {
    const { name } = payments.providerFor("ecocash");
    const walletProvider = name.startsWith("nardopay") ? "nardopay" : name.startsWith("paynow") ? "paynow" : "mock";
    res.json({ walletProvider });
  });

  app.post("/api/payments/initiate", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = initiatePaymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payment request" });
    const { tier, period, method, phone, sourceFeature, resend } = parsed.data;
    // Crown: only its own periods, and only once the team has approved this
    // member (server/crown.ts). Every other plan: never a Crown period.
    if (tier === "crown") {
      if (!isCrownPeriod(period)) return res.status(400).json({ message: "Crown is monthly or for 3 months." });
      const block = await canPayCrown(userId);
      if (block) return res.status(403).json({ message: block });
    } else if (period === "threeMonth") {
      return res.status(400).json({ message: "Invalid payment request" });
    }
    // NardoPay's hosted link takes the wallet number on its own page, not
    // ours — the phone requirement only applies to Paynow's direct USSD push.
    const walletMethod = method === "ecocash" || method === "onemoney" || method === "innbucks";
    const handledByNardoPay = walletMethod && payments.providerFor(method).name.startsWith("nardopay");
    if (walletMethod && !handledByNardoPay && !/^0?7\d{8}$/.test((phone || "").replace(/\D/g, ""))) {
      return res.status(400).json({ message: "Enter the wallet number as 07XX XXX XXX." });
    }
    try {
      const email = (req as any).user?.claims?.email || (await storage.getProfile(userId))?.displayName;
      const result = await payments.initiatePayment(userId, tier, period, method, phone, typeof email === "string" ? email : undefined, sourceFeature, resend);
      res.json(result);
    } catch (err: any) {
      console.error('[Payment Initiate Error]:', err);
      const notConfigured = err?.message?.includes("not configured");
      if (!notConfigured) {
        emailTemplates.alertGatewayUnreachable({ provider: method, error: String(err?.message || err) }).catch(() => {});
      }
      // Only ever forward the small set of messages a provider throws on
      // purpose (e.g. "not configured") — anything else, most notably a raw
      // DB driver error, carries query text and params (a user id, digits of
      // a phone number) that must never reach the browser.
      const safeMessage = notConfigured ? err.message : "Couldn't reach the payment gateway. Try again.";
      res.status(400).json({ message: safeMessage });
    }
  });

  app.get("/api/payments/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    try {
      const row = await payments.refreshPayment(id);
      if (!row || row.userId !== userId) return res.status(404).json({ message: "Not found" });
      res.json({
        id: row.id,
        status: row.status,
        tier: row.tier,
        period: row.period,
        amount: row.amount,
        provider: row.provider,
        phoneNumberMasked: row.phoneNumberMasked,
        failureReason: row.failureReason,
        rawStatus: row.rawStatus,
        purchaseLabel: row.purchaseLabel ?? null,
        returnTo: row.purchaseKind ? await purchaseReturnTo(row.purchaseKind, row.purchaseRef) : null,
      });
    } catch (e) {
      console.error("Payment status error:", e);
      res.status(500).json({ message: "Couldn't check that payment" });
    }
  });

  // Paynow posts application/x-www-form-urlencoded to our resulturl. This — not
  // the client — is what activates a plan.
  app.post("/api/payments/webhook/paynow", async (req, res) => {
    try {
      const parsed = payments.paynowWebhookProvider().handleWebhook((req.body || {}) as Record<string, string>);
      if (!parsed) {
        emailTemplates.alertWebhookSignatureFailure({ provider: "paynow" }).catch(() => {});
        return res.status(400).send("bad signature");
      }
      if (parsed.status === "paid") {
        await payments.activateFromPayment(Number(parsed.reference));
      }
      res.status(200).send("ok");
    } catch (e) {
      console.error("Paynow webhook error:", e);
      res.status(200).send("ok"); // never make the gateway retry-storm us
    }
  });

  // NardoPay posts JSON to our webhook_url, signed via x-nardopay-signature.
  // This — not the client, not the redirect_url landing — is what activates
  // a plan.
  app.post("/api/payments/webhook/nardopay", async (req, res) => {
    try {
      const parsed = payments
        .nardopayWebhookProvider()
        .handleWebhook(req.body, req.headers as Record<string, string | string[] | undefined>);
      if (!parsed) {
        emailTemplates.alertWebhookSignatureFailure({ provider: "nardopay" }).catch(() => {});
        return res.status(400).send("bad signature");
      }
      if (parsed.status === "paid") {
        await payments.activateFromPayment(Number(parsed.reference));
      }
      res.status(200).send("ok");
    } catch (e) {
      console.error("NardoPay webhook error:", e);
      res.status(200).send("ok"); // never make the gateway retry-storm us
    }
  });

  app.delete("/api/subscription", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { endsAt } = await payments.cancelSubscription(userId);
      res.json({ cancelled: true, endsAt });
    } catch (e) {
      res.status(500).json({ message: "Couldn't cancel" });
    }
  });

  app.get("/api/entitlements", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const ents = await storage.getEntitlements(userId);
      res.json(ents);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch entitlements" });
    }
  });

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (e) {
      console.error("Failed to get publishable key:", e);
      res.status(500).json({ message: "Failed to get Stripe config" });
    }
  });

  app.get("/api/stripe/products", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount ASC
      `);

      const productsMap = new Map<string, any>();
      for (const row of result.rows) {
        const r = row as any;
        if (!productsMap.has(r.product_id)) {
          productsMap.set(r.product_id, {
            id: r.product_id,
            name: r.product_name,
            description: r.product_description,
            metadata: r.product_metadata,
            prices: [],
          });
        }
        if (r.price_id) {
          productsMap.get(r.product_id).prices.push({
            id: r.price_id,
            unit_amount: r.unit_amount,
            currency: r.currency,
            recurring: r.recurring,
          });
        }
      }

      res.json(Array.from(productsMap.values()));
    } catch (e) {
      console.error("Failed to fetch Stripe products:", e);
      res.json([]);
    }
  });

  app.post("/api/stripe/checkout", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const { priceId } = req.body;
    if (!priceId) return res.status(400).json({ message: "priceId is required" });

    try {
      const stripe = await getUncachableStripeClient();
      const userClaims = (req as any).user?.claims;
      const email = userClaims?.email || undefined;

      let customerId: string | undefined;

      if (email) {
        const customers = await stripe.customers.list({ email, limit: 1 });
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
        }
      }

      if (!customerId) {
        const customer = await stripe.customers.create({
          email,
          metadata: { userId },
        });
        customerId = customer.id;
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${baseUrl}/billing?success=true`,
        cancel_url: `${baseUrl}/billing?canceled=true`,
        metadata: { userId },
      });

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Checkout error:", e);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/portal", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    try {
      const stripe = await getUncachableStripeClient();
      const userClaims = (req as any).user?.claims;
      const email = userClaims?.email;

      if (!email) return res.status(400).json({ message: "No email on account" });

      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length === 0) {
        return res.status(404).json({ message: "No Stripe customer found" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: `${baseUrl}/billing`,
      });

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Portal error:", e);
      res.status(500).json({ message: "Failed to create portal session" });
    }
  });
}
