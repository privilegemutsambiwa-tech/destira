import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPatch, adminPost } from "./api";
import { PageHeader, StatTile, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, ALERT, useStepUp } from "./AdminShell";

// Destira Crown (server/admin/crown.ts): applications, members, seat cap.
type Row = {
  userId: string;
  status: "applied" | "approved" | "declined" | "active" | "revoked";
  city: string;
  note: string | null;
  appliedAt: string | null;
  decidedAt: string | null;
  reason: string | null;
  activeUntil: string | null;
  displayName: string | null;
  age: number | null;
  location: string | null;
  isVerified: boolean | null;
  moderationStatus: string | null;
  email: string | null;
  joinedAt: string | null;
  photoIds: number[];
  active: boolean;
  holdLapsed: boolean;
};
type Data = { settings: { seatCap: number; open: boolean }; seatsTaken: number; holdDays: number; rows: Row[] };

const GOLD = "#E9B949";
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "–");

const patchSettings = (body: unknown) => adminPatch("/api/admin/crown/settings", body);

export default function AdminCrown() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Data>({ queryKey: ["admin", "crown"], queryFn: () => adminGet("/api/admin/crown") });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "crown"] });
    qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  };
  const act = useMutation({
    mutationFn: ({ userId, action, reason }: { userId: string; action: "approve" | "decline" | "revoke"; reason?: string }) =>
      adminPost(`/api/admin/crown/${userId}/${action}`, reason ? { reason } : {}),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: any) => setError(e?.message ?? "That didn't work"),
  });
  const stepUp = useStepUp();
  const [cap, setCap] = useState<string>("");
  const saveCap = useMutation({ mutationFn: patchSettings, onSuccess: refresh, onError: (e: any) => setError(e.message) });

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;
  const applied = data.rows.filter((r) => r.status === "applied");
  const approved = data.rows.filter((r) => r.status === "approved");
  const members = data.rows.filter((r) => r.status === "active");
  const closed = data.rows.filter((r) => r.status === "declined" || r.status === "revoked");

  const decline = (r: Row) => {
    const reason = window.prompt(`Why is ${r.displayName ?? "this member"} not right for Crown now? They'll see this.`);
    if (reason) act.mutate({ userId: r.userId, action: "decline", reason });
  };
  const revoke = (r: Row) => {
    const reason = window.prompt(`Why is ${r.displayName ?? "this member"} losing the crown? They'll see this. No refund.`);
    if (!reason) return;
    stepUp(() => act.mutateAsync({ userId: r.userId, action: "revoke", reason })).catch(() => {});
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="Crown" sub="The $100 membership. Verified members apply; the team approves; only then can they pay. Seats left is the real count." />
      {error && (
        <div role="alert" style={{ border: `1px solid ${ALERT}66`, background: `${ALERT}14`, color: TEXT, padding: "10px 12px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
        <StatTile label="Crown members" value={members.filter((m) => m.active).length} trend={`${members.filter((m) => !m.active).length} lapsed`} testId="crown-members" />
        <StatTile label="Seats left" value={Math.max(0, data.settings.seatCap - data.seatsTaken)} trend={`of ${data.settings.seatCap}; approvals hold one for ${data.holdDays} days`} testId="crown-seats" />
        <StatTile label="Applications" value={applied.length} trend={data.settings.open ? "applications open" : "applications closed"} testId="crown-applied" />
        <StatTile label="Approved, not paid" value={approved.length} trend={`${approved.filter((a) => a.holdLapsed).length} past the hold`} testId="crown-approved" />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <label style={{ ...LABEL, color: MUTED }} htmlFor="crown-cap">Seat cap</label>
        <input
          id="crown-cap"
          type="number"
          min={0}
          placeholder={String(data.settings.seatCap)}
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          style={{ width: 90, background: SURFACE, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 6, padding: "6px 8px", ...MONO }}
          data-testid="input-crown-cap"
        />
        <button style={btn()} disabled={!cap || saveCap.isPending} onClick={() => saveCap.mutate({ seatCap: Number(cap) }, { onSuccess: () => setCap("") })} data-testid="button-crown-cap">
          Save
        </button>
        <button style={btn()} onClick={() => saveCap.mutate({ open: !data.settings.open })} data-testid="button-crown-open">
          {data.settings.open ? "Close applications" : "Open applications"}
        </button>
      </div>

      <Section title={`Applications (${applied.length})`} empty="No applications waiting.">
        {applied.map((r) => (
          <Card key={r.userId} r={r}>
            <button style={btn(GOLD)} disabled={act.isPending || !r.isVerified} onClick={() => act.mutate({ userId: r.userId, action: "approve" })} data-testid={`crown-approve-${r.userId}`}>
              Approve
            </button>
            <button style={btn()} disabled={act.isPending} onClick={() => decline(r)} data-testid={`crown-decline-${r.userId}`}>
              Decline
            </button>
          </Card>
        ))}
      </Section>

      <Section title={`Approved, waiting to pay (${approved.length})`} empty="Nobody is between approval and payment.">
        {approved.map((r) => (
          <Card key={r.userId} r={r} extra={r.holdLapsed ? "Hold lapsed: their seat is free again" : `Approved ${day(r.decidedAt)}`}>
            <button style={btn()} disabled={act.isPending} onClick={() => decline(r)}>Withdraw</button>
          </Card>
        ))}
      </Section>

      <Section title={`Members (${members.length})`} empty="No Crown members yet.">
        {members.map((r) => (
          <Card key={r.userId} r={r} extra={r.active ? `Crown until ${day(r.activeUntil)}` : `Lapsed ${day(r.activeUntil)}`}>
            <button style={btn(ALERT)} disabled={act.isPending} onClick={() => revoke(r)} data-testid={`crown-revoke-${r.userId}`}>
              Revoke
            </button>
          </Card>
        ))}
      </Section>

      <Section title={`Declined and revoked (${closed.length})`} empty="None.">
        {closed.map((r) => (
          <Card key={r.userId} r={r} extra={`${r.status === "declined" ? "Declined" : "Revoked"} ${day(r.decidedAt)}: ${r.reason ?? ""}`} />
        ))}
      </Section>
    </div>
  );
}

function Card({ r, extra, children }: { r: Row; extra?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: 14, borderTop: `1px solid ${LINE}`, alignItems: "flex-start", flexWrap: "wrap" }} data-testid={`crown-row-${r.userId}`}>
      <div style={{ display: "flex", gap: 6 }}>
        {r.photoIds.slice(0, 3).map((id) => (
          <a key={id} href={`/api/admin/crown/${r.userId}/photo/${id}`} target="_blank" rel="noreferrer">
            <img src={`/api/admin/crown/${r.userId}/photo/${id}`} alt="" width={72} height={96} style={{ objectFit: "cover", borderRadius: 6, border: `1px solid ${LINE}` }} />
          </a>
        ))}
        {r.photoIds.length === 0 && <div style={{ width: 72, height: 96, borderRadius: 6, border: `1px dashed ${LINE}`, color: FAINT, fontSize: 11, display: "grid", placeItems: "center" }}>no photo</div>}
      </div>
      <div style={{ flex: "1 1 280px", minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>
          {r.displayName ?? "No profile name"}
          {r.age ? `, ${r.age}` : ""}
          {r.isVerified ? <span style={{ ...LABEL, color: "#2E7D5B", marginLeft: 8 }}>verified</span> : <span style={{ ...LABEL, color: ALERT, marginLeft: 8 }}>not verified</span>}
          {r.moderationStatus && r.moderationStatus !== "active" ? <span style={{ ...LABEL, color: ALERT, marginLeft: 8 }}>{r.moderationStatus}</span> : null}
        </div>
        <div style={{ ...MONO, fontSize: 11.5, color: FAINT, marginTop: 2 }}>
          {[r.location, r.email, `joined ${day(r.joinedAt)}`, `applied ${day(r.appliedAt)}`].filter(Boolean).join(" · ")}
        </div>
        {r.note && <p style={{ fontSize: 13.5, color: MUTED, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>“{r.note}”</p>}
        {extra && <div style={{ fontSize: 12.5, color: FAINT, marginTop: 6 }}>{extra}</div>}
      </div>
      {children && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{children}</div>}
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ ...LABEL, color: MUTED, marginBottom: 8 }}>{title}</div>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, overflow: "hidden" }}>
        {has ? children : <p style={{ color: FAINT, padding: 14, margin: 0, fontSize: 13 }}>{empty}</p>}
      </div>
    </div>
  );
}

function btn(color: string = MUTED): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 8, cursor: "pointer", background: "transparent", color: color === MUTED ? TEXT : color, border: `1px solid ${color === MUTED ? LINE : `${color}88`}` };
}

