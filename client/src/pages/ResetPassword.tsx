import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Loader2 } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthShell, AUTH_INPUT as INPUT, AUTH_LABEL as LABEL, AUTH_PRIMARY, passwordWords } from "@/components/auth-shell";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passwordWords(password);
  const mismatch = confirmTouched && confirm && confirm !== password ? "These don't match yet." : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("This link is missing a piece. Open the link from your email again.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setConfirmTouched(true);
      setError("The two passwords don't match.");
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
        setError(body?.message || "That link has expired or was already used. Ask for a new one.");
        return;
      }
      setDone(true);
    } catch {
      setError("Couldn't reach Destira. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password updated" titleTestId="text-reset-done-title" subtitle="Log in with your new password.">
        <button onClick={() => setLocation("/login")} className={AUTH_PRIMARY} data-testid="button-go-login">
          Log in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      titleTestId="text-reset-title"
      subtitle={token ? "Choose something you haven't used here before." : undefined}
      footer={
        !token ? (
          <button onClick={() => setLocation("/forgot-password")} className="text-vf-text underline underline-offset-4 min-h-[44px]" data-testid="link-request-new">
            Ask for a new link
          </button>
        ) : undefined
      }
    >
      {!token && (
        <p className="text-[14px] text-vf-ember mb-5" role="alert">
          This link is missing a piece. Open the link from your email again, or ask for a new one.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="reset-password" className={LABEL}>New password</label>
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className={INPUT}
            data-testid="input-reset-password"
          />
          <p className={`mt-1.5 text-[13px] ${strength.ok ? "text-vf-success" : "text-vf-faint"}`} aria-live="polite" data-testid="text-password-strength">
            {strength.label}
          </p>
        </div>
        <div>
          <label htmlFor="reset-password-confirm" className={LABEL}>Type it again</label>
          <PasswordInput
            id="reset-password-confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => setConfirmTouched(true)}
            aria-invalid={!!mismatch}
            placeholder="Same again"
            className={INPUT}
            data-testid="input-reset-password-confirm"
          />
          {mismatch && <p className="mt-1.5 text-[13px] text-vf-ember">{mismatch}</p>}
        </div>

        {error && (
          <p className="text-[13px] text-vf-ember" role="alert" data-testid="text-reset-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting || !token} className={AUTH_PRIMARY} data-testid="button-submit-reset">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
