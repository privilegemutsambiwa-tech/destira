import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { DestiraLockup } from "@/components/brand/logo";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { ageFromDob, MIN_AGE } from "@shared/essentials";
import { consumePendingInvite } from "@/lib/pending-invite";

const INPUT =
  "w-full rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 h-11 text-sm text-vf-text placeholder:text-vf-faint focus:outline-none focus:ring-2 focus:ring-vf-ember/60 focus:ring-offset-2 focus:ring-offset-vf-ink transition-shadow";
const LABEL = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-1.5 block";

// Signup collects the account + the basics only. The soul-mapping questions —
// DB-driven, skippable, resumable — happen at /onboarding straight after.

const STORE_KEY = "vf_signup_progress";

type Progress = {
  step: number;
  email: string;
  name: string;
  dob: string; // yyyy-mm-dd
  city: string;
};

const BLANK: Progress = { step: 1, email: "", name: "", dob: "", city: "" };

function loadProgress(): Progress {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return BLANK;
    return { ...BLANK, ...JSON.parse(raw) };
  } catch {
    return BLANK;
  }
}

function passwordScore(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) s++;
  return Math.min(s, 4);
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

  const { step, email, name, dob, city } = progress;
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

  // If the account already exists (came back after step 1), don't sit on step 1.
  useEffect(() => {
    if (!isLoading && user && step === 1) patch({ step: 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading]);

  const pwScore = useMemo(() => passwordScore(password), [password]);

  const done = () => {
    try {
      sessionStorage.removeItem(STORE_KEY);
    } catch {
      /* noop */
    }
    const pendingInvite = consumePendingInvite();
    setLocation(pendingInvite ? `/join/${pendingInvite}` : "/");
  };

  const handleGoogleSignup = async () => {
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

  const patchProfile = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
  };

  const submitStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (company) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    try {
      await signup({ email: email.trim(), password });
      patch({ step: 2 });
    } catch (err) {
      const msg = err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "";
      setError(msg.includes("exists") ? "An account with this email already exists." : "Could not create your account.");
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

  const heading = step === 1 ? "Create your account" : "The basics";

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-vf-ink text-vf-text py-16">
      <div className="w-full max-w-[460px]">
        <div className="flex justify-center mb-8 text-vf-text">
          <DestiraLockup orientation="horizontal" size={30} />
        </div>

        <div className="rounded-[24px] border border-vf-line bg-vf-surface p-7 sm:p-8">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
            Step {step} of 2
          </div>
          <h1
            className="font-serif font-normal text-vf-text mt-2"
            style={{ fontSize: "28px", letterSpacing: "-0.01em" }}
            data-testid="text-signup-title"
          >
            {heading}
          </h1>

          {step === 1 && (
            <form onSubmit={submitStep1} className="mt-7 flex flex-col gap-4">
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
                <label htmlFor="su-email" className={LABEL}>Email</label>
                <input
                  id="su-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => patch({ email: e.target.value })}
                  placeholder="you@email.com"
                  className={INPUT}
                  data-testid="input-signup-email"
                />
              </div>

              <div>
                <label htmlFor="su-password" className={LABEL}>Password</label>
                <PasswordInput
                  id="su-password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className={INPUT}
                  data-testid="input-signup-password"
                />
                <div className="mt-2 flex gap-1.5" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < pwScore ? "bg-vf-ember" : "bg-vf-text/[0.12]"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {error && <p className="text-[13px] text-vf-ember" role="alert" data-testid="text-signup-error">{error}</p>}

              <button
                type="submit"
                disabled={isSigningUp}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-vf-ink font-bold h-12 text-[15px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-50"
                data-testid="button-signup-next"
              >
                {isSigningUp && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSigningUp ? "Creating account…" : "Continue"}
              </button>

              <div className="flex items-center gap-3" aria-hidden="true">
                <div className="h-px flex-1 bg-vf-line" />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">or</span>
                <div className="h-px flex-1 bg-vf-line" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignup}
                disabled={googleLoading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-vf-line text-vf-text hover:border-vf-text/25 h-11 text-sm font-medium transition-colors disabled:opacity-50"
                data-testid="button-google-signup"
              >
                {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FcGoogle className="w-4 h-4" />}
                {googleLoading ? "Redirecting…" : "Continue with Google"}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={submitStep2} className="mt-7 flex flex-col gap-4">
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
              <div className="flex gap-3">
                <div className="flex-1">
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

              <button
                type="submit"
                disabled={busy}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-vf-ink font-bold h-12 text-[15px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-50"
                data-testid="button-signup-next"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Continue
              </button>
            </form>
          )}

          <div className="my-6 h-px bg-vf-line" />
          <p className="text-center text-sm text-vf-muted">
            {step === 1 ? (
              <>
                Already here?{" "}
                <button onClick={() => setLocation("/login")} className="text-vf-text underline underline-offset-4 hover:text-vf-muted transition-colors" data-testid="link-go-login">
                  Log in
                </button>
              </>
            ) : (
              <button onClick={() => patch({ step: step - 1 })} className="text-vf-muted hover:text-vf-text transition-colors" data-testid="button-signup-back">
                ← Back
              </button>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
