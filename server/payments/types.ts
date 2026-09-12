// Payment provider abstraction. Stripe (card) and EcoCash (Paynow) are two
// implementations of this — EcoCash logic never threads through the Stripe
// files, and vice versa.
//
// MONEY DECISIONS ARE SERVER-SIDE. The client sends a plan tier, never an
// amount. The server resolves the price, initiates, and verifies the settled
// amount before activating anything. Amounts are integer cents.

export type PaymentMethod = "ecocash" | "ecocash_card" | "card";

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
  /** parse + verify a provider webhook body; returns null if it isn't valid. */
  handleWebhook(body: Record<string, string>): {
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
