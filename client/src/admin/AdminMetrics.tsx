import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT } from "./AdminShell";
import { adminGet } from "./api";
import {
  FunnelChart,
  RetentionCohortChart,
  ReadinessHistogram,
  MrrChart,
  LlmRevenueChart,
  PaymentSuccessChart,
  ResonanceHistogram,
  ConversionByGateChart,
} from "./charts";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: 16, marginBottom: 14, display: "flex", flexDirection: "column" }}>
    <div style={{ ...LABEL, marginBottom: 10 }}>{title}</div>
    {children}
  </div>
);
const Tag = ({ children }: { children: React.ReactNode }) => (
  <span style={{ ...MONO, fontSize: 9, color: FAINT, border: `1px solid ${LINE}`, borderRadius: 4, padding: "1px 5px", letterSpacing: "0.06em" }}>{children}</span>
);
const Row = ({ label, value, note, badge }: { label: string; value: React.ReactNode; note?: string; badge?: React.ReactNode }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${LINE}`, gap: 10 }}>
    <span style={{ fontSize: 13, color: MUTED }}>{label}</span>
    <span style={{ textAlign: "right" }}>
      <span style={{ ...MONO, fontSize: 14, color: TEXT }}>{value ?? "—"}</span>
      {badge && <div style={{ marginTop: 3 }}>{badge}</div>}
      {note && <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2, maxWidth: 220 }}>{note}</div>}
    </span>
  </div>
);
const fmt = (n: number | null | undefined, suffix = "") => (n == null ? "—" : `${n}${suffix}`);
const fmtUsd = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);

function shiftIsoDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export default function AdminMetrics() {
  const [date, setDate] = useState(() => new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  const [userPicked, setUserPicked] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "metrics", "summary", date],
    queryFn: () => adminGet(`/api/admin/metrics/summary?date=${date}`),
  });
  // Not date-scoped like the summary above — these are their own trailing
  // windows, independent of whichever single day is selected.
  const { data: moneySeries } = useQuery({ queryKey: ["admin", "metrics", "money-series"], queryFn: () => adminGet("/api/admin/metrics/money-series?days=90") });
  const { data: retentionCohorts } = useQuery({ queryKey: ["admin", "metrics", "retention-cohorts"], queryFn: () => adminGet("/api/admin/metrics/retention-cohorts") });

  // Default to the most recent rollup that actually exists, rather than a
  // fixed "yesterday" the viewer has to notice is stale and correct by hand.
  // Only until they've touched the control themselves.
  useEffect(() => {
    if (!userPicked && data?.latestAvailableDate && data.latestAvailableDate !== date) {
      setDate(data.latestAvailableDate);
    }
  }, [data?.latestAvailableDate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;

  const atLatest = !data.latestAvailableDate || date >= data.latestAvailableDate;
  const goToDate = (next: string) => {
    setUserPicked(true);
    setDate(next);
  };

  const funnelStages: [string, string][] = [
    ["Signed up", "signup"],
    ["Basics complete", "basics_complete"],
    ["≥1 soul-mapping answer", "soul_answer"],
    ["Twin generated", "twin_generated"],
    ["First interview", "first_interview"],
    ["First match", "first_match"],
  ];

  const retentionNote = "Not enough time has passed for any cohort yet";

  return (
    <div>
      <PageHeader title="Metrics" sub={`Rollup for ${data.date}. Recomputed nightly — not live.`} />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button onClick={() => goToDate(shiftIsoDate(date, -1))} style={navBtnStyle} aria-label="Previous day" data-testid="metrics-prev-day">
          ←
        </button>
        <input type="date" value={date} onChange={(e) => goToDate(e.target.value)} style={{ height: 32, borderRadius: 6, border: `1px solid ${LINE}`, background: SURFACE, color: TEXT, fontSize: 12.5, padding: "0 8px" }} />
        <span style={{ ...MONO, fontSize: 11, color: FAINT }}>{date}</span>
        <button onClick={() => goToDate(shiftIsoDate(date, 1))} disabled={atLatest} style={{ ...navBtnStyle, opacity: atLatest ? 0.4 : 1, cursor: atLatest ? "not-allowed" : "pointer" }} aria-label="Next day" data-testid="metrics-next-day">
          →
        </button>
        <button onClick={() => refetch()} style={navBtnStyle}>
          Reload
        </button>
      </div>

      <div className="console-metrics-grid">
        <Section title="Funnel — this cohort's day-of-signup, as of now">
          <FunnelChart
            stages={[
              { label: "Signed up", value: data.funnel.signup },
              { label: "Basics complete", value: data.funnel.basics_complete },
              { label: "≥1 soul-mapping answer", value: data.funnel.soul_answer },
              { label: "Twin generated", value: data.funnel.twin_generated },
              { label: "First interview", value: data.funnel.first_interview },
              { label: "First match", value: data.funnel.first_match },
            ]}
          />
          {funnelStages.map(([label, key]) => (
            <Row key={key} label={label} value={fmt((data.funnel as any)[key])} />
          ))}
          <Row label="Activated within 24h" value={fmt(data.funnel.activationD1Pct, "%")} />
        </Section>

        <Section title="Retention — trailing 30d cohorts">
          {retentionCohorts && <RetentionCohortChart data={retentionCohorts} />}
          <Row label="D1" value={fmt(data.retention.d1Pct, "%")} note={data.retention.d1Pct == null ? retentionNote : undefined} />
          <Row label="D7" value={fmt(data.retention.d7Pct, "%")} note={data.retention.d7Pct == null ? retentionNote : undefined} />
          <Row label="D30" value={fmt(data.retention.d30Pct, "%")} note={data.retention.d30Pct == null ? retentionNote : undefined} />
        </Section>

        <Section title="Growth">
          <Row label="Signups (that day)" value={fmt(data.growth.signups?.find((r: any) => r.date === data.date)?.value)} />
          <Row label="DAU" value={fmt(data.growth.dau?.at(-1)?.value)} />
          <Row label="WAU" value={fmt(data.growth.wau?.at(-1)?.value)} />
          <Row label="MAU" value={fmt(data.growth.mau?.at(-1)?.value)} />
        </Section>

        <Section title="Twin layer">
          <ReadinessHistogram buckets={data.twin.readinessBuckets || {}} avgPct={data.twin.readinessAvg} />
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
            badge={data.matching.resonanceScoredPct != null && data.matching.resonanceScoredPct < 5 ? <Tag>NOT BUILDABLE</Tag> : undefined}
            note={data.matching.resonanceScoredPct != null && data.matching.resonanceScoredPct < 5 ? "resonance isn't wired to real matches — see server/resonance.ts" : undefined}
          />
          <div style={{ marginTop: 10 }}>
            <ResonanceHistogram scoredPct={data.matching.resonanceScoredPct} />
          </div>
        </Section>

        <Section title="Money">
          {moneySeries && <MrrChart points={moneySeries.points} />}
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
          {moneySeries && <PaymentSuccessChart paymentsByMethod={moneySeries.paymentsByMethod} />}
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
            <ConversionByGateChart data={data.money.conversionByGate} />
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
          <Row label="No-show rate" value="—" badge={<Tag>NOT BUILDABLE</Tag>} note="No day-of check-in data exists yet" />
        </Section>

        <Section title="Moderation">
          <Row label="Open reports (now)" value={fmt(data.moderation.openReports)} />
          <Row label="Actions taken (that day)" value={fmt(data.moderation.actionsTaken)} />
          <Row label="Median time to resolution" value={fmt(data.moderation.medianResolutionHours, "h")} />
        </Section>

        <Section title="LLM spend">
          {moneySeries && <LlmRevenueChart points={moneySeries.points} />}
          <Row label="Estimated cost (that day)" value={fmtUsd(data.llm.costUsdEstimated)} badge={<Tag>PARTIAL</Tag>} />
          <Row label="Per active user" value={fmtUsd(data.llm.costPerActiveUserUsdEstimated)} />
        </Section>
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  borderRadius: 6,
  border: `1px solid ${LINE}`,
  background: "transparent",
  color: MUTED,
  fontSize: 12,
  cursor: "pointer",
};
