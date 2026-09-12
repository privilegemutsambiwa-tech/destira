import { useQuery } from "@tanstack/react-query";
import { adminGet } from "./api";
import { PageHeader, StatTile, Money, formatDateTime, MONO, FAINT } from "./AdminShell";
import { SignupsChart } from "./charts";

// "was N yesterday" — quiet when nothing has changed, present when it has.
// Absent entirely when there's no prior-day rollup to compare against yet.
function trendText(now: number, before: number | null | undefined): string | undefined {
  if (before == null) return undefined;
  if (now === before) return `was ${before} yesterday too`;
  return `was ${before} yesterday`;
}
function moneyTrendText(now: number | null | undefined, before: number | null | undefined): string | undefined {
  if (now == null || before == null) return undefined;
  const delta = now - before;
  if (Math.abs(delta) < 0.005) return "flat vs the day before";
  return `${delta > 0 ? "+" : "-"}$${Math.abs(delta).toFixed(2)} vs the day before`;
}

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
          <div className="console-kpi-grid">
            <StatTile
              label="Open reports"
              value={data.openReports}
              alert={data.openReports > 0}
              trend={trendText(data.openReports, data.openReportsYesterday)}
              sparkline={data.sparklines?.openReports}
            />
            <StatTile
              label="Investigating"
              value={data.investigatingReports}
              trend={trendText(data.investigatingReports, data.investigatingReportsYesterday)}
            />
            <StatTile
              label="Safety-category open"
              value={data.safetyReportsOpen}
              alert={data.safetyReportsOpen > 0}
              trend={trendText(data.safetyReportsOpen, data.safetyReportsOpenYesterday)}
              sparkline={data.sparklines?.safetyReportsOpen}
            />
            <StatTile
              label="Open feedback"
              value={data.openFeedback}
              trend={trendText(data.openFeedback, data.openFeedbackYesterday)}
              sparkline={data.sparklines?.openFeedback}
            />
            <StatTile
              label="Failed payments today"
              value={data.failedPaymentsToday}
              alert={data.failedPaymentsToday > 0}
              trend={trendText(data.failedPaymentsToday, data.failedPaymentsYesterday)}
              sparkline={data.sparklines?.failedPaymentsToday}
            />
            <StatTile
              label={`MRR${data.payingUsersCount != null ? ` · ${data.payingUsersCount} paying` : ""}`}
              value={<Money usd={data.mrrUsd} />}
              trend={moneyTrendText(data.mrrUsd, data.mrrUsdDayBefore)}
              sparkline={data.sparklines?.mrrUsd}
            />
            <StatTile
              label="LLM spend (yesterday, est.)"
              value={<Money usd={data.llmSpendYesterdayUsd} />}
              trend={moneyTrendText(data.llmSpendYesterdayUsd, data.llmSpendDayBeforeUsd)}
              sparkline={data.sparklines?.llmSpendYesterdayUsd}
            />
            <StatTile
              label={`Error rate (${data.errorRateWindowMinutes}min)`}
              value={data.errorRatePct != null ? `${data.errorRatePct}%` : "no traffic yet"}
              alert={!!data.errorRatePct && data.errorRatePct > 2}
            />
          </div>
          <p style={{ ...MONO, fontSize: 10.5, color: FAINT, marginTop: 18, marginBottom: 22 }}>
            computed {formatDateTime(data.computedAt)} · MRR / LLM spend are yesterday's rollup, error rate is live (last {data.errorRateSampleSize} requests) · full breakdown in Metrics
          </p>
          <SignupsChart series={data.signups30d ?? []} />
        </>
      )}
    </div>
  );
}
