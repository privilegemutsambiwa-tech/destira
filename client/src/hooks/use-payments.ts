import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PayMethod = "ecocash" | "onemoney" | "innbucks" | "ecocash_card" | "card";
export const WALLET_PAY_METHODS: ReadonlySet<PayMethod> = new Set(["ecocash", "onemoney", "innbucks"]);
export type PayStatus = "pending" | "paid" | "failed" | "cancelled" | "expired";

export interface InitiateResult {
  paymentId: number;
  status: PayStatus;
  instructions?: string;
  redirectUrl?: string;
  pollUrl?: string;
  failureReason?: string;
  resumed?: boolean;
  authorizationCode?: string;
  authorizationExpires?: string;
  deepLink?: string;
}

// Which gateway is live for the wallet methods right now — decides whether
// the checkout screen asks for a phone number itself (Paynow) or skips
// straight to a redirect and lets the gateway's own page collect it
// (NardoPay). Static per deployment, so this is safe to cache indefinitely.
export function usePaymentsConfig() {
  return useQuery({
    queryKey: ["/api/payments/config"],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch("/api/payments/config", { credentials: "include" });
      if (!res.ok) return { walletProvider: "mock" as const };
      return res.json() as Promise<{ walletProvider: "nardopay" | "paynow" | "mock" }>;
    },
  });
}

// The server forwards its caught error's `.message` verbatim so real
// validation copy ("Enter the wallet number as...") reaches the UI — but
// that means an *uncaught* failure (a DB driver error, a stack trace) would
// forward just as verbatim. Anything that reads like backend internals gets
// swapped for a generic message rather than rendered to the subscriber.
const RAW_BACKEND_ERROR = /constraint|duplicate key|syntax error|violates|relation "|column "|SQLSTATE|stack trace/i;
function friendlyPaymentError(message: unknown): string {
  if (typeof message !== "string" || !message.trim() || RAW_BACKEND_ERROR.test(message)) {
    return "Couldn't start that payment. Try again.";
  }
  return message;
}

export function useInitiatePayment() {
  return useMutation({
    mutationFn: async (input: {
      tier: "spark" | "flame" | "ember";
      period: "weekly" | "monthly" | "sixMonth";
      method: PayMethod;
      phone?: string;
      sourceFeature?: string;
      resend?: boolean;
    }) => {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(friendlyPaymentError(body?.message));
      return body as InitiateResult;
    },
  });
}

export interface PaymentStatusRow {
  id: number;
  status: PayStatus;
  tier: string;
  period: "weekly" | "monthly" | "sixMonth";
  amount: number;
  provider: string;
  phoneNumberMasked: string | null;
  failureReason: string | null;
  rawStatus: string | null;
}

export function usePaymentStatus(id: number | null, enabled: boolean) {
  return useQuery<PaymentStatusRow>({
    queryKey: ["/api/payments", id],
    enabled: enabled && id != null,
    refetchInterval: (q) => {
      const s = (q.state.data as PaymentStatusRow | undefined)?.status;
      return s && s !== "pending" ? false : 3000;
    },
    queryFn: async () => {
      const res = await fetch(`/api/payments/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't check that payment");
      return res.json();
    },
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/subscription", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Couldn't cancel");
      return res.json() as Promise<{ cancelled: boolean; endsAt: string | null }>;
    },
    onSuccess: () => refreshPlanQueries(qc),
  });
}

export function refreshPlanQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["/api/subscription"] });
  qc.invalidateQueries({ queryKey: ["/api/entitlements"] });
  qc.invalidateQueries({ queryKey: ["/api/profiles/me"] });
  qc.invalidateQueries({ queryKey: ["/api/gate"] });
}
