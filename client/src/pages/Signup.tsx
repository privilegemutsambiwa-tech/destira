import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const BG = "#0F0F14";
const CARD = "#1A1A24";
const BORDER = "#2E2E42";
const MUTED = "#9090A8";
const GRAD = "linear-gradient(135deg, #7C3AED, #EC4899)";

export default function Signup() {
  const { user, isLoading, signup, isSigningUp } = useAuth();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) setLocation("/");
  }, [user, isLoading, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Enter your email and a password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await signup({ email, password, name: name.trim() || undefined });
      setLocation("/");
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Failed to create account");
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
          <h1 className="font-bold text-white text-center mb-1" style={{ fontSize: "22px" }} data-testid="text-signup-title">
            Create your profile
          </h1>
          <p className="text-center text-sm mb-6" style={{ color: MUTED }}>
            Free to join. No credit card required.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "12px" }}>
              <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>
                Name
              </label>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 text-sm text-white"
                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
                data-testid="input-signup-name"
              />
            </div>
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
                data-testid="input-signup-email"
              />
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>
                Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 text-sm text-white"
                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
                data-testid="input-signup-password"
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>
                Confirm Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm text-white"
                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
                data-testid="input-signup-confirm"
              />
            </div>

            {error && (
              <p className="text-sm mb-4" style={{ color: "#F87171" }} data-testid="text-signup-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSigningUp}
              className="w-full font-semibold text-white btn-press"
              style={{
                background: GRAD,
                height: "48px",
                borderRadius: "12px",
                fontSize: "15px",
                border: "none",
                opacity: isSigningUp ? 0.7 : 1,
              }}
              data-testid="button-submit-signup"
            >
              {isSigningUp ? "Creating account..." : "Create Account"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-6" style={{ color: MUTED }}>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-white underline underline-offset-4" data-testid="link-go-login">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
