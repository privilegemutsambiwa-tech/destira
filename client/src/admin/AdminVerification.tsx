import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost, AdminApiError } from "./api";
import { PageHeader, LABEL, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER, formatDateTime } from "./AdminShell";

// Selfie verification queue (server/admin/verification.ts). Compare the live
// selfie with the profile photos and check the requested pose is there.
// The selfie is deleted as soon as you decide.
export default function AdminVerification() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "verification", tab],
    queryFn: () => adminGet(`/api/admin/verification?status=${tab}`),
  });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  };

  const act = async (id: number, kind: "approve" | "reject") => {
    if (kind === "reject" && !reason.trim()) return setError("Pick or write a reason. The member will see it.");
    setBusyId(id);
    setError(null);
    try {
      await adminPost(`/api/admin/verification/${id}/${kind}`, kind === "reject" ? { reason: reason.trim() } : undefined);
      setRejectingId(null);
      setReason("");
      refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const requests: any[] = data?.requests || [];
  const reasons: string[] = data?.rejectReasons || [];

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader
        title="Verification"
        sub="Approve only when the selfie is clearly the person in the profile photos and shows the pose asked for. The selfie is deleted once you decide."
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["pending", "approved", "rejected"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ ...buttonStyle, background: tab === t ? `${EMBER}22` : "transparent", color: tab === t ? EMBER : MUTED, border: `1px solid ${tab === t ? `${EMBER}66` : LINE}` }}
            data-testid={`verification-tab-${t}`}
          >
            {t === "pending" ? "Waiting" : t === "approved" ? "Approved" : "Rejected"}
          </button>
        ))}
      </div>
      {error && <p style={{ color: EMBER, fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {isLoading ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : requests.length === 0 ? (
        <p style={{ color: FAINT, fontSize: 13 }}>{tab === "pending" ? "No selfies waiting." : "Nothing here yet."}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {requests.map((r) => (
            <div key={r.id} style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, padding: 14 }} data-testid={`verification-${r.id}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 15, color: TEXT, fontWeight: 600 }}>
                    {r.displayName || "(no name)"}{r.age ? `, ${r.age}` : ""}
                  </div>
                  <div style={{ ...LABEL, marginTop: 4 }}>
                    {[r.gender, r.location, r.email].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ ...LABEL, marginTop: 2, color: FAINT }}>
                    Sent {formatDateTime(r.createdAt)}
                    {r.reviewedAt ? ` · reviewed ${formatDateTime(r.reviewedAt)}` : ""}
                    {r.previousRejections > 0 && tab === "pending" ? ` · rejected ${r.previousRejections} time${r.previousRejections === 1 ? "" : "s"} before` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right", maxWidth: 280 }}>
                  <div style={{ ...LABEL, color: MUTED }}>Pose asked for</div>
                  <div style={{ fontSize: 13.5, color: r.pose ? TEXT : EMBER, fontWeight: 600 }}>{r.poseText}</div>
                </div>
              </div>

              {tab === "pending" && (
                <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <figure style={{ margin: 0 }}>
                    {r.hasSelfie ? (
                      <img
                        src={`/api/admin/verification/${r.id}/selfie`}
                        alt="Selfie"
                        style={{ width: 220, height: 220, objectFit: "cover", borderRadius: 10, border: `2px solid ${EMBER}` }}
                        data-testid={`verification-selfie-${r.id}`}
                      />
                    ) : (
                      <div style={{ width: 220, height: 220, borderRadius: 10, border: `1px dashed ${LINE}`, color: FAINT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                        Selfie missing
                      </div>
                    )}
                    <figcaption style={{ ...LABEL, color: MUTED, marginTop: 4 }}>Selfie</figcaption>
                  </figure>
                  <div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {r.photoIds.map((pid: number) => (
                        <a key={pid} href={`/api/admin/verification/${r.id}/photo/${pid}`} target="_blank" rel="noreferrer" title="Open full size">
                          <img
                            src={`/api/admin/verification/${r.id}/photo/${pid}`}
                            alt="Profile photo"
                            style={{ width: 160, height: 220, objectFit: "cover", borderRadius: 8, border: `1px solid ${LINE}`, display: "block" }}
                          />
                        </a>
                      ))}
                    </div>
                    <div style={{ ...LABEL, color: MUTED, marginTop: 4 }}>Profile photos ({r.photoIds.length})</div>
                  </div>
                </div>
              )}

              {tab === "rejected" && r.rejectReason && (
                <div style={{ marginTop: 8, fontSize: 13, color: MUTED }}>Told them: “{r.rejectReason}”</div>
              )}

              {tab === "pending" &&
                (rejectingId === r.id ? (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {reasons.map((text) => (
                        <label key={text} style={{ display: "flex", gap: 8, fontSize: 13, color: TEXT, cursor: "pointer" }}>
                          <input type="radio" name={`reason-${r.id}`} checked={reason === text} onChange={() => setReason(text)} />
                          {text}
                        </label>
                      ))}
                    </div>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Or write your own (the member sees this)"
                      rows={2}
                      maxLength={300}
                      style={{ width: "100%", background: "transparent", border: `1px solid ${LINE}`, borderRadius: 8, padding: 8, color: TEXT, fontSize: 13, resize: "vertical" }}
                      data-testid={`verification-reason-${r.id}`}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => act(r.id, "reject")}
                        disabled={busyId === r.id}
                        style={{ ...buttonStyle, background: EMBER, color: "#14101C", border: "none" }}
                        data-testid={`verification-confirm-reject-${r.id}`}
                      >
                        {busyId === r.id ? "Sending…" : "Reject and tell them"}
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setReason(""); setError(null); }}
                        style={{ ...buttonStyle, background: "transparent", color: MUTED, border: `1px solid ${LINE}` }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button
                      onClick={() => act(r.id, "approve")}
                      disabled={busyId === r.id || !r.hasSelfie}
                      style={{ ...buttonStyle, background: "#2E7D5B", color: "#fff", border: "none" }}
                      data-testid={`verification-approve-${r.id}`}
                    >
                      {busyId === r.id ? "Approving…" : "Approve: it's them"}
                    </button>
                    <button
                      onClick={() => { setRejectingId(r.id); setReason(""); setError(null); }}
                      style={{ ...buttonStyle, background: "transparent", color: EMBER, border: `1px solid ${EMBER}66` }}
                      data-testid={`verification-open-reject-${r.id}`}
                    >
                      Reject
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 8,
  cursor: "pointer",
};
