import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { DestiraLockup } from "@/components/brand/logo";

const INPUT =
  "w-full rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 h-11 text-sm text-vf-text placeholder:text-vf-faint focus:outline-none focus:ring-2 focus:ring-vf-ember/60 focus:ring-offset-2 focus:ring-offset-vf-ink transition-shadow";
const LABEL = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-1.5 block";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // The endpoint always returns success shape regardless of outcome —
      // it never confirms or denies whether the email is registered.
      if (res.status === 400) {
        const body = await res.json().catch(() => null);
        setError(body?.message || "Enter a valid email address.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-vf-ink text-vf-text">
      <div className="w-full max-w-[460px]">
        <div className="flex justify-center mb-8 text-vf-text">
          <DestiraLockup orientation="horizontal" size={30} />
        </div>

        <div className="rounded-[24px] border border-vf-line bg-vf-surface p-7 sm:p-8">
          {sent ? (
            <>
              <h1
                className="font-serif font-normal text-vf-text text-center"
                style={{ fontSize: "26px", letterSpacing: "-0.01em" }}
                data-testid="text-reset-sent-title"
              >
                Check your email
              </h1>
              <p className="text-center text-sm text-vf-muted mt-3 leading-relaxed">
                If that email has an account, we've sent a link to reset your password. It works once and expires in
                an hour.
              </p>
              <button
                onClick={() => setLocation("/login")}
                className="mt-6 w-full inline-flex items-center justify-center rounded-full border border-vf-line text-vf-text hover:border-vf-text/25 h-11 text-sm font-medium transition-colors"
                data-testid="button-back-to-login"
              >
                Back to login
              </button>
            </>
          ) : (
            <>
              <h1
                className="font-serif font-normal text-vf-text text-center"
                style={{ fontSize: "28px", letterSpacing: "-0.01em" }}
                data-testid="text-forgot-title"
              >
                Reset your password
              </h1>
              <p className="text-center text-sm text-vf-muted mt-2 leading-relaxed">
                Enter the email on your account and we'll send you a link to set a new password.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                <div>
                  <label htmlFor="forgot-email" className={LABEL}>Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className={INPUT}
                    data-testid="input-forgot-email"
                  />
                </div>

                {error && (
                  <p className="text-[13px] text-vf-ember" role="alert" data-testid="text-forgot-error">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-vf-ink font-bold h-12 text-[15px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-50"
                  data-testid="button-submit-forgot"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? "Sending…" : "Send reset link"}
                </button>
              </form>

              <p className="text-center text-sm text-vf-muted mt-6">
                <button
                  onClick={() => setLocation("/login")}
                  className="text-vf-text underline underline-offset-4 hover:text-vf-muted transition-colors"
                  data-testid="link-back-to-login"
                >
                  Back to login
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
