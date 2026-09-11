import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminGet } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER } from "./AdminShell";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: 16, marginBottom: 14 }}>
    <div style={{ ...LABEL, marginBottom: 10 }}>{title}</div>
    {children}
  </div>
);
const Row = ({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${LINE}` }}>
    <span style={{ fontSize: 13, color: MUTED }}>{label}</span>
    <span style={{ textAlign: "right" }}>
      <span style={{ ...MONO, fontSize: 14, color: TEXT }}>{value ?? "—"}</span>
      {note && <div style={{ fontSize: 10.5, color: FAINT }}>{note}</div>}
    </span>
  </div>
);
const fmt = (n: number | null | undefined, suffix = "") => (n == null ? "—" : `${n}${suffix}`);
const fmtUsd = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);

export default function AdminMetrics() {
  const [date, setDate] = useState(() => new Date(Date.now() - 86400000).toISOString().slice(0, 10));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "metrics", "summary", date],
    queryFn: () => adminGet(`/api/admin/metrics/summary?date=${date}`),
  });

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;

  const funnelStages: [string, string][] = [
    ["Signed up", "signup"],
    ["Basics complete", "basics_complete"],
    ["≥1 soul-mapping answer", "soul_answer"],
    ["Twin generated", "twin_generated"],
    ["First interview", "first_interview"],
    ["First match", "first_match"],
  ];

  return (
    <div>
      <PageHeader title="Metrics" sub={`Rollup for ${data.date}. Recomputed nightly — not live.`} />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ height: 32, borderRadius: 6, border: `1px solid ${LINE}`, background: SURFACE, color: TEXT, fontSize: 12.5, padding: "0 8px" }} />
        <button onClick={() => refetch()} style={{ height: 32, padding: "0 10px", borderRadius: 6, border: `1px solid ${LINE}`, background: "transparent", color: MUTED, fontSize: 12, cursor: "pointer" }}>
          Reload
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Section title="Funnel — this cohort's day-of-signup, as of now">
          {funnelStages.map(([label, key]) => (
            <Row key={key} label={label} value={fmt((data.funnel as any)[key])} />
          ))}
          <Row label="Activated within 24h" value={fmt(data.funnel.activationD1Pct, "%")} />
        </Section>

        <Section title="Retention — trailing 30d cohorts">
          <Row label="D1" value={fmt(data.retention.d1Pct, "%")} />
          <Row label="D7" value={fmt(data.retention.d7Pct, "%")} />
          <Row label="D30" value={fmt(data.retention.d30Pct, "%")} note="blank until enough time has passed for that cohort" />
        </Section>

        <Section title="Growth">
          <Row label="Signups (that day)" value={fmt(data.growth.signups?.find((r: any) => r.date === data.date)?.value)} />
          <Row label="DAU" value={fmt(data.growth.dau?.at(-1)?.value)} />
          <Row label="WAU" value={fmt(data.growth.wau?.at(-1)?.value)} />
          <Row label="MAU" value={fmt(data.growth.mau?.at(-1)?.value)} />
        </Section>

        <Section title="Twin layer">
          <Row label="Interviews started" value={fmt(data.twin.interviewsStarted)} />
          <Row label="Interviews completed" value={fmt(data.twin.interviewsCompleted)} />
          <Row label="Abandonment" value={fmt(data.twin.abandonPct, "%")} />
          <Row label="Readiness (avg)" value={fmt(data.twin.readinessAvg, "%")} />
          {Object.entries(data.twin.readinessBuckets || {}).map(([k, v]) => (
            <Row key={k} label={`  ${k.replace("_", "–")}%`} value={fmt(v as number)} />
          ))}
          <Row label="Users w/ any category open" value={fmt(data.twin.disclosureOpenCount)} />
        </Section>

        <Section title="Matching">
          <Row label="Likes sent" value={fmt(data.matching.likesSent)} />
          <Row label="Asks" value={fmt(data.matching.asks)} />
          <Row label="Mutual matches (of that day's asks)" value={fmt(data.matching.mutualMatches)} />
          <Row label="Ask → match" value={fmt(data.matching.askToMatchPct, "%")} />
          <Row label="Zero matches after 14d" value={fmt(data.matching.zeroMatches14dPct, "%")} />
          <Row
            label="Matches with a real resonance score"
            value={fmt(data.matching.resonanceScoredPct, "%")}
            note={data.matching.resonanceScoredPct != null && data.matching.resonanceScoredPct < 5 ? "near-zero: the resonance model isn't wired to real matches — see server/resonance.ts" : undefined}
          />
        </Section>

        <Section title="Money">
          <Row label="MRR" value={fmtUsd(data.money.mrrUsd)} />
          <Row label="ARPU" value={fmtUsd(data.money.arpuUsd)} />
          <Row label="Revenue (that day)" value={fmtUsd(data.money.revenueUsd)} />
          {Object.entries(data.money.paidSubscribersByTier || {}).map(([k, v]) => (
            <Row key={k} label={`Paid subs — ${k}`} value={fmt(v as number)} />
          ))}
          <Row label="Voluntary churn (that day)" value={fmt(data.money.churnVoluntary)} />
          <Row label="Involuntary churn (that day)" value={fmt(data.money.churnInvoluntary)} />
        </Section>

        <Section title="Payment success by method">
          {Object.keys(data.money.paymentSuccessPctByMethod || {}).length === 0 ? (
            <p style={{ fontSize: 12.5, color: FAINT }}>No payments that day.</p>
          ) : (
            Object.entries(data.money.paymentSuccessPctByMethod).map(([k, v]) => <Row key={k} label={k} value={fmt(v as number, "%")} />)
          )}
        </Section>

        <Section title="Conversion by gate — which paywall is selling">
          {Object.keys(data.money.conversionByGate || {}).length === 0 ? (
            <p style={{ fontSize: 12.5, color: FAINT }}>No paid conversions that day.</p>
          ) : (
            Object.entries(data.money.conversionByGate).map(([k, v]) => <Row key={k} label={k} value={fmt(v as number)} />)
          )}
        </Section>

        <Section title="Proximity">
          <Row label="Alerts fired" value={fmt(data.proximity.alertsFired)} />
          <Row label="Seen" value={fmt(data.proximity.alertsSeen)} />
          <Row label="Dismissed" value={fmt(data.proximity.alertsDismissed)} />
          <Row label="Free → paid (cohort proxy)" value={fmt(data.proximity.freeToPaidPct, "%")} />
        </Section>

        <Section title="Events">
          <Row label="Created" value={fmt(data.events.created)} />
          <Row label="Published" value={fmt(data.events.published)} />
          <Row label="RSVPs (going)" value={fmt(data.events.rsvpsGoing)} />
          <Row label="No-show rate" value="—" note="not buildable — no day-of check-in data exists yet" />
        </Section>

        <Section title="Moderation">
          <Row label="Open reports (now)" value={fmt(data.moderation.openReports)} />
          <Row label="Actions taken (that day)" value={fmt(data.moderation.actionsTaken)} />
          <Row label="Median time to resolution" value={fmt(data.moderation.medianResolutionHours, "h")} />
        </Section>

        <Section title="LLM spend">
          <Row label="Estimated cost (that day)" value={fmtUsd(data.llm.costUsdEstimated)} />
          <Row label="Per active user" value={fmtUsd(data.llm.costPerActiveUserUsdEstimated)} />
          <p style={{ fontSize: 11, color: FAINT, marginTop: 6, lineHeight: 1.5 }}>{data.llm.note}</p>
        </Section>
      </div>
    </div>
  );
}
