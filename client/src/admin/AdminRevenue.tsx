import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminGet } from "./api";
import { PageHeader, StatTile, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER } from "./AdminShell";
import { DailyRevenueChart } from "./charts";

// Revenue, live from the payments and subscriptions tables
// (server/admin/revenue.ts).
type Report = {
  days: number;
  totals: { revenueCents: number; payments: number; payingMembers: number; activePaid: number; activeTrials: number; runRateCents: number };
  series: { date: string; cents: number; payments: number }[];
  plans: { tier: string; period: string; trial: boolean; count: number }[];
  renewalsDue: { userId: string; name: string | null; tier: string; period: string; endsAt: string; cancelled: boolean }[];
  renewal: { due: number; renewed: number };
  methods: { method: string; paid: number; failed: number; pending: number; other: number; paidCents: number }[];
  stuck: { rechecking: number; forAHuman: number };
};

const TIER = ["spark", "flame", "ember", "crown"];
const TIER_NAME: Record<string, string> = { spark: "Spark", flame: "Flame", ember: "Ember", crown: "Crown" };
const PERIOD_NAME: Record<string, string> = { weekly: "Weekly", monthly: "Monthly", sixMonth: "6 months" };
const METHOD_NAME: Record<string, string> = {
  paynow_ecocash: "EcoCash",
  paynow_onemoney: "OneMoney",
  paynow_innbucks: "InnBucks",
  paynow_card: "Card",
  mock: "Test payments",
};

const usd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export default function AdminRevenue() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery<Report>({ queryKey: ["admin", "revenue", days], queryFn: () => adminGet(`/api/admin/revenue?days=${days}`) });

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="Revenue" sub="Straight from the payments table, live. Free trials aren't revenue and are counted separately." />
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }} role="group" aria-label="Period">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            style={{ fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 8, cursor: "pointer", background: days === d ? `${EMBER}22` : "transparent", color: days === d ? EMBER : MUTED, border: `1px solid ${days === d ? `${EMBER}66` : LINE}` }}
            data-testid={`revenue-days-${d}`}
          >
            Last {d} days
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }} data-testid="revenue-tiles">
            <StatTile label={`Revenue, ${days} days`} value={usd(data.totals.revenueCents)} trend={`${data.totals.payments} payment${data.totals.payments === 1 ? "" : "s"} · ${data.totals.payingMembers} member${data.totals.payingMembers === 1 ? "" : "s"}`} testId="tile-revenue" />
            <StatTile label="Active paid plans" value={data.totals.activePaid} trend={`${data.totals.activeTrials} on a free trial`} testId="tile-active" />
            <StatTile label="Monthly run-rate" value={usd(data.totals.runRateCents)} trend="active paid plans, per month" testId="tile-runrate" />
            <StatTile
              label="Renewal rate"
              value={pct(data.renewal.renewed, data.renewal.due)}
              trend={data.renewal.due ? `${data.renewal.renewed} of ${data.renewal.due} paid again` : "no plans have ended yet"}
              testId="tile-renewal"
            />
            <StatTile label="Renewals due, 7 days" value={data.renewalsDue.length} trend="paid plans ending soon" testId="tile-due" />
            <StatTile
              label="Stuck payments"
              value={data.stuck.rechecking + data.stuck.forAHuman}
              alert={data.stuck.forAHuman > 0}
              trend={data.stuck.forAHuman ? `${data.stuck.forAHuman} need a person` : data.stuck.rechecking ? "still asking Paynow" : "none"}
              testId="tile-stuck"
            />
          </div>

          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, padding: 16, marginTop: 18 }} data-testid="revenue-chart">
            <DailyRevenueChart series={data.series} />
          </div>

          <Section title="Active plans">
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>{""}</th>
                  {["weekly", "monthly", "sixMonth"].map((p) => (
                    <th key={p} style={{ ...th, textAlign: "right" }}>{PERIOD_NAME[p]}</th>
                  ))}
                  <th style={{ ...th, textAlign: "right" }}>Free trial</th>
                </tr>
              </thead>
              <tbody>
                {TIER.map((t) => {
                  const n = (period: string | null) =>
                    data.plans.filter((r) => r.tier === t && (period == null ? r.trial : !r.trial && r.period === period)).reduce((s, r) => s + r.count, 0);
                  return (
                    <tr key={t} style={{ borderTop: `1px solid ${LINE}` }}>
                      <td style={{ ...td, fontWeight: 600 }}>{TIER_NAME[t]}</td>
                      {["weekly", "monthly", "sixMonth"].map((p) => (
                        <td key={p} style={{ ...td, ...MONO, textAlign: "right" }}>{n(p)}</td>
                      ))}
                      <td style={{ ...td, ...MONO, textAlign: "right", color: MUTED }}>{n(null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>

          <Section title={`Payments by method, last ${days} days`}>
            {data.methods.length ? (
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>{""}</th>
                    <th style={{ ...th, textAlign: "right" }}>Paid</th>
                    <th style={{ ...th, textAlign: "right" }} title="The gateway said no (declined, wrong PIN, not enough funds)">Failed</th>
                    <th style={{ ...th, textAlign: "right" }} title="Started, then expired or cancelled">Abandoned</th>
                    <th style={{ ...th, textAlign: "right" }}>Still pending</th>
                    <th style={{ ...th, textAlign: "right" }} title="Paid ÷ every attempt that finished">Success</th>
                    <th style={{ ...th, textAlign: "right" }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.methods.map((m) => (
                    <tr key={m.method} style={{ borderTop: `1px solid ${LINE}` }}>
                      <td style={{ ...td, fontWeight: 600 }}>{METHOD_NAME[m.method] ?? m.method}</td>
                      <td style={{ ...td, ...MONO, textAlign: "right" }}>{m.paid}</td>
                      <td style={{ ...td, ...MONO, textAlign: "right" }}>{m.failed}</td>
                      <td style={{ ...td, ...MONO, textAlign: "right" }}>{m.other}</td>
                      <td style={{ ...td, ...MONO, textAlign: "right" }}>{m.pending}</td>
                      <td style={{ ...td, ...MONO, textAlign: "right", color: MUTED }}>{pct(m.paid, m.paid + m.failed + m.other)}</td>
                      <td style={{ ...td, ...MONO, textAlign: "right" }}>{usd(m.paidCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: FAINT, padding: 14, margin: 0 }}>No payment attempts in this period.</p>
            )}
          </Section>

          <Section title="Renewals due in the next 7 days">
            {data.renewalsDue.length ? (
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Member</th>
                    <th style={th}>Plan</th>
                    <th style={th}>Ends</th>
                    <th style={th}>{""}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.renewalsDue.map((r) => (
                    <tr key={r.userId} style={{ borderTop: `1px solid ${LINE}` }}>
                      <td style={td}>{r.name ?? <span style={{ color: FAINT }}>No profile name</span>}</td>
                      <td style={td}>{TIER_NAME[r.tier] ?? r.tier}, {(PERIOD_NAME[r.period] ?? r.period).toLowerCase()}</td>
                      <td style={{ ...td, ...MONO }}>{day(r.endsAt)}</td>
                      <td style={{ ...td, color: MUTED }}>{r.cancelled ? "Cancelled, won't be reminded" : "Reminders on"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: FAINT, padding: 14, margin: 0 }}>No paid plans end in the next 7 days.</p>
            )}
          </Section>

          <p style={{ ...LABEL, color: FAINT, marginTop: 14 }}>
            Renewal rate: of the paid periods that ended in this window (at least 3 days ago), how many were paid again by 3 days after they ended. Run-rate counts a weekly plan as 52 ÷ 12 weeks a month.
          </p>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ ...LABEL, color: MUTED, marginBottom: 8 }}>{title}</div>
      <div style={{ overflowX: "auto", border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE }}>{children}</div>
    </div>
  );
}

const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13, color: TEXT };
const th: React.CSSProperties = { padding: "8px 10px", fontSize: 11.5, fontWeight: 600, color: "inherit", opacity: 0.7, textAlign: "left", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px" };
