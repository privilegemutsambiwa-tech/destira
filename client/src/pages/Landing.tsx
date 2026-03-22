import { Brain, Heart, Shield, AlertTriangle, MapPin, Star } from "lucide-react";
import { motion } from "framer-motion";
import { useRef, useEffect, useState } from "react";

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function useCountUp(target: number, duration: number = 1800) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) setStarted(true);
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(interval);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [started, target, duration]);

  return { count, ref };
}

function StatItem({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { count, ref } = useCountUp(value);
  return (
    <div ref={ref} className="text-center" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p
        className="font-black"
        style={{
          fontSize: "32px",
          lineHeight: 1,
          background: "linear-gradient(135deg, #7C3AED, #EC4899)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {count.toLocaleString()}{suffix}
      </p>
      <p className="mt-1" style={{ fontSize: "13px", color: "#9090A8" }}>{label}</p>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <div
      className="flex items-start gap-4 p-6"
      style={{
        background: "#1A1A24",
        borderRadius: "20px",
        border: "1px solid #2E2E42",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
      data-testid={`card-feature-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: "52px",
          height: "52px",
          borderRadius: "14px",
          background: "linear-gradient(135deg, #7C3AED, #EC4899)",
        }}
      >
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <h3 className="font-bold text-white mb-1" style={{ fontSize: "16px" }}>{title}</h3>
        <p className="leading-relaxed" style={{ fontSize: "14px", color: "#9090A8" }}>{description}</p>
      </div>
    </div>
  );
}

function TestimonialCard({
  initial,
  name,
  location,
  quote,
}: {
  initial: string;
  name: string;
  location: string;
  quote: string;
}) {
  return (
    <div
      className="p-5 shrink-0"
      style={{
        background: "#1A1A24",
        border: "1px solid #2E2E42",
        borderRadius: "20px",
        minWidth: "280px",
        maxWidth: "320px",
      }}
      data-testid={`card-testimonial-${initial.toLowerCase()}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", fontSize: "16px" }}
        >
          {initial}
        </div>
        <div>
          <p className="font-semibold text-white text-sm">{name}</p>
          <p className="text-xs" style={{ color: "#9090A8" }}>{location}</p>
        </div>
      </div>
      <div className="flex gap-0.5 mb-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
        ))}
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "#9090A8" }}>{quote}</p>
    </div>
  );
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

      <section
        className="relative flex flex-col items-center text-center px-6 overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 60%, #0F0F14 100%)",
          paddingTop: "80px",
          paddingBottom: "140px",
          minHeight: "580px",
        }}
        data-testid="section-hero"
      >
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
            className="mb-5"
            style={{ fontSize: "18px", lineHeight: 1.55, color: "rgba(255,255,255,0.85)" }}
            data-testid="text-hero-sub"
          >
            AI-powered matching. Real connections.
          </p>

          <div className="flex items-center justify-center gap-3 mb-8 flex-wrap" data-testid="trust-badges">
            {["🔒 Private", "✦ AI-Powered", "❤️ Real Matches"].map((badge) => (
              <span
                key={badge}
                className="text-xs font-medium"
                style={{
                  color: "rgba(255,255,255,0.85)",
                  background: "rgba(255,255,255,0.12)",
                  borderRadius: "100px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  padding: "4px 12px",
                }}
              >
                {badge}
              </span>
            ))}
          </div>

          <button
            onClick={handleLogin}
            className="w-full font-semibold btn-press text-white"
            style={{
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              height: "52px",
              borderRadius: "14px",
              fontSize: "17px",
              border: "none",
              boxShadow: "0 4px 20px rgba(124,58,237,0.45)",
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

        <div
          className="absolute left-1/2"
          style={{ bottom: 0, transform: "translateX(-50%) translateY(50%)" }}
          data-testid="card-profile-mockup"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
          >
            <div className="animate-float">
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{
                background: "rgba(26,26,36,0.9)",
                borderRadius: "20px",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                minWidth: "240px",
                whiteSpace: "nowrap",
              }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
              >
                A
              </div>
              <div className="text-left">
                <p className="font-bold text-white text-sm">Amara, 24</p>
                <div className="flex items-center gap-1" style={{ color: "#9090A8" }}>
                  <MapPin className="w-3 h-3" />
                  <span className="text-xs">New York</span>
                </div>
                <p
                  className="text-xs font-semibold mt-0.5"
                  style={{
                    background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  ✦ 94% Match
                </p>
              </div>
            </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section
        className="px-6 pb-10"
        style={{ background: "#1A1A24", borderBottom: "1px solid #2E2E42", paddingTop: "72px" }}
        data-testid="section-stats"
      >
        <div className="max-w-2xl mx-auto grid grid-cols-3 gap-6">
          <StatItem value={50} suffix="K+" label="Active Users" />
          <StatItem value={89} suffix="%" label="Match Satisfaction" />
          <StatItem value={2} suffix="M+" label="Conversations Started" />
        </div>
      </section>

      <section className="py-16 px-6 max-w-2xl mx-auto" data-testid="section-features">
        <div className="space-y-4">
          <FeatureCard
            icon={Brain}
            title="Meet Your AI Twin"
            description="Your personal AI learns your personality, values, and communication style. It represents you before you even say hello."
          />
          <FeatureCard
            icon={Heart}
            title="Deep Compatibility Matching"
            description="We match on personality, not just photos. Our algorithm compares values, communication styles, and life goals."
          />
          <FeatureCard
            icon={Shield}
            title="Privacy First, Always"
            description="Your personal data is never shared. Chat with AI Twins before revealing yourself. You are always in control."
          />
        </div>
      </section>

      <section className="py-16 px-6 max-w-2xl mx-auto" data-testid="section-how-it-works">
        <h2
          className="font-bold text-white text-center mb-10"
          style={{ fontSize: "24px", letterSpacing: "-0.5px" }}
        >
          How VibeFlow Works
        </h2>
        <div>
          {[
            {
              n: "1",
              title: "Create Your Profile",
              desc: "Answer a few questions. Your AI Twin is born.",
            },
            {
              n: "2",
              title: "Discover Matches",
              desc: "Browse personality-matched profiles. Interview their AI Twin.",
            },
            {
              n: "3",
              title: "Connect for Real",
              desc: "When you both vibe — unlock real conversation.",
            },
          ].map((step, idx) => (
            <div key={step.n} className="flex gap-4" data-testid={`step-${step.n}`}>
              <div className="flex flex-col items-center">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0"
                  style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", fontSize: "15px" }}
                >
                  {step.n}
                </div>
                {idx < 2 && (
                  <div
                    style={{
                      width: 0,
                      flexGrow: 1,
                      borderLeft: "2px dashed #2E2E42",
                      minHeight: "40px",
                      margin: "4px 0",
                    }}
                  />
                )}
              </div>
              <div className="pb-10">
                <p className="font-bold text-white" style={{ fontSize: "16px" }}>{step.title}</p>
                <p className="mt-1 text-sm" style={{ color: "#9090A8" }}>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 px-6 max-w-2xl mx-auto" data-testid="section-testimonials">
        <h2
          className="font-bold text-white text-center mb-8"
          style={{ fontSize: "22px", letterSpacing: "-0.5px" }}
        >
          What Our Users Say
        </h2>
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
          <TestimonialCard
            initial="K"
            name="Kemi, 26"
            location="Lagos"
            quote="I was skeptical about AI dating but VibeFlow is different. I talked to my match's Twin for a week before we spoke. We're now dating for 3 months."
          />
          <TestimonialCard
            initial="J"
            name="James, 31"
            location="London"
            quote="The AI Twin feature is genius. No more awkward first messages. By the time we chatted for real, it felt like we already knew each other."
          />
        </div>
      </section>

      <section
        className="py-16 px-6 text-center"
        style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
        data-testid="section-cta-bottom"
      >
        <h2
          className="font-bold text-white mb-3"
          style={{ fontSize: "26px", letterSpacing: "-0.5px" }}
        >
          Ready to Meet Someone Real?
        </h2>
        <p className="mb-8" style={{ fontSize: "15px", color: "rgba(255,255,255,0.8)" }}>
          Join thousands building genuine connections
        </p>
        <button
          onClick={handleLogin}
          className="font-semibold btn-press inline-flex items-center justify-center px-8"
          style={{
            background: "#FFFFFF",
            height: "52px",
            borderRadius: "14px",
            fontSize: "16px",
            border: "none",
          }}
          data-testid="button-create-profile"
        >
          <span
            style={{
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontWeight: 600,
            }}
          >
            Create Your Profile
          </span>
        </button>
        <p className="mt-4 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          Free to join · No credit card required
        </p>
      </section>
    </div>
  );
}
