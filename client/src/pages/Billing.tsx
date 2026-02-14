import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSubscription, useEntitlements } from "@/hooks/use-interactions";
import { Crown, Check, Sparkles, Zap, Star, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "5 AI Twin interviews/month",
      "Basic discovery feed",
      "Join up to 3 groups",
      "Standard matching",
    ],
    tier: "free",
  },
  {
    name: "Plus",
    price: "$9.99",
    period: "/month",
    popular: true,
    features: [
      "Unlimited AI Twin interviews",
      "Priority discovery feed",
      "Join unlimited groups",
      "Advanced matching algorithm",
      "Chat with your own Twin",
      "AI profile summaries",
    ],
    tier: "plus",
  },
  {
    name: "VIP",
    price: "$19.99",
    period: "/month",
    features: [
      "Everything in Plus",
      "See who viewed your profile",
      "Read receipts in DMs",
      "Priority customer support",
      "Exclusive VIP badge",
      "Monthly boost tokens",
    ],
    tier: "vip",
  },
];

export default function Billing() {
  const { data: subscription, isLoading } = useSubscription();
  const { data: entitlements } = useEntitlements();
  const { toast } = useToast();

  const currentTier = subscription?.tier || "free";

  const handleSubscribe = (tier: string) => {
    toast({
      title: "Coming Soon",
      description: "Stripe checkout integration is being set up. Check back soon!",
    });
  };

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
        <h1 className="text-3xl font-display font-bold mb-2" data-testid="text-billing-title">Choose Your Plan</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Unlock the full VibeFlow experience with premium features.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {TIERS.map((tier) => {
          const isActive = currentTier === tier.tier;
          return (
            <Card
              key={tier.tier}
              className={`relative ${tier.popular ? 'border-primary' : ''}`}
              data-testid={`card-tier-${tier.tier}`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
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
                  {tier.features.map((feature, i) => (
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
                ) : (
                  <Button
                    className="w-full"
                    variant={tier.popular ? "default" : "outline"}
                    onClick={() => handleSubscribe(tier.tier)}
                    data-testid={`button-subscribe-${tier.tier}`}
                  >
                    {tier.tier === "free" ? "Downgrade" : "Upgrade"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

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
