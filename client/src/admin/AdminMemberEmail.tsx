import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost, adminPatch, AdminApiError } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER, ALERT, formatDateTime } from "./AdminShell";

// Member lifecycle email: off until you switch it on here. Dry run shows who
// would get what right now; Preview renders any email for any member; Test
// sends one to your own inbox. Announcements: write a one-off email, preview
// it, test it on yourself, then send it to every member (over several days
// when there are more members than the daily limit).

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

      <Announcements connected={delivery.connected} production={delivery.production} dailyCap={settings.dailyCap} />

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

const EMPTY_DRAFT = { subject: "", heading: "", body: "", buttonLabel: "", buttonUrl: "" };

function Announcements({ connected, production, dailyCap }: { connected: boolean; production: boolean; dailyCap: number }) {
  const { data, refetch } = useQuery({
    queryKey: ["admin", "announcements"],
    queryFn: () => adminGet("/api/admin/announcements"),
    refetchInterval: 60_000,
  });
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The send button unlocks only after a test of this exact draft.
  const [tested, setTested] = useState(false);

  const set = (k: keyof typeof EMPTY_DRAFT) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDraft({ ...draft, [k]: e.target.value });
    setTested(false);
    setPreview(null);
  };
  const run = async (key: string, fn: () => Promise<any>, after?: (r: any) => void) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      after?.(await fn());
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const items: any[] = data?.items ?? [];
  const audience: number = data?.audience ?? 0;
  const sending = items.some((a) => a.status === "sending");
  const days = Math.max(1, Math.ceil(audience / Math.max(1, dailyCap)));
  const field: React.CSSProperties = { ...input, width: "100%", boxSizing: "border-box" };
  const blocked = !tested || sending || audience === 0 || (!connected && production);

  const send = () => {
    const when = days > 1
      ? `It goes out over about ${days} days (${dailyCap} a day, 8am to 8pm).`
      : "It goes out over the next few minutes (8am to 8pm only).";
    if (!window.confirm(`Send "${draft.subject}" to ${audience} members? ${when}`)) return;
    run("send", () => adminPost("/api/admin/announcements", draft), () => {
      setDraft(EMPTY_DRAFT);
      setPreview(null);
      setTested(false);
      setNotice("Sending has started. Progress shows below.");
      refetch();
    });
  };

  return (
    <div style={box} data-testid="announcements">
      <div style={{ fontSize: 15, color: TEXT, fontWeight: 600 }}>Announcements</div>
      <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 12 }}>
        A one-off email to every member who hasn't turned off "News and updates" ({audience} right now). Each member gets it once. It shares the
        daily limit with the emails above, and they go first.
      </div>
      {error && <p style={{ color: EMBER, fontSize: 13, marginBottom: 10 }}>{error}</p>}
      {notice && <p style={{ color: "#8FE3C7", fontSize: 13, marginBottom: 10 }}>{notice}</p>}

      <div style={{ display: "grid", gap: 8 }}>
        <input value={draft.subject} onChange={set("subject")} placeholder="Subject line" maxLength={150} style={field} data-testid="announcement-subject" />
        <input value={draft.heading} onChange={set("heading")} placeholder="Heading in the email (blank = the subject)" maxLength={150} style={field} data-testid="announcement-heading" />
        <textarea
          value={draft.body}
          onChange={set("body")}
          placeholder={'The message. Leave a blank line between paragraphs; links starting with https:// become clickable. Each email starts with "Hi <first name>," for you.'}
          rows={8}
          maxLength={5000}
          style={{ ...field, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
          data-testid="announcement-body"
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={draft.buttonLabel} onChange={set("buttonLabel")} placeholder="Button label (optional)" maxLength={40} style={{ ...input, flex: "1 1 160px" }} data-testid="announcement-button-label" />
          <input value={draft.buttonUrl} onChange={set("buttonUrl")} placeholder="Button link: https://… or /events" maxLength={500} style={{ ...input, flex: "2 1 240px" }} data-testid="announcement-button-url" />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button
          disabled={!!busy}
          onClick={() => run("preview", () => adminPost("/api/admin/announcements/preview", draft), setPreview)}
          style={{ ...btn, background: "transparent", color: TEXT, border: `1px solid ${LINE}` }}
          data-testid="announcement-preview"
        >
          {busy === "preview" ? "Rendering…" : "Preview"}
        </button>
        <button
          disabled={!!busy}
          onClick={() =>
            run("test", () => adminPost("/api/admin/announcements/test", draft), (r) => {
              setTested(true);
              setNotice(`Test sent to ${r.to}. Check it looks right, then send.`);
            })
          }
          style={{ ...btn, background: "transparent", color: TEXT, border: `1px solid ${LINE}` }}
          data-testid="announcement-test"
        >
          {busy === "test" ? "Sending…" : "Send test to me"}
        </button>
        <button
          disabled={!!busy || blocked}
          onClick={send}
          style={{ ...btn, background: GREEN, color: "#fff", border: "none", opacity: blocked ? 0.5 : 1 }}
          data-testid="announcement-send"
        >
          {busy === "send" ? "Starting…" : `Send to ${audience} members`}
        </button>
      </div>
      <div style={{ fontSize: 12, color: FAINT, marginTop: 6 }}>
        {sending
          ? "One announcement is still going out; the next can start when it finishes or is stopped."
          : !connected
            ? "Email provider not connected, so a test can't be delivered yet."
            : !tested
              ? "Send yourself a test first; the send button unlocks after it."
              : days > 1
                ? `At ${dailyCap} a day this takes about ${days} days.`
                : ""}
      </div>

      {preview && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: TEXT }}>
            <span style={{ color: MUTED }}>Subject:</span> {preview.subject}
          </div>
          <iframe
            title="Announcement preview"
            srcDoc={preview.html}
            sandbox=""
            style={{ width: "100%", height: 520, border: `1px solid ${LINE}`, borderRadius: 8, marginTop: 8, background: "#fff" }}
            data-testid="announcement-preview-frame"
          />
        </div>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {items.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12.5, padding: "8px 0", borderTop: `1px solid ${LINE}` }} data-testid={`announcement-${a.id}`}>
              <span style={{ ...MONO, color: FAINT, width: 140, flexShrink: 0 }}>{formatDateTime(a.createdAt)}</span>
              <span style={{ color: TEXT, flex: 1 }}>
                {a.subject}
                <span style={{ display: "block", color: FAINT, fontSize: 11.5 }}>
                  {a.sent} of {a.audience} sent
                  {a.failed ? ` · ${a.failed} failed` : ""}
                  {a.logged ? ` · ${a.logged} not delivered (test server)` : ""}
                </span>
              </span>
              <span style={{ ...MONO, color: a.status === "sending" ? "#8FE3C7" : a.status === "cancelled" ? ALERT : MUTED }}>{a.status}</span>
              {a.status === "sending" && (
                <button
                  disabled={!!busy}
                  onClick={() => {
                    if (window.confirm("Stop sending this announcement? Members who already got it keep it.")) {
                      run("cancel", () => adminPost(`/api/admin/announcements/${a.id}/cancel`), () => refetch());
                    }
                  }}
                  style={{ ...btn, padding: "4px 10px", background: "transparent", color: TEXT, border: `1px solid ${LINE}` }}
                >
                  Stop
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
