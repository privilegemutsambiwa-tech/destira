import { Button } from "@/components/ui/button";
import { Brain, Heart, Shield, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export default function Landing() {
  const inIframe = isInIframe();

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleDemo = async () => {
    try {
      await fetch("/api/demo/seed", { method: "POST" });
    } catch (e) {}
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen" style={{ background: "#0F0F14" }}>
      {inIframe && (
        <div
          className="fixed top-0 inset-x-0 z-[100] px-4 py-2 flex items-center gap-2 text-sm font-medium"
          style={{ background: "#F59E0B", color: "#000" }}
          data-testid="banner-iframe-warning"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            <strong>Dev note:</strong> Login won't work in the Replit preview pane. Open the app directly:{" "}
            <a
              href={window.location.origin}
              target="_blank"
              rel="noreferrer"
              className="underline font-bold"
              data-testid="link-open-direct"
            >
              {window.location.origin}
            </a>
          </span>
        </div>
      )}

      {/* Hero Section */}
      <section
        className="relative flex flex-col items-center justify-center text-center px-6"
        style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 60%, #0F0F14 100%)",
          paddingTop: "80px",
          paddingBottom: "100px",
          minHeight: "520px",
        }}
        data-testid="section-hero"
      >
        {/* Nav */}
        <div className={`absolute top-0 left-0 right-0 flex items-center justify-between px-6 h-16${inIframe ? " mt-9" : ""}`}>
          <div className="flex items-center gap-2">
            <img src="/brand/logo.png" alt="VibeFlow" className="w-9 h-9 rounded-xl object-cover" data-testid="img-logo" />
            <span className="font-bold text-xl text-white">VibeFlow</span>
          </div>
          <button
            className="font-medium text-white px-4 py-2 transition-colors hover:bg-white/10"
            style={{ borderRadius: "10px" }}
            onClick={handleLogin}
            data-testid="button-login"
          >
            Log In
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-lg w-full"
        >
          <h1
            className="text-white font-bold mb-4"
            style={{ fontSize: "40px", lineHeight: 1.1, letterSpacing: "-0.5px" }}
            data-testid="text-hero-headline"
          >
            Find Your Perfect Vibe
          </h1>
          <p
            className="mb-10"
            style={{ fontSize: "18px", lineHeight: 1.55, color: "rgba(255,255,255,0.85)" }}
            data-testid="text-hero-sub"
          >
            AI-powered matching. Real connections.
          </p>

          <button
            onClick={handleLogin}
            className="w-full font-semibold btn-press text-white"
            style={{
              background: "rgba(255,255,255,0.18)",
              backdropFilter: "blur(12px)",
              border: "1.5px solid rgba(255,255,255,0.3)",
              height: "52px",
              borderRadius: "14px",
              fontSize: "17px",
              maxWidth: "340px",
              display: "block",
              margin: "0 auto",
            }}
            data-testid="button-start-matching"
          >
            Start Matching
          </button>

          <button
            onClick={handleDemo}
            className="mt-4 text-sm underline underline-offset-4 transition-colors"
            style={{ color: "rgba(255,255,255,0.65)" }}
            data-testid="button-demo"
          >
            View Demo
          </button>
        </motion.div>
      </section>

      {/* Feature Cards — dark */}
      <section className="py-16 px-6 max-w-4xl mx-auto" data-testid="section-features">
        <div className="grid md:grid-cols-3 gap-5">
          <FeatureCard
            icon={Brain}
            iconColor="#A78BFA"
            iconBg="rgba(124,58,237,0.18)"
            title="AI Twin Coach"
            description="Get personalized dating advice powered by your AI personality profile."
          />
          <FeatureCard
            icon={Heart}
            iconColor="#F472B6"
            iconBg="rgba(236,72,153,0.18)"
            title="Smart Matching"
            description="Find compatible partners based on deep personality insights, not just photos."
          />
          <FeatureCard
            icon={Shield}
            iconColor="#60A5FA"
            iconBg="rgba(59,130,246,0.18)"
            title="Your Privacy"
            description="End-to-end encrypted chats. Your data stays yours, always."
          />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 px-6 text-center" data-testid="section-cta-bottom">
        <h2
          className="font-bold mb-3 text-white"
          style={{ fontSize: "24px", letterSpacing: "-0.5px" }}
        >
          Ready to meet someone special?
        </h2>
        <p className="mb-8 text-base" style={{ color: "#9090A8" }}>
          Join thousands of people finding meaningful connections every day.
        </p>
        <button
          onClick={handleLogin}
          className="w-full max-w-sm font-semibold btn-press text-white"
          style={{
            background: "linear-gradient(135deg, #7C3AED, #EC4899)",
            height: "52px",
            borderRadius: "14px",
            fontSize: "16px",
            border: "none",
            boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
            display: "block",
            margin: "0 auto",
          }}
          data-testid="button-create-profile"
        >
          Create Your Profile
        </button>
      </section>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  description,
}: {
  icon: any;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
}) {
  return (
    <div
      className="p-5"
      style={{
        background: "#1A1A24",
        borderRadius: "20px",
        border: "1px solid #2E2E42",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
      data-testid={`card-feature-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ background: iconBg }}
      >
        <Icon className="w-6 h-6" style={{ color: iconColor }} />
      </div>
      <h3 className="font-bold mb-1 text-white" style={{ fontSize: "16px" }}>{title}</h3>
      <p className="leading-relaxed" style={{ fontSize: "14px", color: "#9090A8" }}>{description}</p>
    </div>
  );
}
