// Local mock provider so the whole EcoCash flow can be reviewed without a
// merchant account. Enabled when PAYMENTS_MOCK=1 or when Paynow creds are
// absent. Deterministic: a transaction is "Paid" after MOCK_DELAY_MS, unless
// the phone/amount asks for a failure (see below), so every UI state is
// reachable.
//
//   phone ending 0000 -> the subscriber "declines" the prompt      (failed)
//   phone ending 9999 -> the prompt "expires" / gateway silent     (expired)
//   phone ending 1111 -> "insufficient balance"                    (failed)
//   anything else      -> Paid after the delay

import type {
  PaymentProvider,
  InitiateInput,
  InitiateResult,
  PollResult,
  PaymentStatus,
} from "./types";
import { WALLET_METHODS } from "./types";

const MOCK_DELAY_MS = Number(process.env.PAYMENTS_MOCK_DELAY_MS ?? 4000);

interface Txn {
  createdAt: number;
  amountCents: number;
  outcome: PaymentStatus;
  reason?: string;
}
const txns = new Map<string, Txn>();

function outcomeFor(phone?: string): { outcome: PaymentStatus; reason?: string } {
  const last4 = (phone ?? "").replace(/\D/g, "").slice(-4);
  if (last4 === "0000") return { outcome: "failed", reason: "You declined the prompt on your handset." };
  if (last4 === "1111") return { outcome: "failed", reason: "Not enough balance in that EcoCash wallet." };
  if (last4 === "9999") return { outcome: "expired", reason: "The prompt expired before it was approved." };
  return { outcome: "paid" };
}

export class MockProvider implements PaymentProvider {
  readonly id = "mock";

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const { outcome, reason } = outcomeFor(input.phone);
    txns.set(input.reference, { createdAt: Date.now(), amountCents: input.amountCents, outcome, reason });
    if (!WALLET_METHODS.has(input.method)) {
      // pretend the hosted card page immediately succeeds
      txns.set(input.reference, { createdAt: 0, amountCents: input.amountCents, outcome: "paid" });
      return { status: "pending", providerReference: input.reference, redirectUrl: `/plans/pay/return?ref=${input.reference}`, pollUrl: input.reference, rawStatus: "Sent" };
    }
    if (input.method === "innbucks") {
      return {
        status: "pending",
        providerReference: input.reference,
        pollUrl: input.reference,
        authorizationCode: "MOCK-1234",
        authorizationExpires: "1-Jan-2099 00:00",
        deepLink: "com.innbucks.customer://purchase?paymentToken=MOCK-1234",
        rawStatus: "Sent",
      };
    }
    const walletLabel = input.method === "onemoney" ? "OneMoney" : "EcoCash";
    return {
      status: "pending",
      providerReference: input.reference,
      pollUrl: input.reference,
      instructions: `A prompt is on its way to the phone. Approve it with the ${walletLabel} PIN — we never see it. (mock: settles in ${Math.round(MOCK_DELAY_MS / 1000)}s)`,
      rawStatus: "Sent",
    };
  }

  async pollStatus(ref: string): Promise<PollResult> {
    const t = txns.get(ref);
    if (!t) return { status: "failed", failureReason: "Unknown transaction.", rawStatus: "Error" };
    if (t.outcome === "paid" && Date.now() - t.createdAt < MOCK_DELAY_MS) {
      return { status: "pending", rawStatus: "Sent" };
    }
    if (t.outcome === "expired" && Date.now() - t.createdAt < MOCK_DELAY_MS) {
      return { status: "pending", rawStatus: "Sent" };
    }
    if (t.outcome === "paid") return { status: "paid", rawStatus: "Paid", settledCents: t.amountCents };
    return { status: t.outcome, rawStatus: t.outcome === "expired" ? "Cancelled" : "Cancelled", failureReason: t.reason };
  }

  handleWebhook(body: Record<string, string>) {
    const reference = body.reference;
    if (!reference) return null;
    const t = txns.get(reference);
    const status = (body.status as PaymentStatus) || (t?.outcome ?? "failed");
    return { reference, status, settledCents: t?.amountCents, rawStatus: body.status };
  }

  verifyAmount(settledCents: number, expectedCents: number): boolean {
    return settledCents === expectedCents;
  }
}
