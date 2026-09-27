import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost, AdminApiError } from "./api";
import { PageHeader, LABEL, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER, formatDateTime } from "./AdminShell";

// The only pre-publish review left in the product: a private-residence
// event, held so someone doesn't get sent to a stranger's address on the
// strength of an unverified host video. Everything else auto-publishes at
// creation and is handled reactively through the Reports queue instead.
export default function AdminEventsPending() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "events", "pending"],
    queryFn: () => adminGet("/api/admin/events/pending"),
  });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  };

  const approve = async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      await adminPost(`/api/admin/events/${id}/approve`);
      refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Failed to approve");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: number) => {
    if (!reason.trim()) return setError("A reason is required.");
    setBusyId(id);
    setError(null);
    try {
      await adminPost(`/api/admin/events/${id}/reject`, { reason: reason.trim() });
      setRejectingId(null);
      setReason("");
      refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Failed to reject");
    } finally {
      setBusyId(null);
    }
  };

  const events: any[] = data?.events || [];

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader
        title="Events awaiting review"
        sub="Private-residence events only — host video/ID check before the event (and its address) can go live."
      />
      {error && <p style={{ color: EMBER, fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {isLoading ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : events.length === 0 ? (
        <p style={{ color: FAINT, fontSize: 13 }}>Nothing waiting on a review right now.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {events.map((ev) => (
            <div key={ev.id} style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, padding: 14 }} data-testid={`pending-event-${ev.id}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, color: TEXT, fontWeight: 600 }}>{ev.title}</div>
                  <div style={{ ...LABEL, marginTop: 4 }}>
                    Hosted by {ev.hostName || ev.hostUserId.slice(0, 8)} · {ev.suburb}, {ev.city}
                  </div>
                  <div style={{ ...LABEL, marginTop: 2, color: FAINT }}>Submitted {formatDateTime(ev.createdAt)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ ...LABEL, color: MUTED }}>Host video</div>
                  <div style={{ fontSize: 13, color: TEXT }}>{ev.hostVideoStatus || "not uploaded"}</div>
                </div>
              </div>

              {ev.hostVideoUrl && (
                <video
                  src={ev.hostVideoUrl}
                  poster={ev.hostVideoPosterUrl || undefined}
                  controls
                  style={{ marginTop: 10, maxWidth: 320, borderRadius: 8, display: "block" }}
                  data-testid={`pending-event-video-${ev.id}`}
                />
              )}

              {rejectingId === ev.id ? (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why is this being blocked?"
                    rows={2}
                    style={{ width: "100%", background: "transparent", border: `1px solid ${LINE}`, borderRadius: 8, padding: 8, color: TEXT, fontSize: 13, resize: "vertical" }}
                    data-testid={`pending-event-reject-reason-${ev.id}`}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => reject(ev.id)}
                      disabled={busyId === ev.id}
                      style={{ ...buttonStyle, background: EMBER, color: "#14101C", border: "none" }}
                      data-testid={`pending-event-confirm-reject-${ev.id}`}
                    >
                      {busyId === ev.id ? "Blocking…" : "Confirm block"}
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
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button
                    onClick={() => approve(ev.id)}
                    disabled={busyId === ev.id}
                    style={{ ...buttonStyle, background: "#2E7D5B", color: "#fff", border: "none" }}
                    data-testid={`pending-event-approve-${ev.id}`}
                  >
                    {busyId === ev.id ? "Approving…" : "Approve — go live"}
                  </button>
                  <button
                    onClick={() => { setRejectingId(ev.id); setError(null); }}
                    style={{ ...buttonStyle, background: "transparent", color: EMBER, border: `1px solid ${EMBER}66` }}
                    data-testid={`pending-event-open-reject-${ev.id}`}
                  >
                    Block
                  </button>
                </div>
              )}
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
