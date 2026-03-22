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
    <div className="min-h-screen bg-[#F3F4F6]">
      {inIframe && (
        <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-black px-4 py-2 flex items-center gap-2 text-sm font-medium" data-testid="banner-iframe-warning">
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

      {/* Hero Section — pure gradient, no photos */}
      <section
        className="relative flex flex-col items-center justify-center text-center px-6"
        style={{
          background: "linear-gradient(135deg, #7C3AED, #EC4899, #F59E0B)",
          paddingTop: "80px",
          paddingBottom: "80px",
          minHeight: "480px",
        }}
        data-testid="section-hero"
      >
        {/* Nav inside hero */}
        <div className={`absolute top-0 left-0 right-0 flex items-center justify-between px-6 h-16${inIframe ? " mt-9" : ""}`}>
          <div className="flex items-center gap-2">
            <img src="/brand/logo.png" alt="VibeFlow" className="w-9 h-9 rounded-xl object-cover" data-testid="img-logo" />
            <span className="font-display font-bold text-xl text-white">VibeFlow</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="text-white hover:bg-white/20 font-medium"
              onClick={handleLogin}
              data-testid="button-login"
            >
              Log In
            </Button>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-lg w-full"
        >
          <h1
            className="text-white font-display font-bold mb-4"
            style={{ fontSize: "36px", lineHeight: 1.15 }}
            data-testid="text-hero-headline"
          >
            Find Your Perfect Vibe
          </h1>
          <p
            className="text-white/90 mb-10"
            style={{ fontSize: "18px", lineHeight: 1.5 }}
            data-testid="text-hero-sub"
          >
            AI-powered matching. Real connections.
          </p>

          <Button
            onClick={handleLogin}
            className="w-full font-semibold btn-press"
            style={{
              background: "#7C3AED",
              color: "#fff",
              height: "48px",
              borderRadius: "8px",
              fontSize: "16px",
              maxWidth: "340px",
            }}
            data-testid="button-start-matching"
          >
            Start Matching
          </Button>

          <button
            onClick={handleDemo}
            className="mt-4 text-white/80 text-sm underline underline-offset-4 hover:text-white transition-colors"
            data-testid="button-demo"
          >
            View Demo
          </button>
        </motion.div>
      </section>

      {/* Feature Cards */}
      <section className="py-12 px-6 max-w-4xl mx-auto" data-testid="section-features">
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={Brain}
            title="AI Twin Coach"
            description="Get personalized dating advice powered by your AI personality profile."
          />
          <FeatureCard
            icon={Heart}
            title="Smart Matching"
            description="Find compatible partners based on deep personality insights, not just photos."
          />
          <FeatureCard
            icon={Shield}
            title="Your Privacy"
            description="End-to-end encrypted chats. Your data stays yours, always."
          />
        </div>
      </section>

      {/* Bottom CTA */}
      <section
        className="py-12 px-6 text-center"
        data-testid="section-cta-bottom"
      >
        <h2
          className="font-display font-bold mb-3 text-[#1F2937]"
          style={{ fontSize: "22px" }}
        >
          Ready to meet someone special?
        </h2>
        <p className="text-[#6B7280] mb-8 text-base">
          Join thousands of people finding meaningful connections every day.
        </p>
        <Button
          onClick={handleLogin}
          className="w-full max-w-sm font-semibold btn-press"
          style={{
            background: "#7C3AED",
            color: "#fff",
            height: "48px",
            borderRadius: "8px",
            fontSize: "16px",
          }}
          data-testid="button-create-profile"
        >
          Create Your Profile
        </Button>
      </section>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div
      className="bg-white rounded-xl p-4 shadow-card"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
      data-testid={`card-feature-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ background: "#EDE9FE" }}>
        <Icon className="w-6 h-6" style={{ color: "#7C3AED" }} />
      </div>
      <h3 className="font-bold mb-1 text-[#1F2937]" style={{ fontSize: "16px" }}>{title}</h3>
      <p className="text-[#6B7280] leading-relaxed" style={{ fontSize: "14px" }}>{description}</p>
    </div>
  );
}
