import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { AuthShell, AUTH_INPUT as INPUT, AUTH_LABEL as LABEL, AUTH_PRIMARY, AUTH_SECONDARY, EMAIL_RE, maskEmail } from "@/components/auth-shell";

// Webmail inboxes we can open straight to. Anything else: no button, rather
// than one that opens a blank "new email" screen.
function inboxUrl(email: string): { url: string; name: string } | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return { url: "https://mail.google.com/mail/u/0/#inbox", name: "Gmail" };
  if (/^(outlook|hotmail|live|msn)\./.test(domain)) return { url: "https://outlook.live.com/mail/", name: "Outlook" };
  if (/^(yahoo|ymail)\./.test(domain)) return { url: "https://mail.yahoo.com/", name: "Yahoo Mail" };
  if (domain === "icloud.com" || domain === "me.com") return { url: "https://www.icloud.com/mail", name: "iCloud Mail" };
  return null;
}

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get("email") ?? "");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = email.trim();
  const valid = EMAIL_RE.test(trimmed);
  const blurProblem = touched && trimmed && !valid ? "That email looks incomplete." : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!valid) {
      setTouched(true);
      setError(trimmed ? null : "Enter your email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
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
      setError("Couldn't reach Destira. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const backToLogin = (
    <button
      onClick={() => setLocation("/login")}
      className="text-vf-text underline underline-offset-4 hover:text-vf-muted transition-colors min-h-[44px]"
      data-testid="link-back-to-login"
    >
      Back to login
    </button>
  );

  if (sent) {
    const inbox = inboxUrl(trimmed);
    return (
      <AuthShell
        title="Check your email"
        titleTestId="text-reset-sent-title"
        subtitle={
          <>
            If <span className="text-vf-text">{maskEmail(trimmed)}</span> has an account, a link to set a new password is on
            its way. It works once, for an hour. Look in spam if it isn't there in a minute.
          </>
        }
        footer={backToLogin}
      >
        <div className="flex flex-col gap-3">
          {inbox && (
            <a href={inbox.url} target="_blank" rel="noopener noreferrer" className={AUTH_PRIMARY} data-testid="link-open-inbox">
              Open {inbox.name}
            </a>
          )}
          <button
            onClick={() => { setSent(false); setError(null); }}
            className={AUTH_SECONDARY}
            data-testid="button-reset-try-again"
          >
            Use a different email
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      titleTestId="text-forgot-title"
      subtitle={
        valid
          ? <>We'll email a link to <span className="text-vf-text">{maskEmail(trimmed)}</span>. It works for an hour.</>
          : "Enter the email on your account and we'll send a link to set a new password."
      }
      footer={backToLogin}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="forgot-email" className={LABEL}>Email</label>
          <input
            id="forgot-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={!!blurProblem}
            placeholder="you@email.com"
            className={INPUT}
            data-testid="input-forgot-email"
          />
          {blurProblem && <p className="mt-1.5 text-[13px] text-vf-ember">{blurProblem}</p>}
        </div>

        {error && (
          <p className="text-[13px] text-vf-ember" role="alert" data-testid="text-forgot-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className={AUTH_PRIMARY} data-testid="button-submit-forgot">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? "Sending…" : "Send the link"}
        </button>
      </form>
    </AuthShell>
  );
}
