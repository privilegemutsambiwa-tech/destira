// Settings > Plan & billing.

import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PLAN_CARDS as SETTINGS_PLAN_CARDS, PERIOD_LABEL, periodPriceCents, type BillingPeriod } from "@shared/entitlements";
import { useSubscription } from "@/hooks/use-interactions";
import { useCancelSubscription } from "@/hooks/use-payments";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CARD, BORDER, MUTED, TEXT, EMBER, SERIF, ROW_STYLE, Panel, GradientButton } from "./ui";

type PaymentRow = {
  id: number;
  receiptNo: string | null;
  createdAt: string;
  planName: string | null;
  period: BillingPeriod | "threeMonth" | "once";
  amountCents: number;
  status: "paid" | "failed";
  method: string;
  phoneMasked: string | null;
};

export function BillingPanel({ onBack, profile }: { onBack: () => void; profile: any }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const cancelSub = useCancelSubscription();
  const { data: sub } = useSubscription();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const raw = profile?.subscriptionTier ?? "free";
  const tier: "free" | "spark" | "flame" | "ember" =
    raw === "plus" ? "flame" : raw === "vip" ? "ember" : (["spark", "flame", "ember"].includes(raw) ? raw : "free");
  const card = SETTINGS_PLAN_CARDS.find((c) => c.tier === tier) ?? SETTINGS_PLAN_CARDS[0];
  const period: BillingPeriod = (sub?.period as BillingPeriod) ?? "monthly";
  const renewsAt: string | null = sub?.currentPeriodEnd ?? null;
  const autoRenews = sub?.provider === "stripe";
  const isTrial = sub?.provider === "trial";
  const cancelled = !!sub?.cancelAtPeriodEnd;
  const periodCents = tier === "free" ? 0 : periodPriceCents(tier, period);
  const endDate = renewsAt ? new Date(renewsAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
  const tierInfo = {
    label: card.name,
    price: isTrial ? "Free trial" : periodCents === 0 ? "$0" : `$${(periodCents / 100).toFixed(2)}`,
    cycle:
      card.priceCents === 0
        ? "No billing"
        : isTrial
          ? "Nothing to pay"
          : period === "sixMonth"
            ? "For 6 months, USD"
            : `For one ${PERIOD_LABEL[period]}, USD`,
    renewal:
      card.priceCents === 0 || !endDate
        ? null
        : isTrial
          ? `Your free trial ends on ${endDate}, then you're on Free. We'll remind you first.`
          : cancelled
            ? `Cancelled. Yours until ${endDate}, then Free.`
            : autoRenews
              ? `Renews automatically on ${endDate}`
              : `Nothing renews by itself. Pay again by ${endDate} to keep it; we'll remind you before it ends.`,
    details: card.gets.slice(0, 3).join(" · "),
  };
  const { data: history, isLoading: historyLoading } = useQuery<PaymentRow[]>({ queryKey: ["/api/payments/history"] });
  // A Crown member's plan underneath is Ember; this panel talks about Crown.
  const { data: crown } = useQuery<{ active: boolean; activeUntil: string | null; prices: { monthly: number } }>({ queryKey: ["/api/crown"] });
  if (crown?.active && crown.activeUntil) {
    tierInfo.label = "Crown";
    tierInfo.price = `$${(crown.prices.monthly / 100).toFixed(2)}`;
    tierInfo.cycle = "A month, USD";
    tierInfo.renewal = `Crown until ${new Date(crown.activeUntil).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}. Nothing renews by itself; we'll remind you before it ends.`;
  }

  return (
    <>
    <Panel title="Manage Billing" onBack={onBack}>
      <div className="vf-card" style={{ margin: "16px", borderRadius: "16px", background: CARD, padding: "20px" }}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1.2px" }}>Current Plan</p>
            <p className="text-xl font-bold text-foreground">{tierInfo.label}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-foreground">{tierInfo.price}</p>
            <p className="text-xs" style={{ color: MUTED }}>{tierInfo.cycle}</p>
          </div>
        </div>
        <p className="text-sm" style={{ color: MUTED }}>{tierInfo.details}</p>
        {tierInfo.renewal && (
          <p className="text-xs mt-2" style={{ color: MUTED }}>{tierInfo.renewal}</p>
        )}
      </div>

      {(tier === "free" || isTrial) && (
        <div style={{ padding: "0 16px 16px" }}>
          <GradientButton label={isTrial ? `Keep ${tierInfo.label}` : "See plans"} onClick={() => setLocation("/plans")} testId="button-upgrade-billing" />
        </div>
      )}
      {tier !== "free" && !isTrial && !autoRenews && (
        <div style={{ padding: "0 16px 16px" }}>
          <GradientButton
            label={crown?.active ? "Add time to Crown" : `Pay for another ${period === "sixMonth" ? "6 months" : PERIOD_LABEL[period]}`}
            onClick={() => setLocation(crown?.active ? "/crown" : `/plans/pay?tier=${tier}&period=${period}`)}
            testId="button-renew-billing"
          />
        </div>
      )}

      <div className="vf-card" style={{ margin: "0 16px", borderRadius: "16px", background: CARD, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-xs font-semibold mb-2" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>Payment History</p>
          {historyLoading ? (
            <p className="text-sm text-center py-2" style={{ color: MUTED }}>Loading…</p>
          ) : !history?.length ? (
            <p className="text-sm text-center py-2" style={{ color: MUTED }} data-testid="text-no-payments">No payments yet</p>
          ) : (
            <div data-testid="list-payments">
              {history.map((p) => (
                <div key={p.id} className="py-2" style={{ borderTop: `1px solid ${BORDER}` }} data-testid={`payment-${p.id}`}>
                  <div className="flex justify-between items-center gap-3">
                    <p className="text-sm text-foreground">
                      {p.period === "once" ? p.planName : <>Destira {p.planName ?? "plan"}</>}
                      {p.period !== "once" && <span style={{ color: MUTED }}>, {p.period === "sixMonth" ? "6 months" : p.period === "threeMonth" ? "3 months" : `1 ${PERIOD_LABEL[p.period]}`}</span>}
                    </p>
                    <p className="text-sm font-semibold text-foreground">${(p.amountCents / 100).toFixed(2)}</p>
                  </div>
                  <div className="flex justify-between items-center gap-3 mt-0.5">
                    <p className="text-xs" style={{ color: MUTED }}>
                      {new Date(p.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {p.method}
                      {p.phoneMasked ? ` ${p.phoneMasked}` : ""}
                      {p.receiptNo ? ` · ${p.receiptNo}` : ""}
                    </p>
                    {p.status === "paid" ? (
                      <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981" }}>Paid</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(239,68,68,0.12)", color: "var(--vf-danger)" }} title="No money was taken">Didn't go through</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {tier !== "free" && !isTrial && !cancelled && (
          <button
            className="vf-row"
            style={{ ...ROW_STYLE, borderBottom: "none", width: "100%", textAlign: "left", background: "transparent", border: "none" }}
            data-testid="row-cancel-plan"
            disabled={cancelSub.isPending}
            onClick={() => setShowCancelDialog(true)}
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Cancel subscription</p>
              <p className="text-xs" style={{ color: MUTED }}>Keeps working until the period ends. No exit fee.</p>
            </div>
            {cancelSub.isPending ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: MUTED }} /> : <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />}
          </button>
        )}
      </div>

      <p className="text-xs px-4 pt-4 pb-2 text-center" style={{ color: MUTED }}>
        Questions? Email <span style={{ color: EMBER }}>support@destira.date</span>
      </p>
    </Panel>

    <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
      <DialogContent style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "20px" }}>
        <DialogHeader>
          <DialogTitle style={{ ...SERIF, color: TEXT }}>Cancel {tierInfo.label}?</DialogTitle>
          <DialogDescription style={{ color: MUTED }}>
            You keep it until the paid period ends, then you're on Free.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <button
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 hover:bg-[var(--vf-elevated)]"
            style={{ color: MUTED }}
            onClick={() => setShowCancelDialog(false)}
            data-testid="button-cancel-cancel-plan"
          >
            Keep plan
          </button>
          <button
            disabled={cancelSub.isPending}
            className="px-4 py-2 text-sm font-semibold vf-btn-primary"
            style={{ background: "#C62828", color: "#FFFFFF", borderRadius: "10px", border: "none" }}
            onClick={() => {
              setShowCancelDialog(false);
              cancelSub.mutate(undefined, {
                onSuccess: (r) =>
                  toast({
                    title: "Cancelled",
                    description: r.endsAt
                      ? `You're on ${tierInfo.label} until ${new Date(r.endsAt).toLocaleDateString()}, then Free.`
                      : "You're back on Free.",
                  }),
              });
            }}
            data-testid="button-confirm-cancel-plan"
          >
            {cancelSub.isPending ? "Cancelling..." : "Cancel subscription"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
