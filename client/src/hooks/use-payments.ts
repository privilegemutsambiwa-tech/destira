import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PayMethod = "ecocash" | "ecocash_card" | "card";
export type PayStatus = "pending" | "paid" | "failed" | "cancelled" | "expired";

export interface InitiateResult {
  paymentId: number;
  status: PayStatus;
  instructions?: string;
  redirectUrl?: string;
  pollUrl?: string;
  failureReason?: string;
  resumed?: boolean;
}

export function useInitiatePayment() {
  return useMutation({
    mutationFn: async (input: {
      tier: "spark" | "flame" | "ember";
      period: "weekly" | "monthly" | "sixMonth";
      method: PayMethod;
      phone?: string;
      sourceFeature?: string;
    }) => {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Couldn't start that payment");
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
