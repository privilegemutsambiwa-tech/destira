// One email, read on a phone, leading with what changed — not a wall of
// numbers. Reads yesterday's (or last week's) metric_daily rollup; never
// recomputes. Recipient/on-off are the same email_alert_config table as the
// event alerts, keyed "daily_digest" / "weekly_digest" — one console screen.
import { db } from "../db";
import { metricDaily, reports, payments } from "@shared/schema";
import { eq, inArray, gte, lte, and } from "drizzle-orm";
import { sendConfiguredEmail } from "./index";

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

async function valuesFor(date: string): Promise<Record<string, number>> {
  const rows = await db.select().from(metricDaily).where(eq(metricDaily.date, date));
  return Object.fromEntries(rows.map((r) => [r.metricKey, Number(r.value)]));
}

async function valuesForRange(from: string, to: string): Promise<Record<string, number>> {
  const rows = await db.select().from(metricDaily).where(and(gte(metricDaily.date, from), lte(metricDaily.date, to)));
  const sums: Record<string, number> = {};
  for (const r of rows) sums[r.metricKey] = (sums[r.metricKey] ?? 0) + Number(r.value);
  return sums;
}

function paymentSuccessLine(v: Record<string, number>): string {
  const entries = Object.entries(v).filter(([k]) => k.startsWith("money.payment_success_pct."));
  return entries.length ? entries.map(([k, val]) => `${k.replace("money.payment_success_pct.", "")}: ${val}%`).join(", ") : "no payments";
}

export async function sendDailyDigest(): Promise<void> {
  const date = isoDaysAgo(1);
  const v = await valuesFor(date);
  const openReports = (await db.select().from(reports).where(inArray(reports.status, ["open", "investigating"]))).length;

  const leads: string[] = [];
  if (v["moderation.open_reports"] > 0) leads.push(`${v["moderation.open_reports"]} open report(s)`);
  if ((v["money.churn_involuntary"] ?? 0) > 0) leads.push(`${v["money.churn_involuntary"]} involuntary churn`);
  if ((v["growth.signups"] ?? 0) === 0) leads.push("zero signups yesterday");

  const text = [
    leads.length ? `Needs attention: ${leads.join(", ")}.` : "Nothing flagged.",
    "",
    `Signups: ${v["growth.signups"] ?? 0}  ·  DAU: ${v["growth.dau"] ?? "—"}`,
    `Twin generated: ${v["funnel.twin_generated"] ?? "—"}  ·  activated <24h: ${v["activation.d1_pct"] ?? "—"}%`,
    `Matches: ${v["match.mutual_matches_of_cohort"] ?? 0} of ${v["match.asks"] ?? 0} asks (${v["match.ask_to_match_pct"] ?? "—"}%)`,
    "",
    `MRR: $${(v["money.mrr_usd"] ?? 0).toFixed(2)}  ·  revenue: $${(v["money.revenue_usd"] ?? 0).toFixed(2)}`,
    `Payment success — ${paymentSuccessLine(v)}`,
    "",
    `Open reports (right now): ${openReports}`,
    `LLM spend (est.): $${(v["llm.cost_usd_estimated"] ?? 0).toFixed(4)}`,
    "",
    `${(process.env.PUBLIC_APP_URL || "http://localhost:5000")}/console/metrics?date=${date}`,
  ].join("\n");

  await sendConfiguredEmail("daily_digest", `Destira daily — ${date}${leads.length ? ` (${leads.length} flagged)` : ""}`, text);
}

export async function sendWeeklyDigest(): Promise<void> {
  const to = isoDaysAgo(1);
  const from = isoDaysAgo(7);
  const v = await valuesForRange(from, to);
  const retD7 = await valuesFor(isoDaysAgo(14)); // the cohort old enough to have a D7 number by now

  const text = [
    `Week of ${from} to ${to}.`,
    "",
    `Signups: ${v["growth.signups"] ?? 0}`,
    `Matches: ${v["match.mutual_matches_of_cohort"] ?? 0} of ${v["match.asks"] ?? 0} asks`,
    `Revenue: $${(v["money.revenue_usd"] ?? 0).toFixed(2)}  ·  new MRR movement: churn (vol/invol): ${v["money.churn_voluntary"] ?? 0}/${v["money.churn_involuntary"] ?? 0}`,
    "",
    `Retention D7 (${isoDaysAgo(14)} cohort): ${retD7["retention.d7_pct"] ?? "—"}%`,
    `LLM spend (est., 7d): $${(v["llm.cost_usd_estimated"] ?? 0).toFixed(2)}`,
    "",
    `${(process.env.PUBLIC_APP_URL || "http://localhost:5000")}/console/metrics`,
  ].join("\n");

  await sendConfiguredEmail("weekly_digest", `Destira weekly — ${from} to ${to}`, text);
}
