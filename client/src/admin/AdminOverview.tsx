import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { adminGet } from "./api";
import { PageHeader, StatTile, Money, formatDateTime, MONO, FAINT, LABEL, LINE, SURFACE, MUTED, TEXT, ALERT } from "./AdminShell";
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

function ago(ms: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

const panel: React.CSSProperties = {
  border: `1px solid ${LINE}`,
  background: SURFACE,
  borderRadius: 10,
  padding: 16,
  marginTop: 14,
};

// What's behind a count or amount tile: the real rows that add up to it.
function DetailPanel({ tile }: { tile: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "overview", "details", tile],
    queryFn: () => adminGet(`/api/admin/overview/details/${tile}`),
  });
  return (
    <div style={panel} data-testid={`detail-${tile}`}>
      {isLoading ? (
        <p style={{ color: FAINT, fontSize: 13 }}>Loading…</p>
      ) : isError || !data ? (
        <p style={{ color: ALERT, fontSize: 13 }}>Couldn't load the details. Try again in a moment.</p>
      ) : (
        <>
          <div style={{ fontSize: 15, color: TEXT, fontWeight: 600 }}>{data.title}</div>
          <p style={{ fontSize: 13, color: MUTED, margin: "4px 0 12px" }}>{data.intro}</p>
          {data.rows.length === 0 ? (
            <p style={{ fontSize: 13, color: FAINT }}>{data.empty}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {data.rows.map((r: any, i: number) => {
                const body = (
                  <div style={{ padding: "10px 0", borderTop: `1px solid ${LINE}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontSize: 13.5, color: r.tone === "alert" ? ALERT : TEXT, fontWeight: 600 }}>{r.title}</span>
                      {r.meta && <span style={{ ...MONO, fontSize: 11, color: FAINT, textAlign: "right" }}>{r.meta}</span>}
                    </div>
                    {r.subtitle && <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{r.subtitle}</div>}
                  </div>
                );
                return r.href ? (
                  <Link key={i} href={r.href} style={{ textDecoration: "none" }}>{body}</Link>
                ) : (
                  <div key={i}>{body}</div>
                );
              })}
            </div>
          )}
          {data.viewAll && (
            <Link href={data.viewAll.href} style={{ ...MONO, fontSize: 12, color: TEXT, display: "inline-block", marginTop: 12 }}>
              {data.viewAll.label} →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

// The failures behind the error-rate number, grouped by what broke.
function ErrorPanel({ failedCount, sampleSize }: { failedCount: number; sampleSize: number }) {
  const [range, setRange] = useState<"window" | "last24h">("window");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "errors", "recent"],
    queryFn: () => adminGet("/api/admin/errors/recent"),
    refetchInterval: 15_000,
  });
  const summary = data?.[range];
  const tab = (key: "window" | "last24h", label: string) => (
    <button
      onClick={() => setRange(key)}
      style={{
        ...MONO, fontSize: 11.5, padding: "5px 10px", borderRadius: 8, cursor: "pointer",
        background: range === key ? "rgba(255,255,255,.08)" : "transparent",
        color: range === key ? TEXT : MUTED,
        border: `1px solid ${LINE}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={panel} data-testid="detail-errors">
      <div style={{ fontSize: 15, color: TEXT, fontWeight: 600 }}>What's failing</div>
      <p style={{ fontSize: 13, color: MUTED, margin: "4px 0 10px" }}>
        {failedCount === 0
          ? `No failures in the last 15 minutes (${sampleSize} requests).`
          : `${failedCount} of ${sampleSize} requests in the last 15 minutes failed.`}{" "}
        A failure is a server error (status 500+) or a screen that crashed in someone's browser. Wrong passwords, missing pages and
        validation errors don't count.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {tab("window", "Last 15 minutes")}
        {tab("last24h", "Last 24 hours")}
      </div>

      {isLoading ? (
        <p style={{ color: FAINT, fontSize: 13 }}>Loading…</p>
      ) : !summary || summary.groups.length === 0 ? (
        <p style={{ color: FAINT, fontSize: 13 }}>Nothing has failed in this period.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {summary.groups.map((g: any) => (
            <div key={g.key} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: 12 }} data-testid={`error-group-${g.method}-${g.route}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <span style={{ ...MONO, fontSize: 13, color: TEXT }}>
                  {g.kind === "client" ? "Screen crash" : g.method} <strong>{g.route}</strong>
                </span>
                <span style={{ ...MONO, fontSize: 11.5, color: ALERT, whiteSpace: "nowrap" }}>
                  {g.count}× {g.kind === "server" ? `· ${g.status}` : ""}
                </span>
              </div>
              <div style={{ fontSize: 13, color: TEXT, marginTop: 6 }}>{g.explanation}</div>
              <div style={{ ...MONO, fontSize: 11.5, color: MUTED, marginTop: 6, wordBreak: "break-word" }}>
                {g.lastCause ? `${g.lastCause}` : g.lastMessage}
              </div>
              {g.lastCause && g.lastMessage && g.lastCause !== g.lastMessage && (
                <div style={{ ...MONO, fontSize: 11, color: FAINT, marginTop: 3 }}>User saw: {g.lastMessage}</div>
              )}
              <div style={{ ...MONO, fontSize: 11, color: FAINT, marginTop: 6 }}>
                last {ago(g.lastAt)}{g.count > 1 ? ` · first ${ago(g.firstAt)}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ ...LABEL, color: FAINT, marginTop: 12, textTransform: "none", letterSpacing: 0 }}>
        {data?.note ?? "Kept in memory since the server last restarted."}
      </p>
    </div>
  );
}

export default function AdminOverview() {
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => adminGet("/api/admin/overview"),
    refetchInterval: 30_000,
  });
  const toggle = (key: string) => () => setOpen((cur) => (cur === key ? null : key));
  const tileProps = (key: string) => ({ onClick: toggle(key), selected: open === key, testId: `tile-${key}` });

  return (
    <div>
      <PageHeader title="Overview" sub="Is anything wrong right now. Tap any number to see what's behind it." />
      {isLoading ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : (
        <>
          <div className="console-kpi-grid">
            <StatTile
              {...tileProps("openReports")}
              label="Open reports"
              value={data.openReports}
              alert={data.openReports > 0}
              trend={trendText(data.openReports, data.openReportsYesterday)}
              sparkline={data.sparklines?.openReports}
            />
            <StatTile
              {...tileProps("investigating")}
              label="Investigating"
              value={data.investigatingReports}
              trend={trendText(data.investigatingReports, data.investigatingReportsYesterday)}
            />
            <StatTile
              {...tileProps("safety")}
              label="Safety-category open"
              value={data.safetyReportsOpen}
              alert={data.safetyReportsOpen > 0}
              trend={trendText(data.safetyReportsOpen, data.safetyReportsOpenYesterday)}
              sparkline={data.sparklines?.safetyReportsOpen}
            />
            <StatTile
              {...tileProps("feedback")}
              label="Open feedback"
              value={data.openFeedback}
              trend={trendText(data.openFeedback, data.openFeedbackYesterday)}
              sparkline={data.sparklines?.openFeedback}
            />
            <StatTile
              {...tileProps("failedPayments")}
              label="Failed payments today"
              value={data.failedPaymentsToday}
              alert={data.failedPaymentsToday > 0}
              trend={trendText(data.failedPaymentsToday, data.failedPaymentsYesterday)}
              sparkline={data.sparklines?.failedPaymentsToday}
            />
            <StatTile
              {...tileProps("mrr")}
              label={`MRR${data.payingUsersCount != null ? ` · ${data.payingUsersCount} paying` : ""}${data.trialUsersCount ? ` · ${data.trialUsersCount} on trial` : ""}`}
              value={<Money usd={data.mrrUsd} />}
              trend={moneyTrendText(data.mrrUsd, data.mrrUsdDayBefore)}
              sparkline={data.sparklines?.mrrUsd}
            />
            <StatTile
              {...tileProps("llm")}
              label="LLM spend (yesterday, est.)"
              value={<Money usd={data.llmSpendYesterdayUsd} />}
              trend={moneyTrendText(data.llmSpendYesterdayUsd, data.llmSpendDayBeforeUsd)}
              sparkline={data.sparklines?.llmSpendYesterdayUsd}
            />
            <StatTile
              {...tileProps("errors")}
              label={`Error rate (${data.errorRateWindowMinutes}min)`}
              value={data.errorRatePct != null ? `${data.errorRatePct}%` : "no traffic yet"}
              alert={!!data.errorRatePct && data.errorRatePct > 2}
              trend={
                data.errorRatePct != null
                  ? `${data.errorRateFailedCount ?? 0} of ${data.errorRateSampleSize} requests failed`
                  : undefined
              }
            />
          </div>

          {open === "errors" ? (
            <ErrorPanel failedCount={data.errorRateFailedCount ?? 0} sampleSize={data.errorRateSampleSize ?? 0} />
          ) : open ? (
            <DetailPanel tile={open} />
          ) : null}

          <p style={{ ...MONO, fontSize: 10.5, color: FAINT, marginTop: 18, marginBottom: 22 }}>
            computed {formatDateTime(data.computedAt)} · MRR / LLM spend are yesterday's rollup, error rate is live (last {data.errorRateSampleSize} requests) · full breakdown in Metrics
          </p>
          <SignupsChart series={data.signups30d ?? []} />
        </>
      )}
    </div>
  );
}
