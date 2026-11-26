import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost } from "./api";
import { PageHeader, StatTile, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, ALERT } from "./AdminShell";
import { CROWN_DINNER_SEATS_MAX, CROWN_DINNER_SEATS_MIN } from "@shared/crown-table";

// Crown Table dinners (server/admin/crown-table.ts): set one up at a partner
// venue, see who's coming, call it off with a reason.
type Person = { userId: string; name: string; status: string; guestOf: string | null };
type Dinner = {
  id: number; title: string; venueName: string; venueDetail: string | null; startsAt: string; seats: number; note: string | null;
  status: "scheduled" | "cancelled"; cancelReason: string | null; held: number; people: Person[];
};
type Venue = { id: number; name: string; suburb: string; city: string; partnerOffer: string | null };
type Data = { crownMembers: number; venues: Venue[]; dinners: Dinner[] };

const GOLD = "#E9B949";
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const input: React.CSSProperties = { background: SURFACE, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, fontFamily: "inherit" };

export default function AdminCrownTable() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Data>({ queryKey: ["admin", "crown-table"], queryFn: () => adminGet("/api/admin/crown-table") });
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", placeId: "", startsAt: "", seats: "12", note: "" });
  const refresh = () => { setError(null); qc.invalidateQueries({ queryKey: ["admin", "crown-table"] }); };
  const create = useMutation({
    mutationFn: () => adminPost("/api/admin/crown-table", { ...form, placeId: Number(form.placeId), seats: Number(form.seats), startsAt: new Date(form.startsAt).toISOString() }),
    onSuccess: () => { setForm({ title: "", placeId: "", startsAt: "", seats: "12", note: "" }); refresh(); },
    onError: (e: any) => setError(e?.message ?? "That didn't work"),
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => adminPost(`/api/admin/crown-table/${id}/cancel`, { reason }),
    onSuccess: refresh,
    onError: (e: any) => setError(e?.message ?? "That didn't work"),
  });

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;
  const now = Date.now();
  const upcoming = data.dinners.filter((d) => new Date(d.startsAt).getTime() > now).reverse();
  const past = data.dinners.filter((d) => new Date(d.startsAt).getTime() <= now);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="Crown Table" sub="A private monthly dinner at a partner venue. Crown members take a seat and may bring one guest from their matches. Everyone pays the venue for their own food." />
      {error && <div role="alert" style={{ border: `1px solid ${ALERT}66`, background: `${ALERT}14`, color: TEXT, padding: "10px 12px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
        <StatTile label="Crown members" value={data.crownMembers} trend="told about each new dinner" testId="ct-members" />
        <StatTile label="Coming up" value={upcoming.filter((d) => d.status === "scheduled").length} trend={`${data.venues.length} partner venues to pick from`} testId="ct-upcoming" />
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ ...LABEL, color: MUTED, marginBottom: 8 }}>Set up a dinner</div>
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, padding: 14, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          <input style={input} placeholder="December dinner" value={form.title} onChange={set("title")} data-testid="ct-title" />
          <select style={input} value={form.placeId} onChange={set("placeId")} data-testid="ct-venue">
            <option value="">Partner venue…</option>
            {data.venues.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.suburb}</option>)}
          </select>
          <input style={input} type="datetime-local" value={form.startsAt} onChange={set("startsAt")} data-testid="ct-when" />
          <input style={input} type="number" min={CROWN_DINNER_SEATS_MIN} max={CROWN_DINNER_SEATS_MAX} value={form.seats} onChange={set("seats")} data-testid="ct-seats" />
          <textarea style={{ ...input, gridColumn: "1 / -1" }} rows={2} placeholder="A note for everyone (dress, menu, parking)…" value={form.note} onChange={set("note")} data-testid="ct-note" />
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center" }}>
            <button style={btn(GOLD)} disabled={create.isPending || !form.title || !form.placeId || !form.startsAt} onClick={() => create.mutate()} data-testid="ct-create">Set it up and tell Crown members</button>
            {!data.venues.length && <span style={{ fontSize: 12.5, color: FAINT }}>Add a partner venue under Venue partners first.</span>}
          </div>
        </div>
      </div>

      <Section title={`Coming up (${upcoming.length})`} empty="No dinners set.">
        {upcoming.map((d) => <DinnerRow key={d.id} d={d} onCancel={(reason) => cancel.mutate({ id: d.id, reason })} busy={cancel.isPending} />)}
      </Section>
      <Section title={`Earlier (${past.length})`} empty="None yet.">
        {past.map((d) => <DinnerRow key={d.id} d={d} />)}
      </Section>
    </div>
  );
}

function DinnerRow({ d, onCancel, busy }: { d: Dinner; onCancel?: (reason: string) => void; busy?: boolean }) {
  const going = d.people.filter((p) => p.status === "going");
  const label: Record<string, string> = { going: "", invited: " (asked)", declined: " (can't make it)" };
  return (
    <div style={{ padding: 14, borderTop: `1px solid ${LINE}` }} data-testid={`ct-dinner-${d.id}`}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>
            {d.title}
            {d.status === "cancelled" && <span style={{ ...LABEL, color: ALERT, marginLeft: 8 }}>off</span>}
          </div>
          <div style={{ ...MONO, fontSize: 11.5, color: FAINT, marginTop: 2 }}>{when(d.startsAt)} · {d.venueName} · {d.held} of {d.seats} seats held · {going.length} going</div>
          {d.note && <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>{d.note}</div>}
          {d.cancelReason && <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>Called off: {d.cancelReason}</div>}
          {d.people.length > 0 && (
            <div style={{ fontSize: 13, color: TEXT, marginTop: 8, lineHeight: 1.6 }} data-testid={`ct-people-${d.id}`}>
              {d.people.map((p) => `${p.name}${p.guestOf ? ` (${p.guestOf}'s guest)` : ""}${label[p.status] ?? ""}`).join(" · ")}
            </div>
          )}
        </div>
        {onCancel && d.status === "scheduled" && (
          <button style={btn(ALERT)} disabled={busy} onClick={() => { const r = window.prompt("Why is it off? Everyone with a seat will read this."); if (r) onCancel(r); }} data-testid={`ct-cancel-${d.id}`}>
            Call it off
          </button>
        )}
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
  return { fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 8, cursor: "pointer", background: "transparent", color: color === MUTED ? TEXT : color, border: `1px solid ${color === MUTED ? LINE : `${color}88`}` };
}
