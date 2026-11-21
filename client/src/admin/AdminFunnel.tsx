import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminGet } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER } from "./AdminShell";

// The sign-up funnel (server/admin/funnel.ts): landing visit → sign-up →
// basics → first like → first match → first message → first payment.
// Everyone who signed up in the period is followed through every step.
const STEPS = [
  { key: "visits", short: "Visits", label: "Landing visits", hint: "Signed-out visits to the homepage, one per browser session" },
  { key: "signups", short: "Sign-ups", label: "Signed up", hint: "Accounts created" },
  { key: "basics", short: "Basics", label: "Did the basics", hint: "Finished the first screens (gender, who they're looking for…)" },
  { key: "liked", short: "Liked", label: "Sent a like", hint: "Liked at least one person" },
  { key: "matched", short: "Matched", label: "Got a match", hint: "At least one mutual match" },
  { key: "messaged", short: "Messaged", label: "Sent a message", hint: "Wrote in at least one chat" },
  { key: "paid", short: "Paid", label: "Paid", hint: "At least one confirmed payment" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];
type Row = Record<StepKey, number> & { key: string };

const HEADLINE_NAME: Record<string, string> = {
  default: "Default (Find love)",
  love: "?v=love",
  twin: "?v=twin",
  events: "?v=events",
  serious: "?v=serious",
  unknown: "Not recorded (before this was tracked)",
};
const SOURCE_NAME: Record<string, string> = {
  campaign: "Ads and campaigns",
  social: "Social (not an ad)",
  direct: "Direct",
  search: "Search",
  referral: "A friend's invite",
  share_card: "Shared Status card",
  event: "An event link",
  group: "A group invite",
  other_site: "Another website",
  unknown: "Not recorded",
};

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
// More sign-ups than visits means visits weren't being counted yet for some
// of them (or they came straight to /auth); a % over 100 would mislead.
const visitPct = (signups: number, visits: number) => (visits > 0 && signups <= visits ? pct(signups, visits) : "–");

export default function AdminFunnel() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "funnel", days], queryFn: () => adminGet(`/api/admin/funnel?days=${days}`) });
  const t: Row | undefined = data?.total;
  const max = t ? Math.max(t.visits, t.signups, 1) : 1;

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader
        title="Funnel"
        sub="From a landing visit to a first payment. Everyone who signed up in the period is followed through each step, whenever they did it."
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }} role="group" aria-label="Period">
        {[7, 14, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            style={{ fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 8, cursor: "pointer", background: days === d ? `${EMBER}22` : "transparent", color: days === d ? EMBER : MUTED, border: `1px solid ${days === d ? `${EMBER}66` : LINE}` }}
            data-testid={`funnel-days-${d}`}
          >
            Last {d} days
          </button>
        ))}
      </div>

      {isLoading || !t ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : (
        <>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, padding: 16 }} data-testid="funnel-total">
            {STEPS.map((s, i) => {
              const n = t[s.key];
              const prev = i > 0 ? t[STEPS[i - 1].key] : null;
              return (
                <div key={s.key} style={{ display: "grid", gridTemplateColumns: "150px 1fr 110px", alignItems: "center", gap: 12, padding: "6px 0" }} title={`${s.label}: ${n}. ${s.hint}`}>
                  <div style={{ fontSize: 13, color: TEXT }}>{s.label}</div>
                  <div style={{ height: 18, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(n > 0 ? 1 : 0, (n / max) * 100)}%`, height: "100%", background: EMBER, borderRadius: "0 4px 4px 0" }} />
                  </div>
                  <div style={{ ...MONO, fontSize: 13, color: TEXT, textAlign: "right" }}>
                    {n.toLocaleString()}
                    {prev != null ? <span style={{ color: FAINT, marginLeft: 8 }}>{i === 1 ? visitPct(n, prev) : pct(n, prev)}</span> : null}
                  </div>
                </div>
              );
            })}
            <p style={{ ...LABEL, color: FAINT, marginTop: 8 }}>
              The % is how many made it from the step above. Visits only count from when this was switched on, so early periods show sign-ups without visits and no visit → sign-up %.
            </p>
          </div>

          <Table title="By landing headline" rows={data.byVariant} names={HEADLINE_NAME} />
          <Table title="By where they came from" rows={data.bySource} names={SOURCE_NAME} />
        </>
      )}
    </div>
  );
}

function Table({ title, rows, names }: { title: string; rows: Row[]; names: Record<string, string> }) {
  if (!rows?.length) return null;
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ ...LABEL, color: MUTED, marginBottom: 8 }}>{title}</div>
      <div style={{ overflowX: "auto", border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: TEXT }}>
          <thead>
            <tr>
              <th style={th}>{""}</th>
              {STEPS.map((s) => (
                <th key={s.key} style={{ ...th, textAlign: "right" }} title={`${s.label}: ${s.hint}`}>{s.short}</th>
              ))}
              <th style={{ ...th, textAlign: "right" }} title="Signed up ÷ landing visits. Blank while there are more sign-ups than counted visits.">Visit→sign-up</th>
              <th style={{ ...th, textAlign: "right" }} title="Paid ÷ signed up">Sign-up→paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: `1px solid ${LINE}` }}>
                <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{names[r.key] ?? r.key}</td>
                {STEPS.map((s) => (
                  <td key={s.key} style={{ ...td, ...MONO, textAlign: "right" }}>{r[s.key].toLocaleString()}</td>
                ))}
                <td style={{ ...td, ...MONO, textAlign: "right", color: MUTED }}>{visitPct(r.signups, r.visits)}</td>
                <td style={{ ...td, ...MONO, textAlign: "right", color: MUTED }}>{pct(r.paid, r.signups)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontSize: 11.5, fontWeight: 600, color: "inherit", opacity: 0.7, textAlign: "left", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px" };
