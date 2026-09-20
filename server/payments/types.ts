// Payment provider abstraction. Stripe (card) and EcoCash (Paynow) are two
// implementations of this — EcoCash logic never threads through the Stripe
// files, and vice versa.
//
// MONEY DECISIONS ARE SERVER-SIDE. The client sends a plan tier, never an
// amount. The server resolves the price, initiates, and verifies the settled
// amount before activating anything. Amounts are integer cents.

export type PaymentMethod = "ecocash" | "onemoney" | "innbucks" | "ecocash_card" | "card";

/** Methods that go through the wallet (remotetransaction) flow — a phone number and a prompt, not a browser redirect. */
export const WALLET_METHODS: ReadonlySet<PaymentMethod> = new Set(["ecocash", "onemoney", "innbucks"]);

export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "expired";

export interface InitiateInput {
  /** our payment row id — used as the merchant reference */
  reference: string;
  amountCents: number;
  currency: "usd";
  method: PaymentMethod;
  /** subscriber's mobile number, wallet flow only. Never logged in full. */
  phone?: string;
  authEmail?: string;
  userId?: string;
  /** hosted-checkout providers (NardoPay) need these for the plan label + line-item metadata; wallet PIN flows ignore them. */
  tier?: "spark" | "flame" | "ember";
  period?: "weekly" | "monthly" | "sixMonth";
}

export interface InitiateResult {
  status: PaymentStatus;
  providerReference?: string;
  /** wallet flow: the "check your handset" text to show the user. */
  instructions?: string;
  /** card flow: where to send the browser. */
  redirectUrl?: string;
  /** url we poll for status. */
  pollUrl?: string;
  /** provider's raw status string, for the audit row. */
  rawStatus?: string;
  failureReason?: string;
  /** InnBucks only: the code the subscriber approves in their InnBucks app. */
  authorizationCode?: string;
  /** InnBucks only: "d-MMM-yyyy HH:mm", when the authorization code stops being valid. */
  authorizationExpires?: string;
  /** InnBucks only: com.innbucks.customer://purchase?paymentToken=... */
  deepLink?: string;
}

export interface PollResult {
  status: PaymentStatus;
  rawStatus?: string;
  /** the amount the provider says settled, in cents — verified before activating. */
  settledCents?: number;
  failureReason?: string;
}

export interface PaymentProvider {
  readonly id: string;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  pollStatus(pollUrlOrRef: string): Promise<PollResult>;
  /**
   * Parse + verify a provider webhook; returns null if it isn't valid.
   * `headers` carries the signature for providers (NardoPay) that sign out-of-band
   * rather than embedding a hash field in the body itself (Paynow).
   */
  handleWebhook(
    body: Record<string, string> | any,
    headers?: Record<string, string | string[] | undefined>,
  ): {
    reference: string;
    status: PaymentStatus;
    settledCents?: number;
    rawStatus?: string;
  } | null;
  verifyAmount(settledCents: number, expectedCents: number): boolean;
}

export function maskPhone(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•••• ••••";
  return `07•• ••• ${digits.slice(-4)}`;
}
