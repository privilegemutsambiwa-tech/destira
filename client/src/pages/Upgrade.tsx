import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, Crown, Sparkles, ArrowLeft, Loader2, Star } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Plan {
  id: number;
  name: string;
  durationDays: number;
  priceUsd: string;
  weeklyEquivalent: string | null;
  isBestValue: boolean;
  features: string[] | null;
  stripePriceId: string | null;
  isActive: boolean;
}

const FREE_FEATURES = [
  "Basic discovery feed",
  "5 AI Twin interviews/month",
  "Join up to 3 groups",
  "Standard matching",
];

const PREMIUM_EXTRAS = [
  "Unlimited AI Twin interviews",
  "Priority discovery feed",
  "Advanced matching algorithm",
  "Chat with your own Twin",
  "See who viewed your profile",
  "Exclusive premium badge",
];

export default function Upgrade() {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [checkingOutPlanId, setCheckingOutPlanId] = useState<number | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const activePlans = plans?.filter((p) => p.isActive) || [];
  const bestValuePlan = activePlans.find((p) => p.isBestValue);
  const effectiveSelectedId = selectedPlanId ?? bestValuePlan?.id ?? activePlans[0]?.id ?? null;
  const selectedPlan = activePlans.find((p) => p.id === effectiveSelectedId);

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const res = await apiRequest("POST", "/api/stripe/checkout", { priceId });
      return await res.json();
    },
    onSuccess: (data: { url: string }) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckingOutPlanId(null);
      }
    },
    onError: (error: Error) => {
      setCheckingOutPlanId(null);
      toast({
        title: "Checkout Error",
        description: error.message || "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleContinue = (planId: number) => {
    const plan = activePlans.find((p) => p.id === planId);
    if (!plan) return;
    if (!plan.stripePriceId) {
      toast({ title: "Coming Soon", description: "This plan is not available for purchase yet. Stay tuned!" });
      return;
    }
    setCheckingOutPlanId(planId);
    checkoutMutation.mutate(plan.stripePriceId);
  };

  return (
    <LayoutShell>
      <div className="max-w-2xl mx-auto" data-testid="page-upgrade">
        {/* Back button */}
        <button
          onClick={() => setLocation("/billing")}
          className="flex items-center gap-1.5 text-sm mb-0 btn-press"
          style={{ color: "#9090A8", background: "transparent", border: "none" }}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Gradient header — 200px */}
        <div
          className="text-center flex flex-col items-center justify-center -mx-4 sm:-mx-6 mb-8"
          style={{
            height: "200px",
            background: "linear-gradient(135deg, #7C3AED, #EC4899)",
            borderRadius: "0 0 24px 24px",
            padding: "0 24px",
          }}
          data-testid="section-upgrade-header"
        >
          <Crown className="w-10 h-10 text-white mb-3" />
          <h1 className="font-bold text-white" style={{ fontSize: "24px", letterSpacing: "-0.5px" }} data-testid="text-upgrade-title">
            Upgrade to Premium
          </h1>
          <p className="text-white/80 mt-2" style={{ fontSize: "14px", maxWidth: "280px" }}>
            Unlock unlimited access and exclusive features.
          </p>
        </div>

        {/* Free vs Premium comparison — side-by-side */}
        <div className="mb-8 px-0" data-testid="section-free-vs-premium">
          <h2 className="font-bold text-white mb-4" style={{ fontSize: "17px" }}>Free vs Premium</h2>
          <div className="grid grid-cols-2 gap-3">
            {/* Free card */}
            <div
              style={{
                background: "#1A1A24",
                border: "1px solid #2E2E42",
                borderRadius: "16px",
                padding: "16px",
              }}
              data-testid="card-free-tier"
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" style={{ color: "#9090A8" }} />
                <span className="font-semibold text-sm text-white">Free</span>
              </div>
              <ul className="space-y-2">
                {FREE_FEATURES.map((f, i) => (
                  <li key={i} className="flex items-start gap-2" style={{ fontSize: "12px", color: "#9090A8" }}>
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#9090A8" }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Premium card — 2px gradient border, purple tint, "Most Popular" badge */}
            <div
              className="relative"
              style={{
                background: "rgba(124,58,237,0.1)",
                borderRadius: "16px",
                padding: "2px",
                backgroundImage: "linear-gradient(135deg, #7C3AED, #EC4899)",
              }}
              data-testid="card-premium-tier"
            >
              <div
                style={{
                  background: "rgba(124,58,237,0.12)",
                  borderRadius: "14px",
                  padding: "16px",
                  height: "100%",
                }}
              >
                {/* Most Popular pill badge */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span
                    className="flex items-center gap-1 text-white font-semibold"
                    style={{
                      background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                      borderRadius: "100px",
                      padding: "3px 10px",
                      fontSize: "11px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Star className="w-3 h-3" />
                    Most Popular
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-3 mt-2">
                  <Crown className="w-4 h-4" style={{ color: "#A78BFA" }} />
                  <span className="font-semibold text-sm text-white">Premium</span>
                </div>
                <ul className="space-y-2">
                  {PREMIUM_EXTRAS.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-white" style={{ fontSize: "12px" }}>
                      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#22C55E" }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing tier cards */}
        {isLoading ? (
          <div className="flex justify-center py-12" data-testid="loading-plans">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
          </div>
        ) : activePlans.length === 0 ? (
          <div className="text-center py-12" style={{ color: "#9090A8" }} data-testid="text-no-plans">
            No plans available at the moment.
          </div>
        ) : (
          <>
            <h2 className="font-bold text-white mb-4" style={{ fontSize: "17px" }}>Choose Your Plan</h2>

            {/* Stacked full-width cards */}
            <div className="space-y-3" data-testid="section-plan-cards">
              {activePlans.map((plan) => {
                const isSelected = plan.id === effectiveSelectedId;
                const isBest = plan.isBestValue;

                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className="cursor-pointer"
                    style={{
                      borderRadius: "16px",
                      padding: isBest ? "2px" : "0",
                      background: isBest ? "linear-gradient(135deg, #7C3AED, #EC4899)" : "transparent",
                    }}
                    data-testid={`card-plan-${plan.id}`}
                  >
                    <div
                      style={{
                        background: isBest ? "rgba(124,58,237,0.12)" : "#1A1A24",
                        borderRadius: isBest ? "14px" : "16px",
                        border: isBest ? "none" : `1px solid ${isSelected ? "#7C3AED" : "#2E2E42"}`,
                        padding: "16px",
                      }}
                    >
                      {/* Row 1: duration label (left) + gradient price/week (center) + total (right) */}
                      <div className="flex items-center justify-between gap-2 mb-4">
                        {/* Duration label */}
                        <div>
                          <p className="font-semibold text-white" style={{ fontSize: "15px" }} data-testid={`text-plan-name-${plan.id}`}>
                            {plan.name}
                          </p>
                          <p style={{ fontSize: "12px", color: "#9090A8" }}>{plan.durationDays} days</p>
                        </div>

                        {/* Large gradient price-per-week (center) */}
                        {plan.weeklyEquivalent && (
                          <div className="text-center">
                            <p
                              className="font-black"
                              style={{
                                fontSize: "28px",
                                background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text",
                                lineHeight: 1,
                              }}
                              data-testid={`text-plan-weekly-${plan.id}`}
                            >
                              ${plan.weeklyEquivalent}
                            </p>
                            <p style={{ fontSize: "11px", color: "#9090A8" }}>per week</p>
                          </div>
                        )}

                        {/* Total price (right) */}
                        <div className="text-right">
                          <p className="font-bold text-white" style={{ fontSize: "18px" }} data-testid={`text-plan-price-${plan.id}`}>
                            ${plan.priceUsd}
                          </p>
                          <p style={{ fontSize: "11px", color: "#9090A8" }}>total</p>
                        </div>
                      </div>

                      {/* Plan features */}
                      {plan.features && plan.features.length > 0 && (
                        <ul className="space-y-1.5 mb-4">
                          {plan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-2 text-white" style={{ fontSize: "13px" }}>
                              <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#22C55E" }} />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedPlanId(plan.id); handleContinue(plan.id); }}
                        disabled={checkoutMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 font-semibold btn-press"
                        style={{
                          height: "44px",
                          borderRadius: "10px",
                          background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                          border: "none",
                          color: "#FFFFFF",
                          fontSize: "14px",
                          boxShadow: "0 4px 16px rgba(124,58,237,0.35)",
                        }}
                        data-testid={`button-choose-plan-${plan.id}`}
                      >
                        {checkingOutPlanId === plan.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Crown className="w-4 h-4" />
                        )}
                        Choose Plan
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="pb-8" />
      </div>
    </LayoutShell>
  );
}
