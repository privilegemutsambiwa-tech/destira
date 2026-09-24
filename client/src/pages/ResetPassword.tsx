import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Loader2, CheckCircle } from "lucide-react";
import { DestiraLockup } from "@/components/brand/logo";
import { PasswordInput } from "@/components/ui/password-input";

const INPUT =
  "w-full rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 h-11 text-sm text-vf-text placeholder:text-vf-faint focus:outline-none focus:ring-2 focus:ring-vf-ember/60 focus:ring-offset-2 focus:ring-offset-vf-ink transition-shadow";
const LABEL = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-1.5 block";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("This reset link is missing its token — use the link from your email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || "That reset link is invalid or has expired.");
        return;
      }
      setDone(true);
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
          {done ? (
            <>
              <div className="flex justify-center mb-3 text-vf-mint">
                <CheckCircle className="w-10 h-10" />
              </div>
              <h1
                className="font-serif font-normal text-vf-text text-center"
                style={{ fontSize: "26px", letterSpacing: "-0.01em" }}
                data-testid="text-reset-done-title"
              >
                Password updated
              </h1>
              <p className="text-center text-sm text-vf-muted mt-3 leading-relaxed">
                Log in with your new password.
              </p>
              <button
                onClick={() => setLocation("/login")}
                className="mt-6 w-full inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold h-12 text-[15px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)]"
                data-testid="button-go-login"
              >
                Log in
              </button>
            </>
          ) : (
            <>
              <h1
                className="font-serif font-normal text-vf-text text-center"
                style={{ fontSize: "28px", letterSpacing: "-0.01em" }}
                data-testid="text-reset-title"
              >
                Set a new password
              </h1>

              {!token && (
                <p className="text-center text-[13px] text-vf-ember mt-3">
                  This link is missing its token — open the link from your email again.
                </p>
              )}

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                <div>
                  <label htmlFor="reset-password" className={LABEL}>New password</label>
                  <PasswordInput
                    id="reset-password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={INPUT}
                    data-testid="input-reset-password"
                  />
                </div>
                <div>
                  <label htmlFor="reset-password-confirm" className={LABEL}>Confirm password</label>
                  <PasswordInput
                    id="reset-password-confirm"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className={INPUT}
                    data-testid="input-reset-password-confirm"
                  />
                </div>

                {error && (
                  <p className="text-[13px] text-vf-ember" role="alert" data-testid="text-reset-error">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting || !token}
                  className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-vf-ink font-bold h-12 text-[15px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-50"
                  data-testid="button-submit-reset"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? "Updating…" : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
