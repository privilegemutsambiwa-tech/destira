import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost, AdminApiError } from "./api";
import { PageHeader, LABEL, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER, formatDateTime, useStepUp } from "./AdminShell";

// Risk queue (server/admin/risk.ts). Signals, not verdicts: look at what was
// said and to whom, then clear it, hold the account, or ban.
const SEV_COLOR: Record<string, string> = { high: "#E5484D", medium: "#F5A524", low: "#8B8D98" };

export default function AdminRisk() {
  const qc = useQueryClient();
  const withStepUp = useStepUp();
  const [all, setAll] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "risk", all],
    queryFn: () => adminGet(`/api/admin/risk${all ? "?all=1" : ""}`),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [banning, setBanning] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const act = async (userId: string, kind: "clear" | "hold" | "ban") => {
    if (kind === "ban" && !reason.trim()) return setError("Write why. It's kept with the ban.");
    setBusy(userId);
    setError(null);
    try {
      const call = () => adminPost(`/api/admin/risk/${encodeURIComponent(userId)}/${kind}`, kind === "ban" ? { reason: reason.trim() } : undefined);
      await (kind === "ban" ? withStepUp(call) : call());
      setBanning(null);
      setReason("");
      refetch();
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const members: any[] = data?.members || [];

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader
        title="Risk"
        sub="Members whose messages, photos or behaviour look like a scam. Read what triggered it before acting. Clearing lifts an automatic hold."
      />
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: MUTED, marginBottom: 14 }}>
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        Also show low-level signals (numbers or WhatsApp on a profile)
      </label>
      {error && <p style={{ color: EMBER, fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {isLoading ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : members.length === 0 ? (
        <p style={{ color: FAINT, fontSize: 13 }}>Nobody flagged right now.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {members.map((g) => {
            const m = g.member;
            const held = m?.status === "review";
            return (
              <div key={g.userId} style={{ border: `1px solid ${LINE}`, borderLeft: `3px solid ${SEV_COLOR[g.worst]}`, borderRadius: 10, background: SURFACE, padding: 14 }} data-testid={`risk-${g.userId}`}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 15, color: TEXT, fontWeight: 600 }}>
                      {m?.displayName || "(no name)"}{m?.age ? `, ${m.age}` : ""}
                      {m?.isVerified ? <span style={{ ...LABEL, color: "#2E7D5B", marginLeft: 8 }}>verified</span> : null}
                    </div>
                    <div style={{ ...LABEL, marginTop: 4 }}>
                      {[m?.email, m?.createdAt ? `joined ${formatDateTime(m.createdAt)}` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: held || m?.status === "banned" ? EMBER : MUTED }} data-testid={`risk-status-${g.userId}`}>
                      {held ? "Held for review" : m?.status === "banned" ? "Banned" : m?.status === "suspended" ? "Suspended" : "Active"}
                    </div>
                    {held && m?.reason ? <div style={{ ...LABEL, color: FAINT, marginTop: 2, maxWidth: 260 }}>{m.reason}</div> : null}
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {g.flags.map((f: any) => (
                    <div key={f.id} style={{ fontSize: 13, color: TEXT, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${LINE}` }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: SEV_COLOR[f.severity], display: "inline-block" }} />
                        <span style={{ fontWeight: 600 }}>{f.label}</span>
                        <span style={{ ...LABEL, color: FAINT }}>
                          {f.source === "dm" ? "in a chat" : f.source === "group" ? "in a group" : f.source === "story_comment" ? "in a story reply" : f.source === "profile" ? "on their profile" : f.source === "intro" ? "in a Crown introduction" : f.source}
                          {f.other ? ` · with ${f.other}` : ""} · {formatDateTime(f.createdAt)}
                        </span>
                      </div>
                      {f.snippet ? <div style={{ marginTop: 4, color: MUTED, fontStyle: "italic" }}>“{f.snippet}”</div> : null}
                    </div>
                  ))}
                </div>

                {banning === g.userId ? (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why are they being banned? (kept with the ban)"
                      rows={2}
                      style={{ width: "100%", background: "transparent", border: `1px solid ${LINE}`, borderRadius: 8, padding: 8, color: TEXT, fontSize: 13 }}
                      data-testid={`risk-ban-reason-${g.userId}`}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => act(g.userId, "ban")} disabled={busy === g.userId} style={{ ...btn, background: "#E5484D", color: "#fff", border: "none" }} data-testid={`risk-confirm-ban-${g.userId}`}>
                        {busy === g.userId ? "Banning…" : "Ban for good"}
                      </button>
                      <button onClick={() => { setBanning(null); setReason(""); }} style={{ ...btn, background: "transparent", color: MUTED, border: `1px solid ${LINE}` }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => act(g.userId, "clear")} disabled={busy === g.userId} style={{ ...btn, background: "transparent", color: TEXT, border: `1px solid ${LINE}` }} data-testid={`risk-clear-${g.userId}`}>
                      {held ? "False alarm: lift hold" : "False alarm: clear"}
                    </button>
                    {!held && m?.status === "active" && (
                      <button onClick={() => act(g.userId, "hold")} disabled={busy === g.userId} style={{ ...btn, background: "transparent", color: "#F5A524", border: "1px solid #F5A52466" }} data-testid={`risk-hold-${g.userId}`}>
                        Hold for review
                      </button>
                    )}
                    {m?.status !== "banned" && (
                      <button onClick={() => { setBanning(g.userId); setReason(""); setError(null); }} style={{ ...btn, background: "transparent", color: "#E5484D", border: "1px solid #E5484D66" }} data-testid={`risk-ban-${g.userId}`}>
                        Ban
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer" };
