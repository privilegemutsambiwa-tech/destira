import { useState } from "react";
import { useLocation } from "wouter";
import { PasswordInput } from "@/components/ui/password-input";
import { adminPost } from "./api";

const INK = "#0C0910";
const SURFACE = "#161220";
const LINE = "rgba(255,255,255,.09)";
const TEXT = "#F5F0EA";
const MUTED = "#A79FB4";
const EMBER = "#FF6B4A";

const INPUT: React.CSSProperties = {
  width: "100%",
  height: 42,
  borderRadius: 8,
  border: `1px solid ${LINE}`,
  background: "rgba(255,255,255,.04)",
  color: TEXT,
  padding: "0 12px",
  fontSize: 14,
  fontFamily: '"DM Sans", sans-serif',
};
const LABEL: React.CSSProperties = {
  fontFamily: '"DM Mono", monospace',
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: MUTED,
  marginBottom: 6,
  display: "block",
};

type Step = "credentials" | "enroll" | "verify" | "recovery-codes";

export default function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await adminPost("/api/admin/auth/login", { email, password });
      if (res.totpEnrolled) {
        setStep("verify");
      } else {
        const enroll = await adminPost("/api/admin/auth/totp/enroll");
        setQr(enroll.qrDataUrl);
        setManualSecret(enroll.secret);
        setStep("enroll");
      }
    } catch (err: any) {
      setError(err.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await adminPost("/api/admin/auth/totp/verify", { code });
      if (res.recoveryCodes?.length) {
        // First-time enable issues these — shown exactly once, right here,
        // before the session is treated as "in". Losing this screen loses them.
        setRecoveryCodes(res.recoveryCodes);
        setStep("recovery-codes");
        return;
      }
      onSignedIn();
      setLocation("/console");
    } catch (err: any) {
      setError(err.message || "Wrong code");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    onSignedIn();
    setLocation("/console");
  };

  return (
    <div style={{ minHeight: "100vh", background: INK, color: TEXT, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ ...LABEL, marginBottom: 16 }}>Destira · Console</div>

        {step === "credentials" && (
          <form onSubmit={submitCredentials} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={LABEL}>Email</label>
              <input style={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" data-testid="admin-login-email" />
            </div>
            <div>
              <label style={LABEL}>Password</label>
              <PasswordInput style={INPUT} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="admin-login-password" />
            </div>
            {error && <p style={{ color: EMBER, fontSize: 13 }} role="alert">{error}</p>}
            <button type="submit" disabled={busy} style={{ height: 42, borderRadius: 8, background: EMBER, color: INK, border: "none", fontWeight: 600, fontSize: 14, opacity: busy ? 0.6 : 1 }} data-testid="admin-login-submit">
              {busy ? "Checking…" : "Sign in"}
            </button>
          </form>
        )}

        {step === "enroll" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              Scan this with an authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code
              it shows. This is required — there's no admin session without it.
            </p>
            {qr && <img src={qr} alt="TOTP QR code" style={{ width: 200, height: 200, background: "#fff", padding: 8, borderRadius: 8, alignSelf: "center" }} />}
            {manualSecret && (
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: MUTED, wordBreak: "break-all", background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 8, padding: 10 }}>
                Manual entry: {manualSecret}
              </div>
            )}
            <form onSubmit={submitCode} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={LABEL}>6-digit code</label>
                <input style={{ ...INPUT, fontFamily: '"DM Mono", monospace', letterSpacing: "0.2em", textAlign: "center" }} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="admin-totp-code" />
              </div>
              {error && <p style={{ color: EMBER, fontSize: 13 }} role="alert">{error}</p>}
              <button type="submit" disabled={busy || code.length !== 6} style={{ height: 42, borderRadius: 8, background: EMBER, color: INK, border: "none", fontWeight: 600, fontSize: 14, opacity: busy || code.length !== 6 ? 0.5 : 1 }} data-testid="admin-totp-submit">
                {busy ? "Verifying…" : "Confirm and finish setup"}
              </button>
            </form>
          </div>
        )}

        {step === "verify" && (
          <form onSubmit={submitCode} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={LABEL}>6-digit code from your authenticator app</label>
            <input style={{ ...INPUT, fontFamily: '"DM Mono", monospace', letterSpacing: "0.2em", textAlign: "center" }} inputMode="numeric" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="admin-totp-code" />
            {error && <p style={{ color: EMBER, fontSize: 13 }} role="alert">{error}</p>}
            <button type="submit" disabled={busy || code.length !== 6} style={{ height: 42, borderRadius: 8, background: EMBER, color: INK, border: "none", fontWeight: 600, fontSize: 14, opacity: busy || code.length !== 6 ? 0.5 : 1 }} data-testid="admin-totp-submit">
              {busy ? "Verifying…" : "Continue"}
            </button>
          </form>
        )}

        {step === "recovery-codes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 13, color: EMBER, lineHeight: 1.6, margin: 0 }}>
              Save these recovery codes now — each works once, in place of a 6-digit code, if you lose access to your
              authenticator app. They're shown exactly this one time.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {recoveryCodes.map((c) => (
                <div key={c} style={{ fontFamily: '"DM Mono", monospace', fontSize: 13, color: TEXT, background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 10px", textAlign: "center" }}>
                  {c}
                </div>
              ))}
            </div>
            <button onClick={finish} style={{ height: 42, borderRadius: 8, background: EMBER, color: INK, border: "none", fontWeight: 600, fontSize: 14 }} data-testid="admin-recovery-codes-done">
              I've saved them — continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
