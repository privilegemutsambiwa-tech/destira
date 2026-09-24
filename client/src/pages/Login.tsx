import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { DestiraLockup } from "@/components/brand/logo";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { consumePendingInvite } from "@/lib/pending-invite";

const INPUT =
  "w-full rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 h-11 text-sm text-vf-text placeholder:text-vf-faint focus:outline-none focus:ring-2 focus:ring-vf-ember/60 focus:ring-offset-2 focus:ring-offset-vf-ink transition-shadow";
const LABEL = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-1.5 block";

export default function Login() {
  const { user, isLoading, login, isLoggingIn } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const goHome = () => {
    const pendingInvite = consumePendingInvite();
    setLocation(pendingInvite ? `/join/${pendingInvite}` : "/");
  };

  useEffect(() => {
    if (!isLoading && user) goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (company) return; // bot
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    try {
      await login({ email: email.trim(), password });
      goHome();
    } catch {
      setError("Email or password is wrong.");
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setError("Couldn't start Google sign-in. Try again.");
      setGoogleLoading(false);
    }
  };

  const handleDemo = async () => {
    setDemoLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/login", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      window.location.href = "/";
    } catch {
      setError("Demo is unavailable right now.");
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-vf-ink text-vf-text">
      <div className="w-full max-w-[460px]">
        <div className="flex justify-center mb-8 text-vf-text">
          <DestiraLockup orientation="horizontal" size={30} />
        </div>

        <div className="rounded-[24px] border border-vf-line bg-vf-surface p-7 sm:p-8">
          <h1
            className="font-serif font-normal text-vf-text text-center"
            style={{ fontSize: "28px", letterSpacing: "-0.01em" }}
            data-testid="text-login-title"
          >
            Welcome back
          </h1>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            <div
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}
            >
              <label>
                Company
                <input type="text" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
              </label>
            </div>

            <div>
              <label htmlFor="login-email" className={LABEL}>Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className={INPUT}
                data-testid="input-login-email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className={`${LABEL} mb-0`}>Password</label>
                <button
                  type="button"
                  onClick={() => setLocation("/forgot-password")}
                  className="text-[12px] text-vf-muted hover:text-vf-text transition-colors"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </button>
              </div>
              <PasswordInput
                id="login-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={INPUT}
                data-testid="input-login-password"
              />
            </div>

            {error && (
              <p className="text-[13px] text-vf-ember" role="alert" data-testid="text-login-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-vf-ink font-bold h-12 text-[15px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-50"
              data-testid="button-submit-login"
            >
              {isLoggingIn && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoggingIn ? "Logging in…" : "Log in"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-vf-line" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">or</span>
            <div className="h-px flex-1 bg-vf-line" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-vf-line text-vf-text hover:border-vf-text/25 h-11 text-sm font-medium transition-colors disabled:opacity-50"
            data-testid="button-google-login"
          >
            {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FcGoogle className="w-4 h-4" />}
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>

          <button
            onClick={handleDemo}
            disabled={demoLoading}
            className="mt-3 w-full inline-flex items-center justify-center rounded-full border border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-text/25 h-11 text-sm transition-colors disabled:opacity-50"
            data-testid="button-demo-login"
          >
            {demoLoading ? "Starting demo…" : "Try a demo"}
          </button>

          <div className="my-6 h-px bg-vf-line" />

          <p className="text-center text-sm text-vf-muted">
            New here?{" "}
            <button
              onClick={() => setLocation("/signup")}
              className="text-vf-text underline underline-offset-4 hover:text-vf-muted transition-colors"
              data-testid="link-go-signup"
            >
              Create your account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
