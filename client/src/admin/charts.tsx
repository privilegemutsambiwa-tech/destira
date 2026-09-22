// Every chart in the console goes through this file, on one rule set:
// labelled axes, the current figure always shown as text (never chart-only),
// no gradients/3D/donuts/pies, one series colour (MUTED) plus EMBER for the
// highlighted/current point, gridlines at rgba(255,255,255,.06), a stated
// time window, and real empty axes with a plain note when there's no data —
// never a fake demo curve. Recharts, since it's already a dependency used
// elsewhere in the app (client/src/components/ui/chart.tsx) — this only
// costs the admin console's own lazy chunk, never the member bundle.
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
} from "recharts";
import { EMBER, MUTED, FAINT, LINE, SURFACE, TEXT, ALERT, usePrefersReducedMotion } from "./AdminShell";

export const CHART_MONO = '"DM Mono", monospace';
const axisTick = { fontSize: 9.5, fill: FAINT, fontFamily: CHART_MONO };
const grid = "rgba(255,255,255,.06)";

export function ChartEmpty({ note, height = 160 }: { note: string; height?: number }) {
  return (
    <div
      style={{
        height,
        border: `1px dashed ${LINE}`,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <p style={{ fontSize: 12, color: FAINT, textAlign: "center", margin: 0, maxWidth: 320 }}>{note}</p>
    </div>
  );
}

export function ChartFigure({ label, figure }: { label: string; figure: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
      <span style={{ fontFamily: CHART_MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: FAINT }}>{label}</span>
      <span style={{ fontFamily: CHART_MONO, fontSize: 12, color: MUTED }}>{figure}</span>
    </div>
  );
}

export function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 6, padding: "6px 9px", fontSize: 11, fontFamily: CHART_MONO, color: TEXT }}>
      <div style={{ color: FAINT, marginBottom: 3 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color ?? TEXT }}>
          {p.name ?? p.dataKey}: {typeof p.value === "number" ? Math.round(p.value * 100) / 100 : p.value ?? "—"}
        </div>
      ))}
    </div>
  );
}

// ── 1. Signups, 30-day bar chart (Overview) ──────────────────────────────
export function SignupsChart({ series }: { series: { date: string; value: number }[] }) {
  const reduced = usePrefersReducedMotion();
  const total = series.reduce((s, r) => s + r.value, 0);
  if (!series.length || total === 0) return <ChartEmpty note="No signups recorded in the last 30 days." />;
  const todayIso = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <ChartFigure label="Signups — last 30 days" figure={`${total} total · today: ${series.at(-1)?.value ?? 0}`} />
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="date" tick={axisTick} tickFormatter={(d: string) => d.slice(5)} interval={4} axisLine={{ stroke: LINE }} tickLine={false} />
          <YAxis tick={axisTick} allowDecimals={false} axisLine={false} tickLine={false} width={30} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
          <Bar dataKey="value" name="signups" isAnimationActive={!reduced} radius={[2, 2, 0, 0]}>
            {series.map((s, i) => (
              <Cell key={i} fill={s.date === todayIso ? EMBER : MUTED} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 2. Funnel as horizontal bars (Metrics) ───────────────────────────────
export function FunnelChart({ stages }: { stages: { label: string; value: number | null }[] }) {
  const reduced = usePrefersReducedMotion();
  const clean = stages.map((s, i) => {
    const value = s.value ?? 0;
    const prevValue = i > 0 ? stages[i - 1].value ?? 0 : null;
    // No label on a zero-width bar — "dropped 100%" has nowhere legible to
    // sit next to a bar that isn't there, and the row's own 0 already says it.
    const dropPct = prevValue && prevValue > 0 && value > 0 ? Math.round((1 - value / prevValue) * 1000) / 10 : null;
    return { label: s.label, value, dropPct };
  });
  if (!clean.some((s) => s.value > 0)) return <ChartEmpty note="No signups in this cohort yet." height={220} />;
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={clean} layout="vertical" margin={{ top: 4, right: 46, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={grid} horizontal={false} />
        <XAxis type="number" tick={axisTick} allowDecimals={false} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={130} tick={{ ...axisTick, fontSize: 10.5 }} axisLine={false} tickLine={false} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
        <Bar dataKey="value" name="count" fill={MUTED} radius={[0, 3, 3, 0]} isAnimationActive={!reduced}>
          <LabelList
            dataKey="dropPct"
            position="right"
            formatter={(v: any) => (v == null ? "" : `−${v}%`)}
            style={{ fill: FAINT, fontSize: 10, fontFamily: CHART_MONO }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── 3. Retention cohort curve (Metrics) ──────────────────────────────────
export function RetentionCohortChart({
  data,
}: {
  data: { offsets: number[]; cohorts: { key: string; label: string; isLatest: boolean }[]; points: Record<string, number | null>[] };
}) {
  const reduced = usePrefersReducedMotion();
  if (!data.cohorts.length) return <ChartEmpty note="No cohort has reached D1 yet." height={220} />;
  return (
    <div>
      <ChartFigure label="Weekly cohorts, D0–D30" figure={`latest week of ${data.cohorts.at(-1)?.label}`} />
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data.points} margin={{ top: 4, right: 16, left: -16, bottom: 4 }}>
          <CartesianGrid stroke={grid} />
          <XAxis
            dataKey="offset"
            type="number"
            domain={[0, 30]}
            ticks={data.offsets}
            tick={axisTick}
            axisLine={{ stroke: LINE }}
            tickLine={false}
            label={{ value: "days since signup", position: "insideBottom", offset: -2, fontSize: 9.5, fill: FAINT, fontFamily: CHART_MONO }}
          />
          <YAxis tick={axisTick} unit="%" domain={[0, 100]} axisLine={false} tickLine={false} width={34} />
          <Tooltip content={<DarkTooltip />} />
          {data.cohorts.map((c) => (
            <Line
              key={c.key}
              dataKey={c.key}
              name={`wk of ${c.label}`}
              stroke={c.isLatest ? EMBER : MUTED}
              strokeWidth={c.isLatest ? 2.2 : 1.2}
              strokeOpacity={c.isLatest ? 1 : 0.55}
              dot={{ r: 2.5 }}
              connectNulls={false}
              isAnimationActive={!reduced}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 4. Twin readiness histogram (Metrics) ────────────────────────────────
export function ReadinessHistogram({ buckets, avgPct }: { buckets: Record<string, number>; avgPct: number | null }) {
  const reduced = usePrefersReducedMotion();
  const order = ["0_20", "20_40", "40_60", "60_80", "80_100"];
  const data = order.map((k) => ({ bucket: k.replace("_", "–") + "%", value: buckets[k] ?? 0 }));
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <ChartEmpty note="No profiles yet." />;
  return (
    <div>
      <ChartFigure label="Readiness distribution" figure={`avg ${avgPct ?? "—"}% · n=${total}`} />
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="bucket" tick={axisTick} axisLine={{ stroke: LINE }} tickLine={false} />
          <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={26} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
          <Bar dataKey="value" name="profiles" fill={MUTED} radius={[2, 2, 0, 0]} isAnimationActive={!reduced} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 5. MRR + paying users, dual line (Metrics) ───────────────────────────
export function MrrChart({ points }: { points: { date: string; mrrUsd: number | null; payingUsers: number | null }[] }) {
  const reduced = usePrefersReducedMotion();
  const withData = points.filter((p) => p.mrrUsd != null);
  if (withData.length < 2) return <ChartEmpty note="Not enough days of MRR history yet." />;
  const latest = withData.at(-1)!;
  return (
    <div>
      <ChartFigure label={`MRR — last ${points.length}d`} figure={`$${latest.mrrUsd?.toFixed(2)} · ${latest.payingUsers ?? 0} paying`} />
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={points} margin={{ top: 4, right: 30, left: -10, bottom: 0 }}>
          <CartesianGrid stroke={grid} />
          <XAxis dataKey="date" tick={axisTick} tickFormatter={(d: string) => d.slice(5)} axisLine={{ stroke: LINE }} tickLine={false} minTickGap={24} />
          <YAxis yAxisId="mrr" tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `$${v}`} />
          <YAxis yAxisId="users" orientation="right" tick={axisTick} axisLine={false} tickLine={false} width={26} allowDecimals={false} />
          <Tooltip content={<DarkTooltip />} />
          <Line yAxisId="mrr" dataKey="mrrUsd" name="MRR ($)" stroke={EMBER} strokeWidth={1.8} dot={false} connectNulls isAnimationActive={!reduced} />
          <Line yAxisId="users" dataKey="payingUsers" name="paying users" stroke={MUTED} strokeWidth={1.4} dot={false} connectNulls isAnimationActive={!reduced} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 6. LLM spend + revenue overlay (Metrics) ─────────────────────────────
export function LlmRevenueChart({ points }: { points: { date: string; llmCostUsd: number | null; revenueUsd: number | null }[] }) {
  const reduced = usePrefersReducedMotion();
  const withData = points.filter((p) => p.llmCostUsd != null || p.revenueUsd != null);
  if (withData.length < 2) return <ChartEmpty note="Not enough days of spend/revenue history yet." />;
  const latest = points.at(-1)!;
  return (
    <div>
      <ChartFigure
        label={`LLM spend vs revenue — last ${points.length}d`}
        figure={`spend $${(latest.llmCostUsd ?? 0).toFixed(2)} · revenue $${(latest.revenueUsd ?? 0).toFixed(2)}`}
      />
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={points} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke={grid} />
          <XAxis dataKey="date" tick={axisTick} tickFormatter={(d: string) => d.slice(5)} axisLine={{ stroke: LINE }} tickLine={false} minTickGap={24} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `$${v}`} />
          <Tooltip content={<DarkTooltip />} />
          <Line dataKey="revenueUsd" name="revenue ($)" stroke={MUTED} strokeWidth={1.6} dot={false} connectNulls isAnimationActive={!reduced} />
          <Line dataKey="llmCostUsd" name="LLM spend ($, partial)" stroke={EMBER} strokeWidth={1.8} dot={false} connectNulls isAnimationActive={!reduced} />
        </LineChart>
      </ResponsiveContainer>
      <p style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>LLM spend is a partial estimate — only twin_chat and interview_chat call sites are logged so far.</p>
    </div>
  );
}

// ── 7. Payment success by method, stacked bars over time (Metrics) ──────
export function PaymentSuccessChart({
  paymentsByMethod,
}: {
  paymentsByMethod: { method: string; points: { date: string; success: number; failed: number }[] }[];
}) {
  const reduced = usePrefersReducedMotion();
  const withTraffic = paymentsByMethod.filter((m) => m.points.length > 0);
  if (!withTraffic.length) return <ChartEmpty note="No payment attempts recorded yet." />;
  return (
    <div>
      {withTraffic.map((m) => {
        const totalSuccess = m.points.reduce((s, p) => s + p.success, 0);
        const totalFailed = m.points.reduce((s, p) => s + p.failed, 0);
        const rate = totalSuccess + totalFailed ? Math.round((totalSuccess / (totalSuccess + totalFailed)) * 1000) / 10 : null;
        return (
          <div key={m.method} style={{ marginBottom: 16 }}>
            <ChartFigure label={m.method} figure={`${rate ?? "—"}% success · ${totalSuccess + totalFailed} attempts`} />
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={m.points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="date" tick={axisTick} tickFormatter={(d: string) => d.slice(5)} axisLine={{ stroke: LINE }} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={24} />
                <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar dataKey="success" name="success" stackId="p" fill={MUTED} isAnimationActive={!reduced} />
                <Bar dataKey="failed" name="failed" stackId="p" fill={ALERT} isAnimationActive={!reduced} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

// ── 8. Resonance distribution, matched vs unmatched (Metrics) ───────────
// Ships as the honest empty state — resonance scoring isn't wired to real
// matches yet (see server/resonance.ts), so there's no real distribution to
// draw. Built so it lights up the moment that changes.
export function ResonanceHistogram({ scoredPct }: { scoredPct: number | null }) {
  if (scoredPct == null || scoredPct < 5) {
    return <ChartEmpty note="Resonance isn't wired to real matches yet — see server/resonance.ts. This chart activates once real scores exist." />;
  }
  return <ChartEmpty note="Resonance scores exist but the matched/unmatched split isn't built yet." />;
}

// ── Conversion by gate, ranked horizontal bar (Metrics) ──────────────────
export function ConversionByGateChart({ data }: { data: Record<string, number> }) {
  const reduced = usePrefersReducedMotion();
  const rows = Object.entries(data)
    .map(([gate, n]) => ({ gate: gate.replace(/_/g, " ").trim() || "(none / cold visit)", n: Number(n) }))
    .sort((a, b) => b.n - a.n);
  if (!rows.length) return <ChartEmpty note="No paid conversions that day." height={120} />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(90, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={grid} horizontal={false} />
        <XAxis type="number" tick={axisTick} allowDecimals={false} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="gate" width={150} tick={{ ...axisTick, fontSize: 10.5 }} axisLine={false} tickLine={false} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
        <Bar dataKey="n" name="conversions" fill={EMBER} radius={[0, 3, 3, 0]} isAnimationActive={!reduced} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Gender breakdown, ranked horizontal bar (Metrics) ────────────────────
// "Not set yet" and "Prefer not to say" are real, common answers here (a lot
// of accounts haven't finished Essentials) — shown in FAINT rather than
// dropped, so the total always reads as everyone on the platform, not just
// the people who picked an identity.
export function GenderBreakdownChart({ data }: { data: { value: string; label: string; count: number }[] }) {
  const reduced = usePrefersReducedMotion();
  const rows = [...data].sort((a, b) => b.count - a.count);
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (!total) return <ChartEmpty note="No users yet." height={140} />;
  const isUnknown = (value: string) => value === "unset" || value === "prefer-not";
  return (
    <ResponsiveContainer width="100%" height={Math.max(90, rows.length * 32)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 34, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={grid} horizontal={false} />
        <XAxis type="number" tick={axisTick} allowDecimals={false} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={130} tick={{ ...axisTick, fontSize: 10.5 }} axisLine={false} tickLine={false} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
        <Bar dataKey="count" name="users" radius={[0, 3, 3, 0]} isAnimationActive={!reduced}>
          {rows.map((r) => (
            <Cell key={r.value} fill={isUnknown(r.value) ? FAINT : MUTED} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            formatter={(v: any) => `${v} (${Math.round((Number(v) / total) * 100)}%)`}
            style={{ fill: FAINT, fontSize: 10, fontFamily: CHART_MONO }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Report volume strip (Reports page) ───────────────────────────────────
export function ReportVolumeStrip({ series }: { series: { date: string; value: number }[] }) {
  const reduced = usePrefersReducedMotion();
  const total = series.reduce((s, r) => s + r.value, 0);
  if (!total) return null; // nothing to add to an already-empty queue
  return (
    <div style={{ marginBottom: 16 }}>
      <ChartFigure label="Filed — last 14 days" figure={`${total} total`} />
      <ResponsiveContainer width="100%" height={72}>
        <BarChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 4 }} barCategoryGap="30%">
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[0, "dataMax"]} />
          <Bar dataKey="value" name="filed" fill={MUTED} radius={[2, 2, 0, 0]} isAnimationActive={!reduced} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
