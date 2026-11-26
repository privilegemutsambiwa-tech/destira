import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost } from "./api";
import { PageHeader, StatTile, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, ALERT } from "./AdminShell";

// Paid event tickets (server/admin/event-tickets.ts): refunds to send back
// by hand (the host cancelled, or the seat went while someone paid), and each
// host's share once their event is over: the ticket total less Destira's 10%,
// due within 3 days.
type Data = {
  refundsDue: { id: number; buyerName: string; eventId: number; eventTitle: string; startsAt: string; amountCents: number; reason: string | null; paidAt: string; paidWith: string | null; paymentRef: string | null }[];
  payouts: { eventId: number; title: string; hostName: string; payoutNumber: string | null; sold: number; grossCents: number; feeCents: number; hostCents: number; endedAt: string; dueBy: string; overdue: boolean }[];
  upcoming: { eventId: number; title: string; hostName: string; startsAt: string; priceCents: number; sold: number; grossCents: number; hostCents: number }[];
  paidOut: { eventId: number; title: string; hostName: string; cents: number; paidOutAt: string; note: string | null }[];
};

const GOLD = "#E9B949";
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const input: React.CSSProperties = { background: SURFACE, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 8, padding: "6px 9px", fontSize: 13, fontFamily: "inherit" };

export default function AdminTickets() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Data>({ queryKey: ["admin", "tickets"], queryFn: () => adminGet("/api/admin/tickets") });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => { setError(null); qc.invalidateQueries({ queryKey: ["admin", "tickets"] }); qc.invalidateQueries({ queryKey: ["admin", "overview"] }); };
  const onError = (e: any) => setError(e?.message ?? "That didn't work");
  const refunded = useMutation({ mutationFn: ({ id, note }: { id: number; note: string }) => adminPost(`/api/admin/tickets/${id}/refunded`, { note }), onSuccess: refresh, onError });
  const paid = useMutation({ mutationFn: ({ id, note }: { id: number; note: string }) => adminPost(`/api/admin/tickets/events/${id}/paid-out`, { note }), onSuccess: refresh, onError });

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;
  const refundCents = data.refundsDue.reduce((s, r) => s + r.amountCents, 0);
  const owed = data.payouts.reduce((s, p) => s + p.hostCents, 0);
  const held = data.upcoming.reduce((s, u) => s + u.grossCents, 0);

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="Tickets" sub="Members pay Destira for tickets through Paynow and get their seat once it's paid. Destira keeps 10%; send each host the rest within 3 days after their event, then record it here. If an event is called off, every ticket is refunded in full: send it back by hand and record it." />
      {error && <div role="alert" style={{ border: `1px solid ${ALERT}66`, background: `${ALERT}14`, color: TEXT, padding: "10px 12px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
        <StatTile label="Refunds to send" value={data.refundsDue.length} trend={money(refundCents)} testId="tickets-refunds" />
        <StatTile label="Owed to hosts" value={money(owed)} trend={`${data.payouts.length} event${data.payouts.length === 1 ? "" : "s"} over${data.payouts.some((p) => p.overdue) ? ", some overdue" : ""}`} testId="tickets-owed" />
        <StatTile label="Held for coming events" value={money(held)} trend={`${data.upcoming.reduce((s, u) => s + u.sold, 0)} tickets sold`} testId="tickets-held" />
      </div>

      <Section title={`Refunds to send (${data.refundsDue.length})`} empty="Nothing to refund.">
        {data.refundsDue.map((r) => <RefundRow key={r.id} r={r} busy={refunded.isPending} onDone={(note) => refunded.mutate({ id: r.id, note })} />)}
      </Section>

      <Section title="Pay the hosts" empty="No finished events waiting for a payout.">
        {data.payouts.map((p) => <PayoutRow key={p.eventId} p={p} busy={paid.isPending} onPay={(note) => paid.mutate({ id: p.eventId, note })} />)}
      </Section>

      <Section title="Coming up" empty="No ticketed events coming up with sales.">
        {data.upcoming.map((u) => (
          <div key={u.eventId} style={{ padding: "10px 14px", borderTop: `1px solid ${LINE}`, fontSize: 13, color: TEXT }} data-testid={`tickets-upcoming-${u.eventId}`}>
            {u.title} · {u.hostName} · {day(u.startsAt)} · {u.sold} × {money(u.priceCents)} = {money(u.grossCents)} <span style={{ color: MUTED }}>(host gets {money(u.hostCents)})</span>
          </div>
        ))}
      </Section>

      <Section title="Paid to hosts" empty="None yet.">
        {data.paidOut.map((p) => (
          <div key={p.eventId} style={{ padding: "10px 14px", borderTop: `1px solid ${LINE}`, fontSize: 13, color: TEXT }}>
            {p.title} · {p.hostName} · {money(p.cents)} · <span style={{ color: MUTED }}>{day(p.paidOutAt)}{p.note ? ` (${p.note})` : ""}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

function RefundRow({ r, busy, onDone }: { r: Data["refundsDue"][number]; busy: boolean; onDone: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div style={{ padding: 14, borderTop: `1px solid ${LINE}` }} data-testid={`tickets-refund-${r.id}`}>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT }}>{money(r.amountCents)} to {r.buyerName}</div>
      <div style={{ ...MONO, fontSize: 11.5, color: FAINT, marginTop: 2 }}>Ticket for {r.eventTitle} ({day(r.startsAt)}) · paid {day(r.paidAt)}{r.paidWith ? ` with ${r.paidWith}` : ""}{r.paymentRef ? ` · ref ${r.paymentRef}` : ""}</div>
      <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{r.reason}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input style={{ ...input, flex: "1 1 240px" }} placeholder="How it was sent back (EcoCash reference)" value={note} onChange={(e) => setNote(e.target.value)} data-testid={`tickets-refund-note-${r.id}`} />
        <button style={btn(GOLD)} disabled={busy || note.trim().length < 3} onClick={() => onDone(note.trim())} data-testid={`tickets-refunded-${r.id}`}>Mark refunded</button>
      </div>
    </div>
  );
}

function PayoutRow({ p, busy, onPay }: { p: Data["payouts"][number]; busy: boolean; onPay: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div style={{ padding: 14, borderTop: `1px solid ${LINE}` }} data-testid={`tickets-payout-${p.eventId}`}>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT }}>
        {money(p.hostCents)} to {p.hostName}{p.payoutNumber ? <span style={{ ...MONO, fontWeight: 400 }}> · EcoCash {p.payoutNumber}</span> : null}
        <span style={{ ...LABEL, color: p.overdue ? ALERT : GOLD, marginLeft: 8 }}>{p.overdue ? "overdue" : `due by ${day(p.dueBy)}`}</span>
      </div>
      <div style={{ ...MONO, fontSize: 11.5, color: FAINT, marginTop: 2 }}>{p.title} · ended {day(p.endedAt)} · {p.sold} ticket{p.sold === 1 ? "" : "s"} = {money(p.grossCents)}, less 10% ({money(p.feeCents)})</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input style={{ ...input, flex: "1 1 240px" }} placeholder="EcoCash reference" value={note} onChange={(e) => setNote(e.target.value)} data-testid={`tickets-payout-note-${p.eventId}`} />
        <button style={btn(GOLD)} disabled={busy || note.trim().length < 3} onClick={() => onPay(note.trim())} data-testid={`tickets-paid-${p.eventId}`}>Mark paid</button>
      </div>
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
