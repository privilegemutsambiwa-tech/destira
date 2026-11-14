import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { AuthShell, AUTH_INPUT as INPUT, AUTH_LABEL as LABEL, AUTH_PRIMARY, AUTH_SECONDARY, EMAIL_RE, maskEmail, passwordWords } from "@/components/auth-shell";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/hooks/use-auth";
import { GoogleSignInCancelled, googleSignInProblem, startGoogleSignIn } from "@/lib/google-signin";
import { ageFromDob, MIN_AGE } from "@shared/essentials";
import { consumePendingInvite, resolvePendingInviteRoute } from "@/lib/pending-invite";


// Signup collects the account + the basics only. The soul-mapping questions —
// DB-driven, skippable, resumable — happen at /onboarding straight after.

const STORE_KEY = "vf_signup_progress";

type Progress = {
  step: number;
  /** Inside step 1, one field per screen (brief 7.2): email, then password. */
  sub?: "email" | "password";
  email: string;
  name: string;
  dob: string; // yyyy-mm-dd
  city: string;
};

const BLANK: Progress = { step: 1, sub: "email", email: "", name: "", dob: "", city: "" };

function loadProgress(): Progress {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return BLANK;
    return { ...BLANK, ...JSON.parse(raw) };
  } catch {
    return BLANK;
  }
}

export default function Signup() {
  const { user, isLoading, signup, isSigningUp } = useAuth();
  const [, setLocation] = useLocation();

  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [password, setPassword] = useState(""); // never persisted
  const [company, setCompany] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [exists, setExists] = useState(false);

  const { step, email, name, dob, city } = progress;
  const sub = progress.sub ?? "email";
  const emailProblem = emailTouched && email.trim() && !EMAIL_RE.test(email.trim()) ? "That email looks incomplete." : null;
  const patch = (p: Partial<Progress>) => setProgress((cur) => ({ ...cur, ...p }));

  const [cityChoice, setCityChoice] = useState(() =>
    city === "Harare" || city === "Bulawayo" ? city : city ? "other" : "",
  );

  // Prefill email from ?email= on first mount (only if we don't already have one).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("email");
    if (q && !progress.email) patch({ email: q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist progress (minus password) on every change.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(progress));
    } catch {
      /* private mode — fine, just no resume */
    }
  }, [progress]);

  // The account is created for good in step 1 — there's no "undo" to go
  // back to. Without `step` in the deps, this only fired once on mount and
  // never again, so clicking Back on step 2 (which just sets step:1) would
  // leave the stale create-account form showing instead of bouncing forward.
  useEffect(() => {
    if (!isLoading && user && step === 1) patch({ step: 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, step]);

  const strength = passwordWords(password);

  const done = () => {
    try {
      sessionStorage.removeItem(STORE_KEY);
    } catch {
      /* noop */
    }
    const pendingInvite = consumePendingInvite();
    setLocation(pendingInvite ? resolvePendingInviteRoute(pendingInvite) : "/");
  };

  const handleGoogleSignup = async () => {
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

  const patchProfile = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExists(false);
    if (company) return;
    if (!EMAIL_RE.test(email.trim())) {
      setEmailTouched(true);
      setError(email.trim() ? null : "Enter your email.");
      return;
    }
    patch({ sub: "password" });
  };

  const submitStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (company) return;
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    try {
      await signup({ email: email.trim(), password });
      patch({ step: 2 });
    } catch (err) {
      const msg = err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "";
      if (msg.includes("exists")) {
        setExists(true);
        setError("There's already an account with this email.");
      } else {
        setError("Couldn't create your account. Try again.");
      }
    }
  };

  const submitStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Add your first name.");
    const age = ageFromDob(dob);
    if (age == null) return setError("Enter your date of birth.");
    if (age < MIN_AGE) return setError("You need to be 18 or older to use Destira.");
    if (!city.trim()) return setError("Add your city.");
    setBusy(true);
    try {
      // The server re-checks 18+ from dateOfBirth and derives `age`; if it's
      // under 18 it 422s and no profile is written.
      await patchProfile({ displayName: name.trim(), dateOfBirth: dob, location: city.trim() });
      done(); // -> "/" -> AuthenticatedHome sends them into /essentials
    } catch (err) {
      const msg = err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "";
      setError(msg.includes("18") ? "You need to be 18 or older to use Destira." : "Could not save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const screen = step === 1 ? (sub === "email" ? 1 : 2) : 3;
  const heading = step === 1 ? (sub === "email" ? "Create your account" : "Choose a password") : "The basics";
  const subtitle =
    step === 1
      ? sub === "email"
        ? "Free to join. It takes about two minutes."
        : (
          <>
            For <span className="text-vf-text">{maskEmail(email)}</span>.{" "}
            <button type="button" onClick={() => { setError(null); setExists(false); patch({ sub: "email" }); }} className="underline underline-offset-4 hover:text-vf-text" data-testid="button-signup-change-email">
              Change
            </button>
          </>
        )
      : "Only your first name and age are shown to people.";

  const honeypot = (
    <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
      <label>
        Company
        <input type="text" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
      </label>
    </div>
  );

  return (
    <AuthShell
      title={heading}
      titleTestId="text-signup-title"
      subtitle={subtitle}
      progress={screen / 3}
      footer={
        step === 1 ? (
          <>
            Already here?{" "}
            <button onClick={() => setLocation("/login")} className="text-vf-text underline underline-offset-4 hover:text-vf-muted transition-colors min-h-[44px]" data-testid="link-go-login">
              Log in
            </button>
          </>
        ) : undefined
      }
    >
      <p className="sr-only" aria-live="polite">Step {screen} of 3</p>

      {step === 1 && sub === "email" && (
        <>
          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={googleLoading}
            className={AUTH_SECONDARY}
            data-testid="button-google-signup"
          >
            {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FcGoogle className="w-4 h-4" />}
            {googleLoading ? "Opening Google…" : "Continue with Google"}
          </button>

          <div className="my-6 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-vf-line" />
            <span className="vf-label text-vf-faint">or with email</span>
            <div className="h-px flex-1 bg-vf-line" />
          </div>

          <form onSubmit={submitEmail} className="flex flex-col gap-4" noValidate>
            {honeypot}
            <div>
              <label htmlFor="su-email" className={LABEL}>Email</label>
              <input
                id="su-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => patch({ email: e.target.value })}
                onBlur={() => setEmailTouched(true)}
                aria-invalid={!!emailProblem}
                placeholder="you@email.com"
                className={INPUT}
                data-testid="input-signup-email"
              />
              {emailProblem && <p className="mt-1.5 text-[13px] text-vf-ember">{emailProblem}</p>}
            </div>
            {error && <p className="text-[13px] text-vf-ember" role="alert" data-testid="text-signup-error">{error}</p>}
            <button type="submit" className={AUTH_PRIMARY} data-testid="button-signup-next">
              Continue
            </button>
          </form>
        </>
      )}

      {step === 1 && sub === "password" && (
        <form onSubmit={submitStep1} className="flex flex-col gap-4" noValidate>
          {honeypot}
          {/* Lets password managers save the pair. */}
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <div>
            <label htmlFor="su-password" className={LABEL}>Password</label>
            <PasswordInput
              id="su-password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={INPUT}
              data-testid="input-signup-password"
            />
            <p className={`mt-1.5 text-[13px] ${strength.ok ? "text-vf-success" : "text-vf-faint"}`} aria-live="polite" data-testid="text-password-strength">
              {strength.label}
            </p>
          </div>

          {error && (
            <p className="text-[13px] text-vf-ember" role="alert" data-testid="text-signup-error">
              {error}{" "}
              {exists && (
                <button type="button" onClick={() => setLocation("/login")} className="underline underline-offset-4 text-vf-text" data-testid="link-signup-exists-login">
                  Log in instead
                </button>
              )}
            </p>
          )}

          <button type="submit" disabled={isSigningUp} className={AUTH_PRIMARY} data-testid="button-signup-create">
            {isSigningUp && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSigningUp ? "Creating your account…" : "Create account"}
          </button>
          <p className="text-[12px] text-vf-faint leading-[1.5]">
            How we look after your details is in our{" "}
            <a href="/privacy" className="underline underline-offset-2">privacy policy</a>.
          </p>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitStep2} className="flex flex-col gap-4">
          <div>
            <label htmlFor="su-name" className={LABEL}>First name</label>
            <input id="su-name" autoComplete="given-name" value={name} onChange={(e) => patch({ name: e.target.value })} className={INPUT} data-testid="input-signup-name" />
          </div>
          <div>
            <label htmlFor="su-dob" className={LABEL}>Date of birth</label>
            <input
              id="su-dob"
              type="date"
              value={dob}
              max={new Date(Date.now() - MIN_AGE * 365.25 * 864e5).toISOString().slice(0, 10)}
              onChange={(e) => patch({ dob: e.target.value })}
              className={INPUT}
              data-testid="input-signup-dob"
            />
            <p className="mt-1.5 text-[12px] text-vf-faint">You must be 18 or older. Only your age is shown.</p>
          </div>
          <div>
            <label htmlFor="su-city" className={LABEL}>City</label>
            <select
              id="su-city"
              value={cityChoice}
              onChange={(e) => {
                const v = e.target.value;
                setCityChoice(v);
                patch({ city: v === "other" ? "" : v });
              }}
              className={INPUT}
              data-testid="select-signup-city"
            >
              <option value="" disabled>Pick one</option>
              <option value="Harare">Harare</option>
              <option value="Bulawayo">Bulawayo</option>
              <option value="other">Somewhere else</option>
            </select>
          </div>

          {cityChoice === "other" && (
            <div>
              <input
                autoComplete="address-level2"
                value={city}
                onChange={(e) => patch({ city: e.target.value })}
                placeholder="Your city"
                className={INPUT}
                data-testid="input-signup-city-other"
              />
              {city.trim() && (
                <p className="mt-2 text-[13px] text-vf-muted leading-[1.5]" data-testid="text-city-waitlist">
                  We'll open your city when there are enough people there. You'll be first to know.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-[13px] text-vf-ember" role="alert" data-testid="text-signup-error">{error}</p>}

          <button type="submit" disabled={busy} className={AUTH_PRIMARY} data-testid="button-signup-next">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Continue
          </button>
        </form>
      )}
    </AuthShell>
  );
}
