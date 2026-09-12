// Reads metric_daily exclusively (see build report §5) except the overview's
// genuinely-live error rate. Every response states its date / last-computed
// time; nothing here recomputes from OLTP tables on request.
import type { Express } from "express";
import { db } from "../db";
import { metricDaily } from "@shared/schema";
import { and, gte, lte, like, desc, eq } from "drizzle-orm";
import { adminRoute } from "./auth";
import { currentErrorRate } from "./error-rate";
import { computeDailyMetrics, backfillRecentMetrics } from "./metrics-rollup";

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

async function getRange(prefix: string, from: string, to: string) {
  return db
    .select()
    .from(metricDaily)
    .where(and(gte(metricDaily.date, from), lte(metricDaily.date, to), like(metricDaily.metricKey, `${prefix}%`)))
    .orderBy(metricDaily.date);
}

async function latestValue(key: string, from: string, to: string): Promise<number | null> {
  const [row] = await db
    .select()
    .from(metricDaily)
    .where(and(eq(metricDaily.metricKey, key), gte(metricDaily.date, from), lte(metricDaily.date, to)))
    .orderBy(desc(metricDaily.date))
    .limit(1);
  return row ? Number(row.value) : null;
}

function seriesFor(rows: { date: string; metricKey: string; value: string }[], key: string) {
  return rows.filter((r) => r.metricKey === key).map((r) => ({ date: r.date, value: Number(r.value) }));
}
function bucketsFor(rows: { date: string; metricKey: string; value: string }[], prefix: string, date: string) {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.date === date && r.metricKey.startsWith(prefix)) out[r.metricKey.slice(prefix.length)] = Number(r.value);
  }
  return out;
}

export function registerAdminMetricsRoutes(app: Express) {
  // Raw series — for the console's own charts, or any future export.
  adminRoute(app, "get", "/api/admin/metrics/series", "support", async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : isoDaysAgo(30);
    const to = typeof req.query.to === "string" ? req.query.to : isoDaysAgo(0);
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : "";
    try {
      const rows = await getRange(prefix, from, to);
      res.json({ from, to, rows: rows.map((r) => ({ date: r.date, metricKey: r.metricKey, value: Number(r.value), computedAt: r.computedAt })) });
    } catch (e) {
      res.status(500).json({ message: "Failed to load metrics" });
    }
  });

  // The dashboard shape — one call, everything grouped, for a given date
  // (defaults to the most recently computed day, usually yesterday).
  adminRoute(app, "get", "/api/admin/metrics/summary", "support", async (req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : isoDaysAgo(1);
    const from = isoDaysAgo(30);
    try {
      const rows = await getRange("", from, isoDaysAgo(0));
      const err = currentErrorRate();
      const [latestRow] = await db.select().from(metricDaily).orderBy(desc(metricDaily.date)).limit(1);

      res.json({
        date,
        latestAvailableDate: latestRow?.date ?? null,
        computedRange: { from, to: isoDaysAgo(0) },
        live: { errorRatePct: err.pct, errorSampleSize: err.sampleSize, errorWindowMinutes: err.windowMinutes },
        growth: {
          signups: seriesFor(rows, "growth.signups"),
          dau: seriesFor(rows, "growth.dau"),
          wau: seriesFor(rows, "growth.wau"),
          mau: seriesFor(rows, "growth.mau"),
        },
        funnel: {
          signup: bucketsFor(rows, "funnel.", date).signup ?? null,
          basics_complete: bucketsFor(rows, "funnel.", date).basics_complete ?? null,
          soul_answer: bucketsFor(rows, "funnel.", date).soul_answer ?? null,
          twin_generated: bucketsFor(rows, "funnel.", date).twin_generated ?? null,
          first_interview: bucketsFor(rows, "funnel.", date).first_interview ?? null,
          first_match: bucketsFor(rows, "funnel.", date).first_match ?? null,
          activationD1Pct: await latestValue("activation.d1_pct", date, date),
        },
        retention: {
          d1Pct: await latestValue("retention.d1_pct", from, isoDaysAgo(0)),
          d7Pct: await latestValue("retention.d7_pct", from, isoDaysAgo(0)),
          d30Pct: await latestValue("retention.d30_pct", from, isoDaysAgo(0)),
        },
        twin: {
          interviewsStarted: bucketsFor(rows, "twin.", date).interviews_started ?? null,
          interviewsCompleted: bucketsFor(rows, "twin.", date).interviews_completed ?? null,
          abandonPct: bucketsFor(rows, "twin.", date).interview_abandon_pct ?? null,
          readinessAvg: bucketsFor(rows, "twin.", date).readiness_avg ?? null,
          readinessBuckets: bucketsFor(rows, "twin.readiness_bucket.", date),
          disclosureOpenCount: bucketsFor(rows, "twin.", date).disclosure_open_count ?? null,
          disclosureByCategory: bucketsFor(rows, "twin.disclosure_open.", date),
        },
        matching: {
          likesSent: bucketsFor(rows, "match.", date).likes_sent ?? null,
          asks: bucketsFor(rows, "match.", date).asks ?? null,
          mutualMatches: bucketsFor(rows, "match.", date).mutual_matches_of_cohort ?? null,
          askToMatchPct: bucketsFor(rows, "match.", date).ask_to_match_pct ?? null,
          zeroMatches14dPct: bucketsFor(rows, "match.", date).zero_matches_14d_pct ?? null,
          resonanceScoredPct: bucketsFor(rows, "match.", date).resonance_scored_pct ?? null,
        },
        money: {
          mrrUsd: bucketsFor(rows, "money.", date).mrr_usd ?? null,
          arpuUsd: bucketsFor(rows, "money.", date).arpu_usd ?? null,
          revenueUsd: bucketsFor(rows, "money.", date).revenue_usd ?? null,
          paidSubscribersByTier: bucketsFor(rows, "money.paid_subscribers.", date),
          paymentSuccessPctByMethod: bucketsFor(rows, "money.payment_success_pct.", date),
          conversionByGate: bucketsFor(rows, "money.conversion_by_gate.", date),
          churnVoluntary: bucketsFor(rows, "money.", date).churn_voluntary ?? null,
          churnInvoluntary: bucketsFor(rows, "money.", date).churn_involuntary ?? null,
        },
        proximity: {
          alertsFired: bucketsFor(rows, "proximity.", date).alerts_fired ?? null,
          alertsDismissed: bucketsFor(rows, "proximity.", date).alerts_dismissed ?? null,
          alertsSeen: bucketsFor(rows, "proximity.", date).alerts_seen ?? null,
          freeToPaidPct: bucketsFor(rows, "proximity.", date).free_to_paid_pct ?? null,
        },
        events: {
          created: bucketsFor(rows, "events.", date).created ?? null,
          published: bucketsFor(rows, "events.", date).published ?? null,
          rsvpsGoing: bucketsFor(rows, "events.", date).rsvps_going ?? null,
          noShowRate: null, // not buildable — no check-in data, see build report
        },
        moderation: {
          openReports: bucketsFor(rows, "moderation.", date).open_reports ?? null,
          actionsTaken: bucketsFor(rows, "moderation.", date).actions_taken ?? null,
          medianResolutionHours: bucketsFor(rows, "moderation.", date).median_resolution_hours ?? null,
        },
        llm: {
          costUsdEstimated: bucketsFor(rows, "llm.", date).cost_usd_estimated ?? null,
          costPerActiveUserUsdEstimated: bucketsFor(rows, "llm.", date).cost_per_active_user_usd_estimated ?? null,
          note: "Estimated from published per-token rates and (where the SDK provides it) actual token counts — not a bill. Only twin_chat and interview_chat call sites are logged so far; about-me/summary/memory-extraction/disclosure calls aren't yet.",
        },
      });
    } catch (e) {
      console.error("[admin] metrics summary error:", e);
      res.status(500).json({ message: "Failed to load metrics" });
    }
  });

  // Manual recompute — useful right after this ships (rather than waiting
  // for the next nightly run) and for verifying a fix.
  adminRoute(app, "post", "/api/admin/metrics/recompute", "admin", async (req, res) => {
    const date = typeof req.body?.date === "string" ? req.body.date : isoDaysAgo(1);
    try {
      await computeDailyMetrics(date);
      res.json({ ok: true, date });
    } catch (e) {
      console.error("[admin] recompute error:", e);
      res.status(500).json({ message: "Recompute failed" });
    }
  });

  adminRoute(app, "post", "/api/admin/metrics/backfill", "admin", async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.body?.days) || 30));
    backfillRecentMetrics(days)
      .then(() => console.log(`[admin] metrics backfill (${days}d) complete`))
      .catch((e) => console.error("[admin] backfill error:", e));
    res.json({ ok: true, started: true, days });
  });

  // MRR/paying-users, LLM-spend/revenue, and payment-success-by-method —
  // three of the console's charts share this one series fetch since they're
  // all "money over time" and it's cheap to compute together.
  adminRoute(app, "get", "/api/admin/metrics/money-series", "support", async (req, res) => {
    const days = Math.min(180, Math.max(7, Number(req.query.days) || 90));
    const from = isoDaysAgo(days - 1);
    const to = isoDaysAgo(0);
    try {
      const [mrrRows, paidRows, llmRows, revenueRows, paymentTotalRows, paymentSuccessRows] = await Promise.all([
        getRange("money.mrr_usd", from, to),
        getRange("money.paid_subscribers.", from, to),
        getRange("llm.cost_usd_estimated", from, to),
        getRange("money.revenue_usd", from, to),
        getRange("money.payment_count.", from, to),
        getRange("money.payment_success_count.", from, to),
      ]);
      const dateSet = new Set<string>([...mrrRows, ...paidRows, ...llmRows, ...revenueRows].map((r) => r.date));
      const dates = Array.from(dateSet).sort();
      const onDate = (rows: typeof mrrRows, date: string, key: string) => {
        const row = rows.find((r) => r.date === date && r.metricKey === key);
        return row ? Number(row.value) : null;
      };
      const sumOnDate = (rows: typeof mrrRows, date: string) => {
        const matches = rows.filter((r) => r.date === date);
        return matches.length ? matches.reduce((s, r) => s + Number(r.value), 0) : null;
      };

      const points = dates.map((date) => ({
        date,
        mrrUsd: onDate(mrrRows, date, "money.mrr_usd"),
        payingUsers: sumOnDate(paidRows, date),
        llmCostUsd: onDate(llmRows, date, "llm.cost_usd_estimated"),
        revenueUsd: onDate(revenueRows, date, "money.revenue_usd"),
      }));

      // Payment methods seen anywhere in the window, each with a
      // success/failed count per day it actually had traffic — no bar for a
      // day with no attempts, rather than a zero-height one.
      const methods = Array.from(new Set(paymentTotalRows.map((r) => r.metricKey.replace("money.payment_count.", ""))));
      const paymentsByMethod = methods.map((method) => ({
        method,
        points: dates
          .map((date) => {
            const total = onDate(paymentTotalRows, date, `money.payment_count.${method}`) ?? 0;
            const success = onDate(paymentSuccessRows, date, `money.payment_success_count.${method}`) ?? 0;
            return { date, success, failed: Math.max(0, total - success) };
          })
          .filter((p) => p.success > 0 || p.failed > 0),
      }));

      res.json({ from, to, points, paymentsByMethod });
    } catch (e) {
      console.error("[admin] money-series error:", e);
      res.status(500).json({ message: "Failed to load money series" });
    }
  });

  // Weekly signup cohorts' D1/D7/D30 retention, for the cohort-curve chart.
  // Reuses the existing daily-cohort retention.* rows (unweighted average
  // across the days in each week) rather than a new per-offset rollup — at
  // today's signup volume a handful of cohorts wide, weighting by cohort
  // size wouldn't change the picture, and it keeps this additive rather than
  // a new nightly computation.
  adminRoute(app, "get", "/api/admin/metrics/retention-cohorts", "support", async (req, res) => {
    try {
      const from = isoDaysAgo(70);
      const rows = await getRange("retention.", from, isoDaysAgo(0));
      const weekOf = (dateStr: string) => {
        const d = new Date(`${dateStr}T00:00:00.000Z`);
        const dayIdx = (d.getUTCDay() + 6) % 7; // Monday = 0
        d.setUTCDate(d.getUTCDate() - dayIdx);
        return d.toISOString().slice(0, 10);
      };
      const byWeek = new Map<string, { d1: number[]; d7: number[]; d30: number[] }>();
      for (const r of rows) {
        const wk = weekOf(r.date);
        const bucket = byWeek.get(wk) ?? { d1: [], d7: [], d30: [] };
        const v = Number(r.value);
        if (r.metricKey === "retention.d1_pct") bucket.d1.push(v);
        else if (r.metricKey === "retention.d7_pct") bucket.d7.push(v);
        else if (r.metricKey === "retention.d30_pct") bucket.d30.push(v);
        byWeek.set(wk, bucket);
      }
      const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
      const weeks = Array.from(byWeek.keys())
        .sort()
        .slice(-6);
      const cohorts = weeks.map((wk, i) => ({
        key: wk,
        label: wk,
        isLatest: i === weeks.length - 1,
        d1: avg(byWeek.get(wk)!.d1),
        d7: avg(byWeek.get(wk)!.d7),
        d30: avg(byWeek.get(wk)!.d30),
      }));
      const offsets = [0, 1, 7, 30];
      const points = offsets.map((offset) => {
        const point: Record<string, number | null> = { offset };
        for (const c of cohorts) point[c.key] = offset === 0 ? 100 : offset === 1 ? c.d1 : offset === 7 ? c.d7 : c.d30;
        return point;
      });
      res.json({ offsets, cohorts: cohorts.map(({ key, label, isLatest }) => ({ key, label, isLatest })), points });
    } catch (e) {
      console.error("[admin] retention-cohorts error:", e);
      res.status(500).json({ message: "Failed to load retention cohorts" });
    }
  });
}
