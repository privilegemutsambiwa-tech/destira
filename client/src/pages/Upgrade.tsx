import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Star, Sparkles, ArrowLeft } from "lucide-react";
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
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Checkout Error",
        description: error.message || "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleContinue = () => {
    if (!selectedPlan) return;

    if (!selectedPlan.stripePriceId) {
      toast({
        title: "Coming Soon",
        description: "This plan is not available for purchase yet. Stay tuned!",
      });
      return;
    }

    checkoutMutation.mutate(selectedPlan.stripePriceId);
  };

  return (
    <LayoutShell>
      <div className="max-w-2xl mx-auto" data-testid="page-upgrade">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/billing")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>

        <div className="gradient-bg rounded-md p-8 text-center mb-8" data-testid="section-upgrade-header">
          <Crown className="w-12 h-12 text-white mx-auto mb-3" />
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2" data-testid="text-upgrade-title">
            Unlock Premium
          </h1>
          <p className="text-white/80 text-sm md:text-base max-w-md mx-auto">
            Get the most out of VibeFlow with exclusive features and unlimited access.
          </p>
        </div>

        <div className="mb-8" data-testid="section-free-vs-premium">
          <h2 className="text-lg font-semibold mb-4">Free vs Premium</h2>
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4" data-testid="card-free-tier">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-muted-foreground" />
                <span className="font-semibold text-sm">Free</span>
              </div>
              <ul className="space-y-2">
                {FREE_FEATURES.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4 border-primary border-2" data-testid="card-premium-tier">
              <div className="flex items-center gap-2 mb-3">
                <Crown className="w-5 h-5 text-primary" />
                <span className="font-semibold text-sm">Premium</span>
              </div>
              <ul className="space-y-2">
                {PREMIUM_EXTRAS.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12" data-testid="loading-plans">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activePlans.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground" data-testid="text-no-plans">
            No plans available at the moment.
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-4">Choose Your Plan</h2>
            <div
              className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-none"
              data-testid="section-plan-cards"
            >
              {activePlans.map((plan) => {
                const isSelected = plan.id === effectiveSelectedId;
                return (
                  <Card
                    key={plan.id}
                    className={`relative min-w-[160px] flex-1 snap-center cursor-pointer p-4 transition-all ${
                      isSelected
                        ? "border-primary border-2 ring-2 ring-primary/20"
                        : "hover-elevate"
                    }`}
                    onClick={() => setSelectedPlanId(plan.id)}
                    data-testid={`card-plan-${plan.id}`}
                  >
                    {plan.isBestValue && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="gradient-bg text-white border-0 text-xs">
                          <Star className="w-3 h-3 mr-1" />
                          Best Value
                        </Badge>
                      </div>
                    )}
                    <div className="text-center pt-2">
                      <p className="font-semibold text-sm mb-1" data-testid={`text-plan-name-${plan.id}`}>
                        {plan.name}
                      </p>
                      <p className="text-2xl font-bold" data-testid={`text-plan-price-${plan.id}`}>
                        ${plan.priceUsd}
                      </p>
                      {plan.weeklyEquivalent && (
                        <p className="text-xs text-muted-foreground mt-1" data-testid={`text-plan-weekly-${plan.id}`}>
                          ${plan.weeklyEquivalent}/week
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {plan.durationDays} days
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>

            {selectedPlan && selectedPlan.features && selectedPlan.features.length > 0 && (
              <div className="mt-6 mb-6" data-testid="section-plan-features">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                  What you get with {selectedPlan.name}
                </h3>
                <ul className="space-y-2">
                  {selectedPlan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              className="w-full gradient-bg text-white border-0 mt-4"
              size="lg"
              onClick={handleContinue}
              disabled={!selectedPlan || checkoutMutation.isPending}
              data-testid="button-continue"
            >
              {checkoutMutation.isPending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <Crown className="w-5 h-5 mr-2" />
              )}
              Continue
            </Button>
          </>
        )}
      </div>
    </LayoutShell>
  );
}
