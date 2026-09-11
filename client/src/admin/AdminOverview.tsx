import { useQuery } from "@tanstack/react-query";
import { adminGet } from "./api";
import { PageHeader, StatTile, MONO, FAINT } from "./AdminShell";

export default function AdminOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => adminGet("/api/admin/overview"),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader title="Overview" sub="Is anything wrong right now." />
      {isLoading ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatTile label="Open reports" value={data.openReports} alert={data.openReports > 0} />
            <StatTile label="Investigating" value={data.investigatingReports} />
            <StatTile label="Safety-category open" value={data.safetyReportsOpen} alert={data.safetyReportsOpen > 0} />
            <StatTile label="Open feedback" value={data.openFeedback} />
            <StatTile label="Failed payments today" value={data.failedPaymentsToday} alert={data.failedPaymentsToday > 0} />
            <StatTile label="MRR" value={data.mrrUsd != null ? `$${data.mrrUsd.toFixed(2)}` : "—"} />
            <StatTile label="LLM spend (yesterday, est.)" value={data.llmSpendYesterdayUsd != null ? `$${data.llmSpendYesterdayUsd.toFixed(4)}` : "—"} />
            <StatTile
              label={`Error rate (${data.errorRateWindowMinutes}min)`}
              value={data.errorRatePct != null ? `${data.errorRatePct}%` : "no traffic yet"}
              alert={!!data.errorRatePct && data.errorRatePct > 2}
            />
          </div>
          <p style={{ ...MONO, fontSize: 10.5, color: FAINT, marginTop: 18 }}>
            computed {new Date(data.computedAt).toLocaleTimeString()} · MRR / LLM spend are yesterday's rollup, error rate is live (last {data.errorRateSampleSize} requests) · full breakdown in Metrics
          </p>
        </>
      )}
    </div>
  );
}
