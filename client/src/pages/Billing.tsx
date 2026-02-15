import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSubscription, useEntitlements } from "@/hooks/use-interactions";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Crown, Check, Sparkles, Zap, Star, Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { useSearch } from "wouter";

interface StripeProduct {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, string>;
  prices: {
    id: string;
    unit_amount: number;
    currency: string;
    recurring: { interval: string } | null;
  }[];
}

const TIER_CONFIG: Record<string, { features: string[]; popular?: boolean; icon: any }> = {
  free: {
    features: [
      "5 AI Twin interviews/month",
      "Basic discovery feed",
      "Join up to 3 groups",
      "Standard matching",
    ],
    icon: Sparkles,
  },
  plus: {
    popular: true,
    features: [
      "Unlimited AI Twin interviews",
      "Priority discovery feed",
      "Join unlimited groups",
      "Advanced matching algorithm",
      "Chat with your own Twin",
      "AI profile summaries",
    ],
    icon: Crown,
  },
  vip: {
    features: [
      "Everything in Plus",
      "See who viewed your profile",
      "Read receipts in DMs",
      "Priority customer support",
      "Exclusive VIP badge",
      "Monthly boost tokens",
    ],
    icon: Star,
  },
};

export default function Billing() {
  const { data: subscription, isLoading } = useSubscription();
  const { data: entitlements } = useEntitlements();
  const { toast } = useToast();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);

  const { data: stripeProducts } = useQuery<StripeProduct[]>({
    queryKey: ["/api/stripe/products"],
  });

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast({
        title: "Subscription Active",
        description: "Welcome to your new plan! Your premium features are now available.",
      });
    }
    if (searchParams.get("canceled") === "true") {
      toast({
        title: "Checkout Canceled",
        description: "No changes were made to your subscription.",
        variant: "destructive",
      });
    }
  }, []);

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

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/portal");
      return await res.json();
    },
    onSuccess: (data: { url: string }) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: "Failed to open subscription management.",
        variant: "destructive",
      });
    },
  });

  const handleSubscribe = (tier: string) => {
    if (tier === "free") return;

    const product = stripeProducts?.find(
      (p) => p.metadata?.tier === tier
    );

    if (!product || product.prices.length === 0) {
      toast({
        title: "Not Available",
        description: "This plan is not available yet. Please try again later.",
      });
      return;
    }

    checkoutMutation.mutate(product.prices[0].id);
  };

  const currentTier = subscription?.tier || "free";
  const hasActiveSub = currentTier !== "free";

  const tiers = [
    { tier: "free", name: "Free", price: "$0", period: "forever" },
    { tier: "plus", name: "Plus", price: "$9.99", period: "/month" },
    { tier: "vip", name: "VIP", price: "$19.99", period: "/month" },
  ];

  if (stripeProducts && stripeProducts.length > 0) {
    for (const product of stripeProducts) {
      const tierKey = product.metadata?.tier;
      if (tierKey && (tierKey === "plus" || tierKey === "vip")) {
        const t = tiers.find((t) => t.tier === tierKey);
        if (t && product.prices.length > 0) {
          const priceAmount = product.prices[0].unit_amount / 100;
          t.price = `$${priceAmount.toFixed(2)}`;
          t.name = product.name.replace("VibeFlow ", "");
        }
      }
    }
  }

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </LayoutShell>
    );
  }

  return (
    <LayoutShell>
      <div className="text-center mb-10">
        <h1 className="font-display font-bold mb-2" data-testid="text-billing-title">Choose Your Plan</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Unlock the full VibeFlow experience with premium features.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {tiers.map((tier) => {
          const config = TIER_CONFIG[tier.tier];
          const isActive = currentTier === tier.tier;
          const isPending = checkoutMutation.isPending;

          return (
            <Card
              key={tier.tier}
              className={`relative card-lift ${config?.popular ? 'border-primary border-2' : ''}`}
              data-testid={`card-tier-${tier.tier}`}
            >
              {config?.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="gradient-bg text-white border-0">
                    <Star className="w-3 h-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-lg">{tier.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">{tier.price}</span>
                  <span className="text-sm text-muted-foreground">{tier.period}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {config?.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {isActive ? (
                  <Button className="w-full" variant="outline" disabled data-testid={`button-current-${tier.tier}`}>
                    Current Plan
                  </Button>
                ) : tier.tier === "free" ? (
                  hasActiveSub ? (
                    <Button
                      className="w-full btn-press"
                      variant="outline"
                      onClick={() => portalMutation.mutate()}
                      disabled={portalMutation.isPending}
                      data-testid={`button-subscribe-${tier.tier}`}
                    >
                      {portalMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <ExternalLink className="w-4 h-4 mr-2" />
                      )}
                      Manage Subscription
                    </Button>
                  ) : (
                    <Button className="w-full" variant="outline" disabled data-testid={`button-current-${tier.tier}`}>
                      Current Plan
                    </Button>
                  )
                ) : (
                  <Button
                    className={`w-full btn-press ${config?.popular ? 'gradient-bg text-white' : ''}`}
                    variant={config?.popular ? "default" : "outline"}
                    onClick={() => handleSubscribe(tier.tier)}
                    disabled={isPending}
                    data-testid={`button-subscribe-${tier.tier}`}
                  >
                    {isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Upgrade
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {hasActiveSub && (
        <div className="mt-8 text-center">
          <Button
            variant="outline"
            className="btn-press"
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            data-testid="button-manage-subscription"
          >
            {portalMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ExternalLink className="w-4 h-4 mr-2" />
            )}
            Manage Subscription
          </Button>
        </div>
      )}

      {entitlements && entitlements.length > 0 && (
        <div className="mt-10 max-w-xl mx-auto">
          <h2 className="text-lg font-bold mb-4">Your Entitlements</h2>
          <div className="grid gap-3">
            {entitlements.map((ent: any) => (
              <Card key={ent.id}>
                <CardContent className="p-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium capitalize">{ent.type.replace(/_/g, " ")}</span>
                  </div>
                  <Badge variant="secondary">{ent.quantity} remaining</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </LayoutShell>
  );
}
