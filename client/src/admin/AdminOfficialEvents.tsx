import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EVENT_KINDS, EVENT_PLACE_TYPES } from "@shared/event-taxonomy";
import { adminGet, adminPost, AdminApiError } from "./api";
import { PageHeader, LABEL, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER, formatDateTime } from "./AdminShell";

// Platform-run events: created here, hosted by the Destira system user, and
// led by a member an admin approves. The server cancels any that haven't
// reached their headcount and a lead 48h before the start (see
// server/official-events.ts); a cancelled one can be reposted with a new date.

const EMPTY_FORM = {
  title: "",
  description: "",
  kind: "outdoors",
  placeType: "outdoors",
  venueName: "",
  suburb: "",
  city: "Harare",
  startsAt: "",
  minGoing: "5",
  seatCount: "",
  sponsorName: "",
  sponsorLogoUrl: "",
  coverImageUrl: "",
};

const MIN_NOTICE_MS = 72 * 60 * 60 * 1000;

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminOfficialEvents() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "events", "official"],
    queryFn: () => adminGet("/api/admin/events/official"),
  });
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repostFor, setRepostFor] = useState<number | null>(null);
  const [repostDate, setRepostDate] = useState("");
  const [assignFor, setAssignFor] = useState<number | null>(null);
  const [assignEmail, setAssignEmail] = useState("");

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const run = async (key: string, fn: () => Promise<unknown>, fallback: string, after?: () => void) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      after?.();
      qc.invalidateQueries({ queryKey: ["admin", "events", "official"] });
      refetch();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : fallback);
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!form.startsAt) return setError("Pick a date and time.");
    setCreating(true);
    setError(null);
    try {
      await adminPost("/api/admin/events/official", {
        title: form.title,
        description: form.description,
        kind: form.kind,
        placeType: form.placeType,
        venueName: form.venueName,
        suburb: form.suburb,
        city: form.city,
        startsAt: new Date(form.startsAt).toISOString(),
        minGoing: Number(form.minGoing) || 5,
        seatCount: form.seatCount ? Number(form.seatCount) : null,
        sponsorName: form.sponsorName,
        sponsorLogoUrl: form.sponsorLogoUrl,
        coverImageUrl: form.coverImageUrl,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["admin", "events", "official"] });
      refetch();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Failed to create the event");
    } finally {
      setCreating(false);
    }
  };

  const events: any[] = data?.events || [];
  const earliest = toLocalInput(new Date(Date.now() + MIN_NOTICE_MS));

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        title="Official events"
        sub="Destira-run events. Members join, one volunteers to lead, you approve. Called off automatically 48h out if fewer than the minimum have joined or there's no lead."
      />
      {error && <p style={{ color: EMBER, fontSize: 13, marginBottom: 12 }} data-testid="official-error">{error}</p>}

      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{ ...btn, background: EMBER, color: "#14101C", border: "none", marginBottom: 16 }} data-testid="button-new-official">
          New official event
        </button>
      ) : (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, padding: 14, marginBottom: 16, display: "grid", gap: 10 }} data-testid="official-form">
          <Row label="Title"><input style={input} value={form.title} onChange={set("title")} placeholder="Sunday braai in the park" data-testid="input-official-title" /></Row>
          <Row label="Description">
            <textarea style={{ ...input, minHeight: 70 }} value={form.description} onChange={set("description")} placeholder="What it is, who it's for, what to expect" />
          </Row>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Row label="Kind">
              <select style={input} value={form.kind} onChange={set("kind")}>
                {EVENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Row>
            <Row label="Place type">
              <select style={input} value={form.placeType} onChange={set("placeType")}>
                {EVENT_PLACE_TYPES.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Row>
            <Row label="Venue"><input style={input} value={form.venueName} onChange={set("venueName")} placeholder="Harare Gardens" /></Row>
            <Row label="Suburb"><input style={input} value={form.suburb} onChange={set("suburb")} placeholder="Avondale" data-testid="input-official-suburb" /></Row>
            <Row label="City"><input style={input} value={form.city} onChange={set("city")} data-testid="input-official-city" /></Row>
            <Row label="Starts (at least 72h from now)">
              <input type="datetime-local" min={earliest} style={input} value={form.startsAt} onChange={set("startsAt")} data-testid="input-official-starts" />
            </Row>
            <Row label="Minimum going"><input type="number" min={2} style={input} value={form.minGoing} onChange={set("minGoing")} /></Row>
            <Row label="Seat limit (blank = open)"><input type="number" min={2} style={input} value={form.seatCount} onChange={set("seatCount")} /></Row>
            <Row label="Sponsor name (optional)"><input style={input} value={form.sponsorName} onChange={set("sponsorName")} /></Row>
            <Row label="Sponsor logo URL (optional)"><input style={input} value={form.sponsorLogoUrl} onChange={set("sponsorLogoUrl")} /></Row>
          </div>
          <Row label="Cover image URL (optional)"><input style={input} value={form.coverImageUrl} onChange={set("coverImageUrl")} /></Row>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={create} disabled={creating} style={{ ...btn, background: "#2E7D5B", color: "#fff", border: "none" }} data-testid="button-create-official">
              {creating ? "Publishing…" : "Publish event"}
            </button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={{ ...btn, background: "transparent", color: MUTED, border: `1px solid ${LINE}` }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : events.length === 0 ? (
        <p style={{ color: FAINT, fontSize: 13 }}>No official events yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {events.map((ev) => {
            const pending = (ev.applications || []).filter((a: any) => a.status === "pending");
            const cancelled = ev.status === "cancelled";
            const past = new Date(ev.startsAt).getTime() < Date.now();
            return (
              <div key={ev.id} style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, padding: 14, opacity: past && !cancelled ? 0.7 : 1 }} data-testid={`official-event-${ev.id}`}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, color: TEXT, fontWeight: 600 }}>{ev.title}</div>
                    <div style={{ ...LABEL, marginTop: 4 }}>
                      {[ev.venueName, ev.suburb, ev.city].filter(Boolean).join(" · ")} · {formatDateTime(ev.startsAt)}
                    </div>
                    {ev.sponsorName && <div style={{ ...LABEL, marginTop: 2 }}>Presented by {ev.sponsorName}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ ...LABEL, color: cancelled ? EMBER : MUTED }}>{cancelled ? "Called off" : past ? "Past" : "Live"}</div>
                    <div style={{ fontSize: 13, color: TEXT }} data-testid={`official-going-${ev.id}`}>
                      {ev.goingCount} / {ev.minGoing ?? 5} going
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 8, fontSize: 13, color: TEXT }}>
                  <span style={{ color: MUTED }}>Lead: </span>
                  {ev.leadName ? <strong data-testid={`official-lead-${ev.id}`}>{ev.leadName}</strong> : <span style={{ color: cancelled ? FAINT : EMBER }}>none yet</span>}
                </div>
                {cancelled && ev.cancelReason && (
                  <div style={{ marginTop: 6, fontSize: 12.5, color: MUTED }}>{ev.cancelReason}</div>
                )}

                {!cancelled && !ev.leadUserId && pending.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ ...LABEL, color: MUTED }}>Offers to lead ({pending.length})</div>
                    {pending.map((a: any) => (
                      <div key={a.id} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: 10 }} data-testid={`lead-app-${a.id}`}>
                        <div style={{ fontSize: 13.5, color: TEXT, fontWeight: 600 }}>{a.name}</div>
                        {a.note && <div style={{ fontSize: 13, color: MUTED, marginTop: 3, whiteSpace: "pre-wrap" }}>{a.note}</div>}
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button
                            disabled={busy === `a${a.id}`}
                            onClick={() => run(`a${a.id}`, () => adminPost(`/api/admin/events/${ev.id}/lead/${a.id}/approve`), "Failed to approve")}
                            style={{ ...btn, background: "#2E7D5B", color: "#fff", border: "none" }}
                            data-testid={`button-approve-lead-${a.id}`}
                          >
                            Make lead
                          </button>
                          <button
                            disabled={busy === `r${a.id}`}
                            onClick={() => run(`r${a.id}`, () => adminPost(`/api/admin/events/${ev.id}/lead/${a.id}/reject`), "Failed to reject")}
                            style={{ ...btn, background: "transparent", color: EMBER, border: `1px solid ${EMBER}66` }}
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!cancelled && !ev.leadUserId && assignFor !== ev.id && (
                    <button onClick={() => { setAssignFor(ev.id); setError(null); }} style={{ ...btn, background: "transparent", color: TEXT, border: `1px solid ${LINE}` }}>
                      Assign a lead by email
                    </button>
                  )}
                  {cancelled && repostFor !== ev.id && (
                    <button
                      onClick={() => { setRepostFor(ev.id); setRepostDate(toLocalInput(new Date(Date.now() + 7 * 24 * 3600 * 1000))); setError(null); }}
                      style={{ ...btn, background: EMBER, color: "#14101C", border: "none" }}
                      data-testid={`button-repost-${ev.id}`}
                    >
                      Repost for another date
                    </button>
                  )}
                </div>

                {assignFor === ev.id && (
                  <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                    <input style={{ ...input, flex: 1 }} value={assignEmail} onChange={(e) => setAssignEmail(e.target.value)} placeholder="member@email.com" />
                    <button
                      disabled={busy === `s${ev.id}`}
                      onClick={() => run(`s${ev.id}`, () => adminPost(`/api/admin/events/${ev.id}/assign-lead`, { email: assignEmail }), "Failed to assign", () => { setAssignFor(null); setAssignEmail(""); })}
                      style={{ ...btn, background: "#2E7D5B", color: "#fff", border: "none" }}
                    >
                      Assign
                    </button>
                    <button onClick={() => setAssignFor(null)} style={{ ...btn, background: "transparent", color: MUTED, border: `1px solid ${LINE}` }}>Cancel</button>
                  </div>
                )}
                {repostFor === ev.id && (
                  <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                    <input type="datetime-local" min={earliest} style={{ ...input, flex: 1 }} value={repostDate} onChange={(e) => setRepostDate(e.target.value)} />
                    <button
                      disabled={busy === `p${ev.id}`}
                      onClick={() => run(`p${ev.id}`, () => adminPost(`/api/admin/events/${ev.id}/repost`, { startsAt: new Date(repostDate).toISOString() }), "Failed to repost", () => setRepostFor(null))}
                      style={{ ...btn, background: "#2E7D5B", color: "#fff", border: "none" }}
                    >
                      Repost
                    </button>
                    <button onClick={() => setRepostFor(null)} style={{ ...btn, background: "transparent", color: MUTED, border: `1px solid ${LINE}` }}>Cancel</button>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ ...LABEL, color: MUTED }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: "8px 10px",
  color: TEXT,
  fontSize: 13,
};

const btn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 8,
  cursor: "pointer",
};
