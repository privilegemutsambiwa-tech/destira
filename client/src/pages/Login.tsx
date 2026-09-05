import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const BG = "#0F0F14";
const CARD = "#1A1A24";
const BORDER = "#2E2E42";
const MUTED = "#9090A8";
const GRAD = "linear-gradient(135deg, #7C3AED, #EC4899)";

export default function Login() {
  const { user, isLoading, login, isLoggingIn } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && user) setLocation("/");
  }, [user, isLoading, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    try {
      await login({ email, password });
      setLocation("/");
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Failed to log in");
    }
  };

  const handleDemo = async () => {
    setDemoLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/login", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Demo is unavailable right now.");
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo is unavailable right now.");
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: BG }}>
      <div className="w-full" style={{ maxWidth: "380px" }}>
        <div className="flex items-center gap-2 justify-center mb-8">
          <img src="/brand/logo.png" alt="VibeFlow" className="w-9 h-9 rounded-xl object-cover" />
          <span className="font-bold text-xl text-white">VibeFlow</span>
        </div>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "20px", padding: "28px" }}>
          <h1 className="font-bold text-white text-center mb-1" style={{ fontSize: "22px" }} data-testid="text-login-title">
            Welcome back
          </h1>
          <p className="text-center text-sm mb-6" style={{ color: MUTED }}>
            Log in to keep the conversation going.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "12px" }}>
              <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 text-sm text-white"
                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
                data-testid="input-login-email"
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm text-white"
                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
                data-testid="input-login-password"
              />
            </div>

            {error && (
              <p className="text-sm mb-4" style={{ color: "#F87171" }} data-testid="text-login-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full font-semibold text-white btn-press"
              style={{
                background: GRAD,
                height: "48px",
                borderRadius: "12px",
                fontSize: "15px",
                border: "none",
                opacity: isLoggingIn ? 0.7 : 1,
              }}
              data-testid="button-submit-login"
            >
              {isLoggingIn ? "Logging in..." : "Log In"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div style={{ flex: 1, height: 1, background: BORDER }} />
            <span className="text-xs" style={{ color: MUTED }}>or</span>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
          </div>

          <button
            onClick={handleDemo}
            disabled={demoLoading}
            className="w-full font-medium text-sm"
            style={{
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: "#FFFFFF",
              height: "44px",
              borderRadius: "12px",
              opacity: demoLoading ? 0.7 : 1,
            }}
            data-testid="button-demo-login"
          >
            {demoLoading ? "Starting demo..." : "View Demo"}
          </button>
        </div>

        <p className="text-center text-sm mt-6" style={{ color: MUTED }}>
          New to VibeFlow?{" "}
          <Link href="/signup" className="font-semibold text-white underline underline-offset-4" data-testid="link-go-signup">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
