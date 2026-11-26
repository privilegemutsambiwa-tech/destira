import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPatch, adminPost } from "./api";
import { PageHeader, StatTile, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, ALERT } from "./AdminShell";
import type { VoucherItem } from "@shared/date-vouchers";

// Date on me (server/admin/date-vouchers.ts): each partner venue's menu and
// till PIN, refunds to send back by hand, and what each venue is owed per month.
type V = { id: number; code: string; crownName: string; venueName: string; itemLabel: string; amountCents: number; status: string; paidAt: string | null; redeemedAt: string | null; refundReason: string | null; refundNote: string | null };
type Data = {
  currentMonth: string;
  venues: { id: number; name: string; suburb: string; partnerOffer: string | null; items: VoucherItem[]; pinSet: boolean }[];
  refundsDue: (V & { paidWith: string | null; paymentRef: string | null })[];
  payouts: { placeId: number; venueName: string; month: string; count: number; cents: number }[];
  recent: V[];
};

const GOLD = "#E9B949";
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "–");
const input: React.CSSProperties = { background: SURFACE, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 8, padding: "6px 9px", fontSize: 13, fontFamily: "inherit" };

export default function AdminDateOnMe() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Data>({ queryKey: ["admin", "date-on-me"], queryFn: () => adminGet("/api/admin/date-on-me") });
  const [error, setError] = useState<string | null>(null);
  const [pinShown, setPinShown] = useState<{ venue: string; pin: string } | null>(null);
  const refresh = () => { setError(null); qc.invalidateQueries({ queryKey: ["admin", "date-on-me"] }); qc.invalidateQueries({ queryKey: ["admin", "overview"] }); };
  const onError = (e: any) => setError(e?.message ?? "That didn't work");
  const pin = useMutation({ mutationFn: (v: { id: number; name: string }) => adminPost(`/api/admin/date-on-me/venues/${v.id}/pin`, {}).then((r: any) => ({ ...r, name: v.name })), onSuccess: (r: any) => { setPinShown({ venue: r.name, pin: r.pin }); refresh(); }, onError });
  const refunded = useMutation({ mutationFn: ({ id, note }: { id: number; note: string }) => adminPost(`/api/admin/date-on-me/vouchers/${id}/refunded`, { note }), onSuccess: refresh, onError });
  const payout = useMutation({ mutationFn: (b: { placeId: number; month: string; note: string }) => adminPost("/api/admin/date-on-me/payouts", b), onSuccess: refresh, onError });

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;
  const owed = data.payouts.reduce((s, p) => s + p.cents, 0);
  const refundCents = data.refundsDue.reduce((s, r) => s + r.amountCents, 0);

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="Date on me" sub="Crown members prepay something at a partner venue for a date. Venues check codes at /redeem with their PIN; we pay them monthly for vouchers used. Unused after 30 days, or the date called off: refund the member by hand, then record it here." />
      {error && <div role="alert" style={{ border: `1px solid ${ALERT}66`, background: `${ALERT}14`, color: TEXT, padding: "10px 12px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}
      {pinShown && (
        <div style={{ border: `1px solid ${GOLD}88`, background: `${GOLD}14`, color: TEXT, padding: "10px 12px", borderRadius: 8, marginBottom: 14, fontSize: 13.5 }} data-testid="dom-pin-shown">
          New till PIN for {pinShown.venue}: <span style={{ ...MONO, fontSize: 18, letterSpacing: 2 }}>{pinShown.pin}</span>. It's shown once. Give it to the venue's manager; resetting it stops the old one.
          <button style={{ ...btn(), marginLeft: 10 }} onClick={() => setPinShown(null)}>Done</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
        <StatTile label="Refunds to send" value={data.refundsDue.length} trend={money(refundCents)} testId="dom-refunds" />
        <StatTile label="Owed to venues" value={money(owed)} trend={`${data.payouts.reduce((s, p) => s + p.count, 0)} vouchers used, not paid out`} testId="dom-owed" />
        <StatTile label="Partner venues" value={data.venues.length} trend={`${data.venues.filter((v) => v.items.length && v.pinSet).length} ready for Date on me`} testId="dom-venues" />
      </div>

      <Section title={`Refunds to send (${data.refundsDue.length})`} empty="Nothing to refund.">
        {data.refundsDue.map((r) => <RefundRow key={r.id} r={r} busy={refunded.isPending} onDone={(note) => refunded.mutate({ id: r.id, note })} />)}
      </Section>

      <Section title="Owed to venues" empty="No used vouchers waiting to be paid out.">
        {data.payouts.map((p) => (
          <PayoutRow key={`${p.placeId}:${p.month}`} p={p} current={p.month >= data.currentMonth} busy={payout.isPending} onPay={(note) => payout.mutate({ placeId: p.placeId, month: p.month, note })} />
        ))}
      </Section>

      <Section title="Partner venues" empty="No partner venues yet. Add one under Venue partners.">
        {data.venues.map((v) => (
          <VenueRow key={v.id} v={v} onSaved={refresh} onError={setError} onPin={() => { if (!v.pinSet || window.confirm(`Reset ${v.name}'s till PIN? The old one stops working.`)) pin.mutate({ id: v.id, name: v.name }); }} />
        ))}
      </Section>

      <Section title="Recent vouchers" empty="None yet.">
        {data.recent.map((r) => (
          <div key={r.id} style={{ padding: "10px 14px", borderTop: `1px solid ${LINE}`, fontSize: 13, color: TEXT }} data-testid={`dom-voucher-${r.id}`}>
            <span style={MONO}>{r.code}</span> · {r.crownName} · {r.itemLabel} at {r.venueName} · {money(r.amountCents)} · <span style={{ color: MUTED }}>{r.status === "redeemed" ? `used ${day(r.redeemedAt)}` : r.status === "refunded" ? `refunded (${r.refundNote})` : `paid ${day(r.paidAt)}`}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

function RefundRow({ r, busy, onDone }: { r: Data["refundsDue"][number]; busy: boolean; onDone: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div style={{ padding: 14, borderTop: `1px solid ${LINE}` }} data-testid={`dom-refund-${r.id}`}>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT }}>{money(r.amountCents)} to {r.crownName}</div>
      <div style={{ ...MONO, fontSize: 11.5, color: FAINT, marginTop: 2 }}>{r.code} · {r.itemLabel} at {r.venueName} · paid {day(r.paidAt)}{r.paidWith ? ` with ${r.paidWith}` : ""}{r.paymentRef ? ` · ref ${r.paymentRef}` : ""}</div>
      <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{r.refundReason}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input style={{ ...input, flex: "1 1 240px" }} placeholder="How it was sent back (EcoCash reference)" value={note} onChange={(e) => setNote(e.target.value)} data-testid={`dom-refund-note-${r.id}`} />
        <button style={btn(GOLD)} disabled={busy || note.trim().length < 3} onClick={() => onDone(note.trim())} data-testid={`dom-refunded-${r.id}`}>Mark refunded</button>
      </div>
    </div>
  );
}

function PayoutRow({ p, current, busy, onPay }: { p: Data["payouts"][number]; current: boolean; busy: boolean; onPay: (note: string) => void }) {
  const [note, setNote] = useState("");
  const label = new Date(`${p.month}-15`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return (
    <div style={{ padding: 14, borderTop: `1px solid ${LINE}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }} data-testid={`dom-payout-${p.placeId}-${p.month}`}>
      <div style={{ flex: "1 1 260px" }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT }}>{p.venueName}: {money(p.cents)}</div>
        <div style={{ ...MONO, fontSize: 11.5, color: FAINT }}>{label} · {p.count} voucher{p.count === 1 ? "" : "s"} used{current ? " · month still running" : ""}</div>
      </div>
      {!current && (
        <>
          <input style={{ ...input, flex: "1 1 200px" }} placeholder="Bank or EcoCash reference" value={note} onChange={(e) => setNote(e.target.value)} />
          <button style={btn(GOLD)} disabled={busy || note.trim().length < 3} onClick={() => onPay(note.trim())}>Mark paid</button>
        </>
      )}
    </div>
  );
}

function VenueRow({ v, onSaved, onError, onPin }: { v: Data["venues"][number]; onSaved: () => void; onError: (s: string) => void; onPin: () => void }) {
  const [items, setItems] = useState<{ label: string; price: string }[]>(v.items.map((i) => ({ label: i.label, price: (i.cents / 100).toFixed(2) })));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await adminPatch(`/api/admin/date-on-me/venues/${v.id}/items`, { items: items.filter((i) => i.label.trim()).map((i) => ({ label: i.label, cents: Math.round(Number(i.price) * 100) })) });
      onSaved();
    } catch (e: any) {
      onError(e?.message ?? "Couldn't save");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div style={{ padding: 14, borderTop: `1px solid ${LINE}` }} data-testid={`dom-venue-${v.id}`}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", fontSize: 14.5, fontWeight: 600, color: TEXT }}>
          {v.name} <span style={{ ...MONO, fontSize: 11.5, color: FAINT, fontWeight: 400 }}>{v.suburb}</span>
          <span style={{ ...LABEL, color: v.pinSet ? "#2E7D5B" : ALERT, marginLeft: 8 }}>{v.pinSet ? "till PIN set" : "no till PIN"}</span>
        </div>
        <button style={btn()} onClick={onPin} data-testid={`dom-pin-${v.id}`}>{v.pinSet ? "Reset till PIN" : "Make a till PIN"}</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 6 }}>
            <input style={{ ...input, flex: 1 }} placeholder="Coffee and cake for two" value={it.label} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} data-testid={`dom-item-label-${v.id}-${i}`} />
            <input style={{ ...input, width: 90 }} placeholder="8.00" inputMode="decimal" value={it.price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} data-testid={`dom-item-price-${v.id}-${i}`} />
            <button style={btn()} onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          {items.length < 6 && <button style={btn()} onClick={() => setItems([...items, { label: "", price: "" }])} data-testid={`dom-item-add-${v.id}`}>Add to the menu</button>}
          <button style={btn(GOLD)} disabled={saving} onClick={save} data-testid={`dom-items-save-${v.id}`}>Save menu</button>
        </div>
        <div style={{ fontSize: 12, color: FAINT }}>Crown member prices, agreed with the venue. Destira collects these and pays the venue the same amount for each one used.</div>
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
