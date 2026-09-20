// Paynow (Webdev) — EcoCash / OneMoney / InnBucks wallets + Visa/Mastercard/
// Zimswitch card, for Zimbabwe.
//
// Flow (from Paynow's developer docs — developers.paynow.co.zw):
//   wallet: POST https://www.paynow.co.zw/interface/remotetransaction
//           fields: id, reference, amount, additionalinfo, returnurl, resulturl,
//                   authemail, status=Message, phone, method=ecocash|onemoney|innbucks, hash
//           hash = SHA512( concat of every value in order + IntegrationKey ).toUpperCase()
//           -> response query string: status=Ok|Error, pollurl, instructions, hash
//              (innbucks also returns authorizationcode + authorizationexpires —
//               there is no PIN prompt; the subscriber approves that code in
//               the InnBucks app, or we deep-link them straight to it)
//   card:   POST .../initiatetransaction (no method field — Paynow's hosted
//           page itself offers Visa/Mastercard/Zimswitch), returns browserurl
//           to redirect to.
//   confirm: poll `pollurl` (POST, empty body) OR receive POST to our resulturl.
//            status in Created|Sent|Paid|Awaiting Delivery|Cancelled|Disputed|Refunded.
//            Paid / Awaiting Delivery == success. Verify hash + amount first.
//
// The PIN (or InnBucks approval) happens on the subscriber's handset/app. We
// only ever display `instructions` / `authorizationCode`. If any Paynow doc
// appears to ask us to collect a PIN, stop.
//
// Credentials (set when you have a merchant account — see docs):
//   PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY, PAYNOW_RESULT_URL, PAYNOW_RETURN_URL

import { createHash } from "crypto";
import type {
  PaymentProvider,
  InitiateInput,
  InitiateResult,
  PollResult,
  PaymentStatus,
} from "./types";
import { WALLET_METHODS } from "./types";

const WALLET_URL = "https://www.paynow.co.zw/interface/remotetransaction";
const CARD_URL = "https://www.paynow.co.zw/interface/initiatetransaction";

export function paynowConfigured(): boolean {
  return !!(process.env.PAYNOW_INTEGRATION_ID && process.env.PAYNOW_INTEGRATION_KEY);
}

function hash(fields: Record<string, string>, key: string): string {
  // Paynow: concatenate every value (in insertion order), append the key, SHA512, uppercase.
  const concat = Object.entries(fields)
    .filter(([k]) => k.toLowerCase() !== "hash")
    .map(([, v]) => v)
    .join("");
  return createHash("sha512").update(concat + key).digest("hex").toUpperCase();
}

function parseQuery(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of s.split("&")) {
    const i = pair.indexOf("=");
    if (i < 0) continue;
    out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " "));
  }
  return out;
}

function mapStatus(raw?: string): PaymentStatus {
  const s = (raw || "").toLowerCase();
  if (s === "paid" || s === "awaiting delivery" || s === "delivered") return "paid";
  if (s === "cancelled") return "cancelled";
  if (s === "created" || s === "sent") return "pending";
  if (s === "refunded" || s === "disputed") return "failed";
  return "pending";
}

export class PaynowProvider implements PaymentProvider {
  readonly id = "paynow";
  private id_ = process.env.PAYNOW_INTEGRATION_ID || "";
  private key = process.env.PAYNOW_INTEGRATION_KEY || "";
  private resultUrl = process.env.PAYNOW_RESULT_URL || "";
  private returnUrl = process.env.PAYNOW_RETURN_URL || "";

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    if (!paynowConfigured()) throw new Error("Paynow is not configured (PAYNOW_INTEGRATION_ID / _KEY)");
    const amount = (input.amountCents / 100).toFixed(2);
    const base: Record<string, string> = {
      id: this.id_,
      reference: input.reference,
      amount,
      additionalinfo: "Destira subscription",
      returnurl: this.returnUrl,
      resulturl: this.resultUrl,
      authemail: input.authEmail || "",
      status: "Message",
    };
    const wallet = WALLET_METHODS.has(input.method);
    // method values Paynow accepts on remotetransaction: ecocash | onemoney | innbucks
    const fields = wallet ? { ...base, phone: input.phone || "", method: input.method } : base;
    fields.hash = hash(fields, this.key);

    const res = await fetch(wallet ? WALLET_URL : CARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
    const parsed = parseQuery(await res.text());
    if ((parsed.status || "").toLowerCase() === "error") {
      return { status: "failed", failureReason: parsed.error || "Paynow rejected the request", rawStatus: "Error" };
    }
    return {
      status: "pending",
      providerReference: parsed.pollurl,
      pollUrl: parsed.pollurl,
      instructions: parsed.instructions,
      redirectUrl: wallet ? undefined : parsed.browserurl,
      rawStatus: parsed.status,
      // InnBucks doesn't push a PIN prompt — the subscriber approves this code
      // in the InnBucks app instead. Absent for every other method.
      authorizationCode: parsed.authorizationcode || undefined,
      authorizationExpires: parsed.authorizationexpires || undefined,
      deepLink: parsed.authorizationcode ? `com.innbucks.customer://purchase?paymentToken=${parsed.authorizationcode}` : undefined,
    };
  }

  async pollStatus(pollUrl: string): Promise<PollResult> {
    const res = await fetch(pollUrl, { method: "POST" });
    const parsed = parseQuery(await res.text());
    return {
      status: mapStatus(parsed.status),
      rawStatus: parsed.status,
      settledCents: parsed.amount ? Math.round(parseFloat(parsed.amount) * 100) : undefined,
    };
  }

  handleWebhook(body: Record<string, string>) {
    if (!body || !body.reference || !body.hash) return null;
    const expected = hash(body, this.key);
    if (expected !== String(body.hash).toUpperCase()) return null; // bad signature
    return {
      reference: body.reference,
      status: mapStatus(body.status),
      settledCents: body.amount ? Math.round(parseFloat(body.amount) * 100) : undefined,
      rawStatus: body.status,
    };
  }

  verifyAmount(settledCents: number, expectedCents: number): boolean {
    // allow a 1c rounding wobble on the currency conversion
    return Math.abs(settledCents - expectedCents) <= 1;
  }
}
