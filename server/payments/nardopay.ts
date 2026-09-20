// NardoPay — hosted payment-link checkout covering EcoCash / OneMoney /
// InnBucks (Zimbabwe mobile money), USD only.
//
// Flow:
//   initiate: POST create-payment-link-api with a Bearer token, get back a
//             hosted `url`. The EcoCash/OneMoney/InnBucks picker lives on
//             NardoPay's own page (window.NardoPay.init(...)), not ours — we
//             just send the browser there.
//   confirm:  webhook only (POST /api/payments/nardopay/webhook). NardoPay's
//             create-payment-link-api doesn't document a status-poll
//             endpoint, so pollStatus() is a no-op; refreshPayment() already
//             skips polling when a payment's pollUrl is unset.
//
// Every charge uses link_type "payment_link", never "subscription": our
// subscriptions.currentPeriodEnd model is a discrete, user-initiated top-up
// per period (weekly/monthly/sixMonth) — never gateway-driven recurring
// billing — and NardoPay's billing_cycle vocabulary has no sixMonth cycle
// anyway. A renewal is just the user initiating another payment.
//
// Correlation: create-payment-link-api takes no merchant-reference field,
// only opaque `metadata`, so our internal payments.id rides along as
// metadata.paymentId and is read back out of the webhook body. NardoPay's own
// `reference` (its "NP-REF-..." string) is never ours to key lookups on.
//
// Webhook signature: HMAC-SHA256 over JSON.stringify(body) using
// NARDOPAY_WEBHOOK_SECRET (falls back to NARDOPAY_API_KEY — NardoPay signs
// with the same value unless a dedicated secret is configured), compared
// against the `x-nardopay-signature` header. This mirrors NardoPay's own
// reference verifyNardoPayWebhook() exactly, so it depends on Express having
// already parsed+re-serialized the body the same way NardoPay hashed it.

import { createHmac, timingSafeEqual } from "crypto";
import type {
  PaymentProvider,
  InitiateInput,
  InitiateResult,
  PollResult,
  PaymentStatus,
} from "./types";

const CREATE_LINK_URL = "https://mczqwqsvumfsneoknlep.supabase.co/functions/v1/create-payment-link-api";

const TIER_LABEL: Record<string, string> = {
  spark: "Destira Spark",
  flame: "Destira Flame",
  ember: "Destira Ember",
};

export function nardopayConfigured(): boolean {
  return !!process.env.NARDOPAY_API_KEY;
}

function appUrl(): string {
  return process.env.APP_URL || (process.env.NODE_ENV === "production" ? "https://www.destira.date" : "http://localhost:5000");
}

function mapStatus(raw?: string): PaymentStatus {
  const s = (raw || "").toLowerCase();
  if (s === "completed" || s === "paid") return "paid";
  if (s === "failed") return "failed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "expired") return "expired";
  return "pending";
}

function verifySignature(body: unknown, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class NardoPayProvider implements PaymentProvider {
  readonly id = "nardopay";
  private apiKey = process.env.NARDOPAY_API_KEY || "";
  private webhookSecret = process.env.NARDOPAY_WEBHOOK_SECRET || process.env.NARDOPAY_API_KEY || "";

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    if (!this.apiKey) throw new Error("NardoPay is not configured (NARDOPAY_API_KEY)");
    const amount = Math.round(input.amountCents) / 100;
    const planName = input.tier ? TIER_LABEL[input.tier] ?? `Destira ${input.tier}` : "Destira";

    const res = await fetch(CREATE_LINK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        link_type: "payment_link",
        plan_name: planName,
        amount,
        currency: "USD",
        redirect_url: `${appUrl()}/plans/pay/return?ref=${input.reference}`,
        webhook_url: `${appUrl()}/api/payments/nardopay/webhook`,
        metadata: {
          paymentId: input.reference,
          userId: input.userId,
          tier: input.tier,
          plan: input.period,
        },
      }),
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // fall through — !res.ok / !data.success below handles it
    }

    if (!res.ok || !data?.success || !data?.url) {
      return {
        status: "failed",
        failureReason: data?.message || data?.error || `NardoPay rejected the request (${res.status})`,
        rawStatus: "Error",
      };
    }

    return {
      status: "pending",
      providerReference: data.link_id || data.link_code,
      redirectUrl: data.url,
      rawStatus: "Created",
    };
  }

  async pollStatus(_pollUrlOrRef: string): Promise<PollResult> {
    // No documented status-poll endpoint — confirmation is webhook-only.
    // NardoPayProvider never sets payments.pollUrl, so refreshPayment()
    // never actually calls this; it exists to satisfy the interface.
    return { status: "pending" };
  }

  handleWebhook(body: any, headers?: Record<string, string | string[] | undefined>) {
    if (!body || typeof body !== "object") return null;
    const sigHeader = headers?.["x-nardopay-signature"];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!verifySignature(body, signature, this.webhookSecret)) return null;

    const paymentId = body?.metadata?.paymentId;
    if (!paymentId) return null;

    const amount = typeof body.amount === "number" ? body.amount : parseFloat(body.amount);
    const rawStatus = body.status || body.event;
    return {
      reference: String(paymentId),
      status: mapStatus(rawStatus),
      settledCents: Number.isFinite(amount) ? Math.round(amount * 100) : undefined,
      rawStatus,
    };
  }

  verifyAmount(settledCents: number, expectedCents: number): boolean {
    // allow a 1c rounding wobble on the dollar-amount round trip
    return Math.abs(settledCents - expectedCents) <= 1;
  }
}
