// Growth: where signups come from, whether they finish setting up and come
// back, and how invites and shares are doing. Live, not the nightly rollup
// (see server/admin/growth.ts).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, StatTile, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER } from "./AdminShell";
import { adminGet } from "./api";
import { GrowthSignupsChart } from "./charts";

interface GrowthData {
  days: number;
  computedAt: string;
  totals: { signups: number; finishedSetup: number; measurable: number; cameBack: number };
  sources: { source: string; signups: number; finishedSetup: number; measurable: number; cameBack: number }[];
  series: { date: string; counts: Record<string, number> }[];
  referrals: {
    joined: number;
    finishedSetup: number;
    freeWeeksGiven: number;
    profileViewsGiven: number;
    topReferrers: { userId: string; name: string; joined: number; finished: number }[];
  };
  shares: { byKind: { kind: string; format: string; count: number }[]; sharers: number; signupsFromShares: number };
  trackingStarted: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  referral: "Invited by a friend",
  share_card: "Status card",
  event: "Event link",
  group: "Group invite link",
  campaign: "Campaign (utm)",
  search: "Search engine",
  social: "Social media",
  other_site: "Another website",
  direct: "Direct / typed in",
  untracked: "Before tracking began",
};
const INVITED = new Set(["referral", "share_card"]);

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

const Section = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <div style={{ border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: 16, marginBottom: 14 }}>
    <div style={{ ...LABEL, marginBottom: note ? 4 : 10 }}>{title}</div>
    {note && <p style={{ fontSize: 12, color: FAINT, margin: "0 0 10px" }}>{note}</p>}
    {children}
  </div>
);

const th: React.CSSProperties = { ...MONO, fontSize: 10, color: FAINT, textAlign: "right", fontWeight: 400, padding: "6px 0 6px 12px", letterSpacing: "0.06em" };
const td: React.CSSProperties = { ...MONO, fontSize: 13, color: TEXT, textAlign: "right", padding: "7px 0 7px 12px", borderTop: `1px solid ${LINE}` };
const tdLabel: React.CSSProperties = { fontSize: 13, color: MUTED, padding: "7px 0", borderTop: `1px solid ${LINE}` };

export default function AdminGrowth() {
  const [days, setDays] = useState(30);
  const { data, isLoading, refetch, isFetching } = useQuery<GrowthData>({
    queryKey: ["admin", "growth", days],
    queryFn: () => adminGet(`/api/admin/growth?days=${days}`),
  });

  const series = (data?.series ?? []).map((d) => {
    let invited = 0;
    let other = 0;
    for (const [src, n] of Object.entries(d.counts)) {
      if (INVITED.has(src)) invited += n;
      else other += n;
    }
    return { date: d.date, invited, other };
  });
  const shareCount = (kind: string, format: string) =>
    data?.shares.byKind.find((r) => r.kind === kind && r.format === format)?.count ?? 0;

  return (
    <div>
      <PageHeader
        title="Growth"
        sub={data ? `Live · signups in the last ${data.days} days · as of ${new Date(data.computedAt).toLocaleTimeString()}` : "Live"}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }} role="group" aria-label="Window">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 6,
              border: `1px solid ${days === d ? TEXT : LINE}`,
              background: SURFACE,
              color: days === d ? TEXT : MUTED,
              fontSize: 12.5,
              cursor: "pointer",
            }}
            data-testid={`growth-window-${d}`}
          >
            {d} days
          </button>
        ))}
        <button
          onClick={() => refetch()}
          style={{ height: 30, padding: "0 12px", borderRadius: 6, border: `1px solid ${LINE}`, background: SURFACE, color: MUTED, fontSize: 12.5, cursor: "pointer" }}
        >
          {isFetching ? "Loading…" : "Reload"}
        </button>
      </div>

      {isLoading || !data ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : (
        <>
          {!data.trackingStarted && (
            <p style={{ fontSize: 12.5, color: MUTED, border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
              Signup sources are recorded from this release on. Members who joined earlier show as "Before tracking
              began".
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
            <StatTile label="Signups" value={data.totals.signups} testId="growth-signups" />
            <StatTile
              label="Finished setup"
              value={pct(data.totals.finishedSetup, data.totals.signups)}
              trend={`${data.totals.finishedSetup} of ${data.totals.signups}`}
            />
            <StatTile
              label="Came back in week one"
              value={pct(data.totals.cameBack, data.totals.measurable)}
              trend={data.totals.measurable ? `${data.totals.cameBack} of ${data.totals.measurable} old enough to tell` : "None a week old yet"}
            />
            <StatTile
              label="Joined through a friend"
              value={data.referrals.joined}
              trend={`${data.referrals.freeWeeksGiven} free weeks given`}
            />
          </div>

          <Section title="Signups per day">
            <GrowthSignupsChart series={series} days={data.days} />
          </Section>

          <Section
            title="Where they came from"
            note="First page they landed on. 'Came back' means any activity in the 7 days after signing up, counted only for people who joined at least a week ago."
          >
            {data.sources.length === 0 ? (
              <p style={{ fontSize: 13, color: FAINT }}>No signups in this window.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="growth-sources">
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: "left", paddingLeft: 0 }}>SOURCE</th>
                      <th style={th}>SIGNUPS</th>
                      <th style={th}>FINISHED SETUP</th>
                      <th style={th}>CAME BACK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sources.map((r) => (
                      <tr key={r.source}>
                        <td style={{ ...tdLabel, color: INVITED.has(r.source) ? EMBER : MUTED }}>
                          {SOURCE_LABEL[r.source] ?? r.source}
                        </td>
                        <td style={td}>{r.signups}</td>
                        <td style={td}>{pct(r.finishedSetup, r.signups)}</td>
                        <td style={td}>{pct(r.cameBack, r.measurable)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <div className="console-metrics-grid">
            <Section title="Invites" note="Friends who signed up with someone's link in this window.">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={tdLabel}>Signed up with an invite</td><td style={td}>{data.referrals.joined}</td></tr>
                  <tr><td style={tdLabel}>Finished setting up (both rewarded)</td><td style={td}>{data.referrals.finishedSetup}</td></tr>
                  <tr><td style={tdLabel}>Free weeks given, both sides</td><td style={td}>{data.referrals.freeWeeksGiven}</td></tr>
                  <tr><td style={tdLabel}>Profile views given (incl. paid members' rewards)</td><td style={td}>{data.referrals.profileViewsGiven}</td></tr>
                </tbody>
              </table>
              <div style={{ ...LABEL, margin: "16px 0 6px" }}>Top inviters</div>
              {data.referrals.topReferrers.length === 0 ? (
                <p style={{ fontSize: 13, color: FAINT }}>Nobody has brought a friend in this window yet.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="growth-top-referrers">
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: "left", paddingLeft: 0 }}>MEMBER</th>
                      <th style={th}>JOINED</th>
                      <th style={th}>SET UP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.referrals.topReferrers.map((r) => (
                      <tr key={r.userId}>
                        <td style={tdLabel}>{r.name}</td>
                        <td style={td}>{r.joined}</td>
                        <td style={td}>{r.finished}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title="Shares" note="Taps on a share action in this window.">
              <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="growth-shares">
                <tbody>
                  <tr><td style={tdLabel}>Event Destira stories</td><td style={td}>{shareCount("event", "destira_story")}</td></tr>
                  <tr><td style={tdLabel}>Event WhatsApp Status cards</td><td style={td}>{shareCount("event", "status_card")}</td></tr>
                  <tr><td style={tdLabel}>Event links</td><td style={td}>{shareCount("event", "link")}</td></tr>
                  <tr><td style={tdLabel}>Invite Status cards</td><td style={td}>{shareCount("invite", "status_card")}</td></tr>
                  <tr><td style={tdLabel}>Invite links / WhatsApp messages</td><td style={td}>{shareCount("invite", "link")}</td></tr>
                  <tr><td style={tdLabel}>Members who shared</td><td style={td}>{data.shares.sharers}</td></tr>
                  <tr><td style={tdLabel}>Signups whose first visit was a Status card</td><td style={td}>{data.shares.signupsFromShares}</td></tr>
                </tbody>
              </table>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
