import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPatch } from "./api";
import { PageHeader, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER } from "./AdminShell";
import { PARTNER_OFFER_MAX, type AdminPlace } from "@shared/event-extras";

// Venue partners (Part J): a place that gives Destira members something.
// The offer shows on events there and in "Let's meet" date suggestions.

const field: React.CSSProperties = { height: 34, borderRadius: 6, border: `1px solid ${LINE}`, background: SURFACE, color: TEXT, fontSize: 13, padding: "0 10px" };
const btn = (primary = false): React.CSSProperties => ({
  height: 34, padding: "0 14px", borderRadius: 6, fontSize: 12.5, cursor: "pointer",
  border: `1px solid ${primary ? EMBER : LINE}`, background: primary ? EMBER : SURFACE, color: primary ? "#0C0910" : TEXT, fontWeight: primary ? 600 : 400,
});

function Row({ p, onSaved }: { p: AdminPlace; onSaved: () => void }) {
  const [offer, setOffer] = useState(p.partnerOffer ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (value: string) => {
    setBusy(true); setErr(null);
    try { await adminPatch(`/api/admin/places/${p.id}/partner`, { offer: value }); onSaved(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ borderBottom: `1px solid ${LINE}`, padding: "12px 0", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }} data-testid={`partner-row-${p.id}`}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ color: TEXT, fontSize: 14 }}>{p.name} {p.partnerOffer && <span style={{ color: "#E2B45A", fontSize: 11.5, marginLeft: 6 }}>PARTNER</span>}</div>
        <div style={{ color: FAINT, fontSize: 12 }}>{p.suburb}, {p.city} · {p.placeType}</div>
      </div>
      <input value={offer} onChange={(e) => setOffer(e.target.value.slice(0, PARTNER_OFFER_MAX))} placeholder="e.g. 10% off for Destira members"
        style={{ ...field, flex: "2 1 260px" }} data-testid={`partner-offer-${p.id}`} />
      <button style={btn(true)} disabled={busy || !offer.trim() || offer.trim() === p.partnerOffer} onClick={() => save(offer)} data-testid={`partner-save-${p.id}`}>
        {p.partnerOffer ? "Update" : "Make partner"}
      </button>
      {p.partnerOffer && <button style={btn()} disabled={busy} onClick={() => { setOffer(""); save(""); }} data-testid={`partner-clear-${p.id}`}>Remove</button>}
      {err && <div style={{ color: EMBER, fontSize: 12, width: "100%" }}>{err}</div>}
    </div>
  );
}

export default function AdminPartners() {
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const key = ["admin-places", q];
  const { data, isLoading } = useQuery<AdminPlace[]>({ queryKey: key, queryFn: () => adminGet(`/api/admin/places?q=${encodeURIComponent(q)}`) });
  return (
    <div>
      <PageHeader title="Venue partners" sub="Places that give Destira members something. The offer shows on events there and in date suggestions." />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search places or suburbs" style={{ ...field, width: "100%", maxWidth: 360, marginBottom: 12 }} data-testid="partner-search" />
      {isLoading ? <p style={{ color: MUTED }}>Loading…</p> : (data ?? []).map((p) => (
        <Row key={`${p.id}-${p.partnerOffer ?? ""}`} p={p} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-places"] })} />
      ))}
      {data && !data.length && <p style={{ color: MUTED }}>No places match.</p>}
    </div>
  );
}
