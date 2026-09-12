import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost, adminPatch } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, ALERT, EMBER, formatDateTime, Modal, useStepUp } from "./AdminShell";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: 16, marginBottom: 14 }}>
    <div style={{ ...LABEL, marginBottom: 10 }}>{title}</div>
    {children}
  </div>
);
const fieldStyle: React.CSSProperties = { width: "100%", height: 34, borderRadius: 6, border: `1px solid ${LINE}`, background: "rgba(255,255,255,.04)", color: TEXT, fontSize: 13, padding: "0 10px", boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { height: 32, padding: "0 14px", borderRadius: 6, border: "none", background: EMBER, color: "#1a0e08", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { height: 32, padding: "0 12px", borderRadius: 6, border: `1px solid ${LINE}`, background: "transparent", color: MUTED, fontSize: 12.5, cursor: "pointer" };

export default function AdminAccount() {
  const qc = useQueryClient();
  const withStepUp = useStepUp();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "account"], queryFn: () => adminGet("/api/admin/account") });
  const { data: sessions } = useQuery({ queryKey: ["admin", "account", "sessions"], queryFn: () => adminGet("/api/admin/account/sessions") });
  const { data: auditLog } = useQuery({ queryKey: ["admin", "account", "audit-log"], queryFn: () => adminGet("/api/admin/account/audit-log") });

  const [name, setName] = useState<{ firstName: string; lastName: string } | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;
  const draft = name ?? { firstName: data.firstName, lastName: data.lastName };

  const saveName = async () => {
    await adminPatch("/api/admin/account", draft);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
    qc.invalidateQueries({ queryKey: ["admin", "account"] });
  };

  const changePassword = async () => {
    setPwBusy(true);
    setPwError(null);
    try {
      await adminPost("/api/admin/account/change-password", { currentPassword: pwCurrent, newPassword: pwNew });
      setPwCurrent("");
      setPwNew("");
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
      qc.invalidateQueries({ queryKey: ["admin", "account", "sessions"] });
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPwBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    setSignOutBusy(true);
    try {
      await withStepUp(() => adminPost("/api/admin/account/sessions/sign-out-everywhere"));
      window.location.href = "/console/login";
    } catch (e) {
      setSignOutBusy(false);
    }
  };

  const regenerateCodes = async () => {
    setRegenBusy(true);
    try {
      const r = await withStepUp(() => adminPost("/api/admin/account/recovery-codes/regenerate"));
      setRecoveryCodes(r.recoveryCodes);
      qc.invalidateQueries({ queryKey: ["admin", "account"] });
    } catch (e) {
      /* step-up cancel or failure — nothing to show, the button just stays available */
    } finally {
      setRegenBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader title="My account" sub="Your own ops identity — not a member profile." />

      <Section title="Identity">
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: FAINT, marginBottom: 4 }}>First name</div>
            <input value={draft.firstName} onChange={(e) => setName({ ...draft, firstName: e.target.value })} style={fieldStyle} data-testid="account-first-name" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: FAINT, marginBottom: 4 }}>Last name</div>
            <input value={draft.lastName} onChange={(e) => setName({ ...draft, lastName: e.target.value })} style={fieldStyle} data-testid="account-last-name" />
          </div>
        </div>
        <button onClick={saveName} style={secondaryBtn} data-testid="account-save-name">
          {nameSaved ? "Saved" : "Save name"}
        </button>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: FAINT, marginBottom: 4 }}>Sign-in email</div>
          <div style={{ ...MONO, fontSize: 13.5, color: TEXT }}>{data.email}</div>
          <p style={{ fontSize: 11, color: FAINT, marginTop: 4, lineHeight: 1.5 }}>
            This is the address you sign in with — not the same thing as the console-wide default recipient on the{" "}
            <a href="/console/email" style={{ color: MUTED }}>
              Email alerts
            </a>{" "}
            page. Alerts don't route to individual admins; they go to that one shared address.
          </p>
        </div>
      </Section>

      <Section title="Role">
        <div style={{ ...MONO, fontSize: 16, color: TEXT, marginBottom: 4 }}>{data.role}</div>
        <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, margin: 0 }}>{data.roleDescription}</p>
        <p style={{ fontSize: 11, color: FAINT, marginTop: 8 }}>
          Nobody can change their own role — ask another owner. Granted by <span style={{ color: MUTED }}>{data.grantedByName || "the initial seed"}</span>
          {data.grantedAt && <> on {formatDateTime(data.grantedAt)}</>}.
        </p>
      </Section>

      <Section title="Password">
        <input type="password" placeholder="Current password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} style={{ ...fieldStyle, marginBottom: 8 }} data-testid="account-current-password" />
        <input type="password" placeholder="New password (min. 8 characters)" value={pwNew} onChange={(e) => setPwNew(e.target.value)} style={{ ...fieldStyle, marginBottom: 10 }} data-testid="account-new-password" />
        {pwError && <p style={{ color: ALERT, fontSize: 12, marginBottom: 8 }}>{pwError}</p>}
        <button onClick={changePassword} disabled={!pwCurrent || pwNew.length < 8 || pwBusy} style={{ ...primaryBtn, opacity: !pwCurrent || pwNew.length < 8 || pwBusy ? 0.5 : 1 }} data-testid="account-change-password">
          {pwBusy ? "Changing…" : pwSaved ? "Changed" : "Change password"}
        </button>
        <p style={{ fontSize: 10.5, color: FAINT, marginTop: 8 }}>Changing your password signs out every other session of yours — this one stays open.</p>
      </Section>

      <Section title="Two-factor authentication">
        <p style={{ fontSize: 12.5, color: MUTED, marginBottom: 10 }}>
          <span style={{ ...MONO, color: TEXT }}>Mandatory</span> for every admin, every role — there's no way to disable it, for yourself or anyone else.
        </p>
        <div style={{ fontSize: 12, color: FAINT, marginBottom: 10 }}>
          {data.hasUnusedRecoveryCodes ? "Recovery codes are issued and unused." : "No unused recovery codes remain — regenerate a fresh batch below."}
        </div>
        <button onClick={regenerateCodes} disabled={regenBusy} style={secondaryBtn} data-testid="account-regenerate-codes">
          {regenBusy ? "Working…" : "Regenerate recovery codes"}
        </button>
        <p style={{ fontSize: 10.5, color: FAINT, marginTop: 8 }}>Invalidates any unused codes from before. Shown once — save them somewhere safe.</p>
      </Section>

      <Section title="Active sessions">
        {!sessions || sessions.length === 0 ? (
          <p style={{ fontSize: 12.5, color: FAINT }}>Nothing here.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {sessions.map((s: any) => (
              <div key={s.sessionRef} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${LINE}`, gap: 10 }}>
                <div style={{ fontSize: 12.5, color: TEXT }}>
                  {s.current && <span style={{ ...MONO, fontSize: 10, color: EMBER, marginRight: 6 }}>THIS DEVICE</span>}
                  <span style={{ ...MONO, fontSize: 11.5, color: MUTED }}>{s.ip || "unknown ip"}</span>
                  <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{s.userAgent || "unknown device"}</div>
                </div>
                <span style={{ ...MONO, fontSize: 11, color: FAINT, whiteSpace: "nowrap" }}>{s.lastSeenAt ? formatDateTime(s.lastSeenAt) : "—"}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={signOutEverywhere} disabled={signOutBusy} style={{ ...secondaryBtn, borderColor: `${ALERT}66`, color: ALERT }} data-testid="account-sign-out-everywhere">
          {signOutBusy ? "Signing out…" : "Sign out everywhere"}
        </button>
        <p style={{ fontSize: 10.5, color: FAINT, marginTop: 8 }}>Kills every session of yours, including this one — you'll need to sign in again.</p>
      </Section>

      <Section title="My recent activity — last 50">
        {!auditLog || auditLog.length === 0 ? (
          <p style={{ fontSize: 12.5, color: FAINT }}>Nothing yet.</p>
        ) : (
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {auditLog.map((row: any) => (
              <div key={row.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 12, gap: 10 }}>
                <span style={{ color: TEXT }}>
                  {row.action}
                  {row.targetType && <span style={{ color: FAINT }}> · {row.targetType}{row.targetId ? `#${row.targetId}` : ""}</span>}
                </span>
                <span style={{ ...MONO, color: FAINT, whiteSpace: "nowrap" }}>{formatDateTime(row.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {recoveryCodes && <RecoveryCodesModal codes={recoveryCodes} onClose={() => setRecoveryCodes(null)} />}
    </div>
  );
}

function RecoveryCodesModal({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div style={{ ...LABEL, marginBottom: 6 }}>Recovery codes</div>
      <p style={{ fontSize: 12, color: ALERT, marginTop: 0, marginBottom: 12 }}>Shown once. Save these now — they won't be shown again.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {codes.map((c) => (
          <div key={c} style={{ ...MONO, fontSize: 13, color: TEXT, background: "rgba(255,255,255,.04)", border: `1px solid ${LINE}`, borderRadius: 6, padding: "6px 10px", textAlign: "center" }}>
            {c}
          </div>
        ))}
      </div>
      <button onClick={onClose} style={primaryBtn}>
        I've saved them
      </button>
    </Modal>
  );
}
