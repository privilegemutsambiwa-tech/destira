import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost, adminPatch, AdminApiError } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER, ALERT, formatDateTime } from "./AdminShell";

// Member lifecycle email: off until you switch it on here. Dry run shows who
// would get what right now; Preview renders any email for any member; Test
// sends one to your own inbox.

const box: React.CSSProperties = { border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: 16, marginBottom: 16 };
const btn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer" };
const input: React.CSSProperties = { background: "transparent", border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", color: TEXT, fontSize: 13 };
const GREEN = "#2E7D5B";

export default function AdminMemberEmail() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["admin", "member-email"], queryFn: () => adminGet("/api/admin/member-email") });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dry, setDry] = useState<any>(null);
  const [kind, setKind] = useState("welcome");
  const [previewEmail, setPreviewEmail] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<any>, after?: (r: any) => void) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      after?.(r);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };
  const save = (patch: any) =>
    run("save", () => adminPatch("/api/admin/member-email/settings", patch), () => {
      qc.invalidateQueries({ queryKey: ["admin", "member-email"] });
      refetch();
    });

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;
  const { settings, delivery, kinds, stats, log } = data;
  const live = settings.mode === "live";

  const statFor = (k: string, status: string) =>
    (stats as any[]).filter((s) => s.kind === k && s.status === status).reduce((n, s) => n + s.count, 0);

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader
        title="Member emails"
        sub="Welcome, finish-your-profile, someone-liked-you, weekly digest and we-miss-you emails. Each member gets each one at most once per window, only between 8am and 8pm Harare time."
      />
      {error && <p style={{ color: EMBER, fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {notice && <p style={{ color: "#8FE3C7", fontSize: 13, marginBottom: 12 }}>{notice}</p>}

      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ ...LABEL, color: MUTED }}>Status</div>
            <div style={{ fontSize: 18, color: live ? "#8FE3C7" : TEXT, fontWeight: 600, marginTop: 2 }} data-testid="member-email-mode">
              {live ? "Live: sending to members" : "Off: nothing is sent"}
            </div>
            <div style={{ fontSize: 12.5, color: delivery.connected ? MUTED : ALERT, marginTop: 4 }}>
              {delivery.connected
                ? delivery.production
                  ? "Email provider connected."
                  : "Email provider connected, but this is not production: only addresses on MEMBER_EMAIL_DEV_ALLOW are delivered."
                : "Email provider not connected on this server (RESEND_API_KEY missing). Sends are logged, not delivered."}
              {delivery.connected && !delivery.fromConfigured && " Set EMAIL_FROM_MEMBERS to a verified destira.date address before going live."}
            </div>
          </div>
          <button
            disabled={busy === "save"}
            onClick={() => {
              if (!live && !window.confirm("Start sending lifecycle emails to members? You can switch it off again at any time.")) return;
              save({ mode: live ? "off" : "live" });
            }}
            style={{ ...btn, background: live ? "transparent" : GREEN, color: live ? TEXT : "#fff", border: live ? `1px solid ${LINE}` : "none" }}
            data-testid="member-email-toggle"
          >
            {live ? "Switch off" : "Turn on"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
          <span style={{ fontSize: 13, color: MUTED }}>Daily limit</span>
          <input
            type="number"
            min={1}
            defaultValue={settings.dailyCap}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v > 0 && v !== settings.dailyCap) save({ dailyCap: v });
            }}
            style={{ ...input, width: 90 }}
            data-testid="member-email-cap"
          />
          <span style={{ fontSize: 12, color: FAINT }}>emails per 24h. Resend's free plan allows 100 a day.</span>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 8 }}>
          {kinds.map((k: any) => (
            <label key={k.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: TEXT, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px" }}>
              <input type="checkbox" checked={!!settings.kinds[k.key]} onChange={(e) => save({ kinds: { [k.key]: e.target.checked } })} />
              <span style={{ flex: 1 }}>{k.label}</span>
              <span style={{ ...MONO, fontSize: 11, color: FAINT }}>{statFor(k.key, "sent")} sent · 7d</span>
            </label>
          ))}
        </div>
      </div>

      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, color: TEXT, fontWeight: 600 }}>Dry run</div>
            <div style={{ fontSize: 12.5, color: MUTED }}>Who would get what if the sweep ran right now. Sends nothing.</div>
          </div>
          <button disabled={busy === "dry"} onClick={() => run("dry", () => adminPost("/api/admin/member-email/dry-run"), setDry)} style={{ ...btn, background: "transparent", color: TEXT, border: `1px solid ${LINE}` }} data-testid="member-email-dry-run">
            {busy === "dry" ? "Checking…" : "Run dry run"}
          </button>
        </div>
        {dry && (
          <div style={{ marginTop: 12 }} data-testid="member-email-dry-result">
            <div style={{ fontSize: 13.5, color: TEXT }}>
              {dry.total} email{dry.total === 1 ? "" : "s"} due across {dry.eligibleMembers} members
              {dry.total > dry.wouldSendToday ? `; ${dry.wouldSendToday} fit today's limit, the rest go out on later days` : ""}.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {Object.entries(dry.byKind).map(([k, n]: any) => (
                <span key={k} style={{ ...MONO, fontSize: 11.5, color: TEXT, border: `1px solid ${LINE}`, borderRadius: 6, padding: "3px 8px" }}>
                  {kinds.find((x: any) => x.key === k)?.label ?? k}: {n}
                </span>
              ))}
            </div>
            {dry.sample.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {dry.sample.map((s: any, i: number) => (
                  <div key={i} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "6px 0", borderTop: `1px solid ${LINE}` }}>
                    <span style={{ ...MONO, color: FAINT, width: 160, flexShrink: 0 }}>{s.to}</span>
                    <span style={{ color: TEXT }}>{s.subject}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={box}>
        <div style={{ fontSize: 15, color: TEXT, fontWeight: 600, marginBottom: 8 }}>Preview</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={input} data-testid="member-email-kind">
            {kinds.map((k: any) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <input value={previewEmail} onChange={(e) => setPreviewEmail(e.target.value)} placeholder="member email (blank = you)" style={{ ...input, flex: 1, minWidth: 200 }} />
          <button
            disabled={busy === "preview"}
            onClick={() => run("preview", () => adminGet(`/api/admin/member-email/preview?kind=${kind}${previewEmail ? `&email=${encodeURIComponent(previewEmail)}` : ""}`), setPreview)}
            style={{ ...btn, background: "transparent", color: TEXT, border: `1px solid ${LINE}` }}
            data-testid="member-email-preview"
          >
            Show
          </button>
          <button
            disabled={busy === "test"}
            onClick={() => run("test", () => adminPost("/api/admin/member-email/test", { kind }), (r) => setNotice(`Test sent to ${r.to}.`))}
            style={{ ...btn, background: EMBER, color: "#14101C", border: "none" }}
          >
            Send test to me
          </button>
        </div>
        {preview && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: TEXT }}><span style={{ color: MUTED }}>Subject:</span> {preview.subject}</div>
            <iframe
              title="Email preview"
              srcDoc={preview.html}
              sandbox=""
              style={{ width: "100%", height: 560, border: `1px solid ${LINE}`, borderRadius: 8, marginTop: 8, background: "#fff" }}
              data-testid="member-email-preview-frame"
            />
          </div>
        )}
      </div>

      <div style={box}>
        <div style={{ fontSize: 15, color: TEXT, fontWeight: 600, marginBottom: 8 }}>Recent sends</div>
        {log.length === 0 ? (
          <p style={{ fontSize: 13, color: FAINT }}>Nothing sent yet.</p>
        ) : (
          log.map((r: any) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr 90px", gap: 10, fontSize: 12.5, padding: "7px 0", borderTop: `1px solid ${LINE}` }}>
              <span style={{ ...MONO, color: FAINT }}>{formatDateTime(r.createdAt)}</span>
              <span style={{ color: TEXT }}>
                {r.subject} <span style={{ color: FAINT }}>· {r.recipient}</span>
                {r.error && <span style={{ display: "block", color: FAINT, fontSize: 11.5 }}>{r.error}</span>}
              </span>
              <span style={{ ...MONO, color: r.status === "sent" ? "#8FE3C7" : r.status === "failed" ? ALERT : MUTED, textAlign: "right" }}>{r.status}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
