import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { AuthShell, AUTH_INPUT as INPUT, AUTH_LABEL as LABEL, AUTH_PRIMARY, AUTH_SECONDARY, EMAIL_RE } from "@/components/auth-shell";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/hooks/use-auth";
import { GoogleSignInCancelled, googleSignInProblem, passwordSignInProblem, startGoogleSignIn } from "@/lib/google-signin";
import { consumePendingInvite, resolvePendingInviteRoute } from "@/lib/pending-invite";


export default function Login() {
  const { user, isLoading, login, isLoggingIn } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Validate after the first blur, never on every keystroke (brief 7.2).
  const [emailTouched, setEmailTouched] = useState(false);
  const emailProblem = emailTouched && email.trim() && !EMAIL_RE.test(email.trim()) ? "That email looks incomplete." : null;

  const goHome = () => {
    const pendingInvite = consumePendingInvite();
    setLocation(pendingInvite ? resolvePendingInviteRoute(pendingInvite) : "/");
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
    } catch (e) {
      setError(passwordSignInProblem(e));
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      // App: Android's account sheet signs in right here. Website: the page
      // goes to Google and comes back through /auth/callback.
      const user = await startGoogleSignIn();
      if (user) {
        const pendingInvite = consumePendingInvite();
        setLocation(pendingInvite ? resolvePendingInviteRoute(pendingInvite) : "/");
      }
    } catch (e) {
      if (!(e instanceof GoogleSignInCancelled)) setError(googleSignInProblem(e));
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      titleTestId="text-login-title"
      footer={
        <>
          New here?{" "}
          <button
            onClick={() => setLocation("/signup")}
            className="text-vf-text underline underline-offset-4 hover:text-vf-muted transition-colors min-h-[44px]"
            data-testid="link-go-signup"
          >
            Create your account
          </button>
        </>
      }
    >
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={googleLoading}
        className={AUTH_SECONDARY}
        data-testid="button-google-login"
      >
        {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FcGoogle className="w-4 h-4" />}
        {googleLoading ? "Opening Google…" : "Continue with Google"}
      </button>

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-vf-line" />
        <span className="vf-label text-vf-faint">or with email</span>
        <div className="h-px flex-1 bg-vf-line" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={!!emailProblem}
            placeholder="you@email.com"
            className={INPUT}
            data-testid="input-login-email"
          />
          {emailProblem && <p className="mt-1.5 text-[13px] text-vf-ember">{emailProblem}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className={`${LABEL} mb-0`}>Password</label>
            <button
              type="button"
              onClick={() => setLocation(`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`)}
              className="text-[13px] text-vf-muted hover:text-vf-text transition-colors"
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
            placeholder="Your password"
            className={INPUT}
            data-testid="input-login-password"
          />
        </div>

        {error && (
          <p className="text-[13px] text-vf-ember" role="alert" data-testid="text-login-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={isLoggingIn} className={AUTH_PRIMARY} data-testid="button-submit-login">
          {isLoggingIn && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLoggingIn ? "Logging in…" : "Log in"}
        </button>
      </form>
    </AuthShell>
  );
}
