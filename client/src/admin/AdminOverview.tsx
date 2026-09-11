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
            <StatTile label="MRR" value={data.mrrUsd ?? "—"} />
            <StatTile label="LLM spend today" value={data.llmSpendTodayUsd ?? "—"} />
            <StatTile label="Error rate" value={data.errorRatePct ?? "—"} />
          </div>
          <p style={{ ...MONO, fontSize: 10.5, color: FAINT, marginTop: 18 }}>
            computed {new Date(data.computedAt).toLocaleTimeString()} · MRR / LLM spend / error rate ship in phase 3
          </p>
        </>
      )}
    </div>
  );
}
