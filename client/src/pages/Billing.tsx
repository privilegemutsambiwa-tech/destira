import { useSubscription, useEntitlements } from "@/hooks/use-interactions";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Crown, Check, Sparkles, Zap, Star, Loader2, ExternalLink, ArrowLeft, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useProfile } from "@/hooks/use-profiles";

const BG = "#0F0F14";
const CARD = "#1A1A24";
const ELEVATED = "#242433";
const BORDER = "#2E2E42";
const MUTED = "#9090A8";
const GRAD = "linear-gradient(135deg, #7C3AED, #EC4899)";

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

const TIERS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "Get started on your journey",
    color: MUTED,
    icon: Sparkles,
    features: [
      { label: "5 likes per day", included: true },
      { label: "Basic discovery feed", included: true },
      { label: "Join up to 2 groups", included: true },
      { label: "AI Twin interviews (limited)", included: true },
      { label: "Priority matching", included: false },
      { label: "Twin Chat with matches", included: false },
      { label: "See who viewed you", included: false },
      { label: "Unlimited likes", included: false },
    ],
  },
  {
    id: "plus",
    name: "Plus",
    price: "$9.99",
    period: "/month",
    tagline: "For those serious about connecting",
    color: "#7C3AED",
    popular: true,
    icon: Crown,
    features: [
      { label: "50 likes per day", included: true },
      { label: "Priority discovery feed", included: true },
      { label: "Up to 10 groups", included: true },
      { label: "Unlimited AI Twin interviews", included: true },
      { label: "Priority matching algorithm", included: true },
      { label: "Twin Chat with matches", included: true },
      { label: "AI profile summaries", included: true },
      { label: "See who viewed you", included: false },
    ],
  },
  {
    id: "vip",
    name: "VIP",
    price: "$19.99",
    period: "/month",
    tagline: "The full VibeFlow experience",
    color: "#EC4899",
    icon: Star,
    features: [
      { label: "Unlimited likes", included: true },
      { label: "Priority discovery feed", included: true },
      { label: "Unlimited groups", included: true },
      { label: "Unlimited AI Twin interviews", included: true },
      { label: "Priority matching algorithm", included: true },
      { label: "Twin Chat with matches", included: true },
      { label: "See who viewed your profile", included: true },
      { label: "Exclusive VIP badge + boost tokens", included: true },
    ],
  },
];

export default function Billing() {
  const [, setLocation] = useLocation();
  const { data: subscription, isLoading } = useSubscription();
  const { data: entitlements } = useEntitlements();
  const { data: profile } = useProfile();
  const { toast } = useToast();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);

  const { data: stripeProducts } = useQuery<StripeProduct[]>({
    queryKey: ["/api/stripe/products"],
  });

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast({ title: "Subscription Active!", description: "Welcome to your new plan. Premium features are now unlocked." });
    }
    if (searchParams.get("canceled") === "true") {
      toast({ title: "Checkout Canceled", description: "No changes were made.", variant: "destructive" });
    }
  }, []);

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const res = await apiRequest("POST", "/api/stripe/checkout", { priceId });
      return await res.json();
    },
    onSuccess: (data: { url: string }) => { if (data.url) window.location.href = data.url; },
    onError: (error: Error) => toast({ title: "Checkout Error", description: error.message, variant: "destructive" }),
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/portal");
      return await res.json();
    },
    onSuccess: (data: { url: string }) => { if (data.url) window.location.href = data.url; },
    onError: () => toast({ title: "Error", description: "Could not open billing portal.", variant: "destructive" }),
  });

  const handleSubscribe = (tierId: string) => {
    if (tierId === "free") return;
    const product = stripeProducts?.find((p) => p.metadata?.tier === tierId);
    if (!product || product.prices.length === 0) {
      toast({ title: "Not Available", description: "This plan is not set up yet. Check back soon." });
      return;
    }
    checkoutMutation.mutate(product.prices[0].id);
  };

  const currentTier = subscription?.tier || profile?.subscriptionTier || "free";
  const hasActiveSub = currentTier !== "free";

  const tiers = TIERS.map((t) => {
    if (stripeProducts) {
      const product = stripeProducts.find((p) => p.metadata?.tier === t.id);
      if (product && product.prices.length > 0) {
        return { ...t, price: `$${(product.prices[0].unit_amount / 100).toFixed(2)}`, name: product.name.replace("VibeFlow ", "") };
      }
    }
    return t;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: BG, color: "#FFFFFF", fontFamily: "'Inter', sans-serif" }} data-testid="page-billing">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4" style={{ height: "56px", background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={() => setLocation("/settings")} className="w-8 h-8 flex items-center justify-center" data-testid="button-billing-back">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="font-bold text-white" style={{ fontSize: "17px" }}>Choose Your Plan</h1>
      </div>

      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "24px 16px 48px" }}>

        <div className="text-center mb-8">
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            background: "rgba(124, 58, 237, 0.15)", borderRadius: "100px",
            padding: "6px 16px", marginBottom: "16px",
            border: "1px solid rgba(124, 58, 237, 0.3)",
          }}>
            <Crown className="w-4 h-4" style={{ color: "#7C3AED" }} />
            <span className="text-sm font-medium" style={{ color: "#7C3AED" }}>Unlock full potential</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Find connections that actually matter</h2>
          <p className="text-sm" style={{ color: MUTED }}>Your AI Twin gets smarter. Your matches get better.</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {tiers.map((tier) => {
            const TierIcon = tier.icon;
            const isActive = currentTier === tier.id;
            const isPending = checkoutMutation.isPending;

            return (
              <div
                key={tier.id}
                style={{
                  background: CARD,
                  borderRadius: "20px",
                  border: isActive ? `2px solid ${tier.color}` : tier.popular ? `2px solid rgba(124,58,237,0.5)` : `1px solid ${BORDER}`,
                  overflow: "hidden",
                  position: "relative",
                }}
                data-testid={`card-tier-${tier.id}`}
              >
                {tier.popular && !isActive && (
                  <div style={{
                    position: "absolute", top: "12px", right: "12px",
                    background: GRAD, borderRadius: "100px",
                    padding: "3px 10px", fontSize: "11px", fontWeight: 600, color: "#FFFFFF",
                  }}>
                    Most Popular
                  </div>
                )}
                {isActive && (
                  <div style={{
                    position: "absolute", top: "12px", right: "12px",
                    background: tier.color, borderRadius: "100px",
                    padding: "3px 10px", fontSize: "11px", fontWeight: 600, color: "#FFFFFF",
                  }}>
                    Current
                  </div>
                )}

                <div style={{ padding: "20px 20px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "12px",
                      background: isActive || tier.popular ? GRAD : ELEVATED,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <TierIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-base">{tier.name}</p>
                      <p className="text-xs" style={{ color: MUTED }}>{tier.tagline}</p>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "16px" }}>
                    <span className="text-3xl font-black text-white">{tier.price}</span>
                    <span className="text-sm" style={{ color: MUTED }}>{tier.period}</span>
                  </div>
                </div>

                <div style={{ padding: "0 20px 20px" }}>
                  <div style={{ marginBottom: "16px" }}>
                    {tier.features.map((feature, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
                        {feature.included ? (
                          <div style={{
                            width: "18px", height: "18px", borderRadius: "50%",
                            background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        ) : (
                          <div style={{
                            width: "18px", height: "18px", borderRadius: "50%",
                            background: ELEVATED, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            <Lock className="w-3 h-3" style={{ color: MUTED }} />
                          </div>
                        )}
                        <span className="text-sm" style={{ color: feature.included ? "#FFFFFF" : MUTED }}>{feature.label}</span>
                      </div>
                    ))}
                  </div>

                  {isActive ? (
                    tier.id === "free" && !hasActiveSub ? (
                      <button
                        className="w-full py-3 text-sm font-semibold"
                        style={{ background: ELEVATED, borderRadius: "12px", border: "none", color: MUTED, cursor: "default" }}
                        disabled
                        data-testid={`button-current-${tier.id}`}
                      >
                        Current Plan
                      </button>
                    ) : (
                      <button
                        onClick={() => portalMutation.mutate()}
                        disabled={portalMutation.isPending}
                        className="w-full py-3 text-sm font-semibold text-white flex items-center justify-center gap-2"
                        style={{ background: ELEVATED, borderRadius: "12px", border: `1px solid ${BORDER}`, cursor: "pointer" }}
                        data-testid={`button-manage-${tier.id}`}
                      >
                        {portalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                        Manage Subscription
                      </button>
                    )
                  ) : tier.id === "free" ? (
                    hasActiveSub ? (
                      <button
                        onClick={() => portalMutation.mutate()}
                        disabled={portalMutation.isPending}
                        className="w-full py-3 text-sm font-semibold flex items-center justify-center gap-2"
                        style={{ background: ELEVATED, borderRadius: "12px", border: `1px solid ${BORDER}`, color: MUTED, cursor: "pointer" }}
                        data-testid={`button-downgrade-${tier.id}`}
                      >
                        Downgrade via Portal
                      </button>
                    ) : (
                      <button
                        className="w-full py-3 text-sm font-semibold"
                        style={{ background: ELEVATED, borderRadius: "12px", border: "none", color: MUTED, cursor: "default" }}
                        disabled
                        data-testid={`button-current-${tier.id}`}
                      >
                        Current Plan
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => handleSubscribe(tier.id)}
                      disabled={isPending}
                      className="w-full py-3 text-sm font-semibold text-white flex items-center justify-center gap-2"
                      style={{ background: GRAD, borderRadius: "12px", border: "none", cursor: "pointer" }}
                      data-testid={`button-subscribe-${tier.id}`}
                    >
                      {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      {tier.id === "vip" ? "Go VIP" : "Upgrade to Plus"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {entitlements && entitlements.length > 0 && (
          <div style={{ marginTop: "32px" }}>
            <p className="text-xs font-semibold mb-3" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1.2px" }}>Your Entitlements</p>
            <div style={{ background: CARD, borderRadius: "16px", overflow: "hidden" }}>
              {entitlements.map((ent: any, i: number) => (
                <div key={ent.id} style={{
                  display: "flex", alignItems: "center", padding: "12px 16px",
                  borderBottom: i < entitlements.length - 1 ? `1px solid ${BORDER}` : "none",
                }}>
                  <Zap className="w-4 h-4 mr-3" style={{ color: "#7C3AED" }} />
                  <span className="flex-1 text-sm text-white capitalize">{String(ent.type).replace(/_/g, " ")}</span>
                  <span className="text-sm font-semibold" style={{ color: "#EC4899" }}>{ent.quantity} remaining</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs mt-8" style={{ color: MUTED }}>
          Cancel anytime. No hidden fees. Payments processed securely by Stripe.
        </p>
      </div>
    </div>
  );
}
