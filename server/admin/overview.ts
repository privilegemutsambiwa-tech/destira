// The "is anything wrong right now" screen: open reports, failed payments,
// error rate, LLM spend, MRR — everything else lives behind nav.
import type { Express } from "express";
import { db } from "../db";
import { reports, feedback, payments, metricDaily } from "@shared/schema";
import { eq, count, and, inArray, gte, lt, desc, like } from "drizzle-orm";
import { adminRoute } from "./auth";
import { SAFETY_CATEGORIES } from "@shared/admin";
import { currentErrorRate } from "./error-rate";

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}
async function latestValue(key: string): Promise<number | null> {
  const [row] = await db.select().from(metricDaily).where(eq(metricDaily.metricKey, key)).orderBy(desc(metricDaily.date)).limit(1);
  return row ? Number(row.value) : null;
}
async function valueOnDate(key: string, date: string): Promise<number | null> {
  const [row] = await db.select().from(metricDaily).where(and(eq(metricDaily.metricKey, key), eq(metricDaily.date, date)));
  return row ? Number(row.value) : null;
}
async function sumByPrefixOnDate(prefix: string, date: string): Promise<number> {
  const rows = await db.select().from(metricDaily).where(and(like(metricDaily.metricKey, `${prefix}%`), eq(metricDaily.date, date)));
  return rows.reduce((s, r) => s + Number(r.value), 0);
}
/** A plain {date, value} series for one metric key, oldest first — the shape
 *  the Overview sparklines and signups chart draw directly. */
async function seriesForKey(key: string, days: number): Promise<{ date: string; value: number }[]> {
  const rows = await db
    .select()
    .from(metricDaily)
    .where(and(eq(metricDaily.metricKey, key), gte(metricDaily.date, isoDaysAgo(days - 1))))
    .orderBy(metricDaily.date);
  return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
}

export function registerAdminOverviewRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/overview", "read_only", async (req, res) => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const yesterday = isoDaysAgo(1);
      const dayBeforeYesterday = isoDaysAgo(2);

      const [
        [open],
        [investigating],
        [safety],
        [openFeedback],
        [failedPaymentsToday],
        mrr,
        llmToday,
        err,
        openReportsYesterday,
        investigatingYesterday,
        safetyYesterday,
        openFeedbackYesterday,
        failedPaymentsYesterday,
        mrrDayBefore,
        llmDayBefore,
        payingUsers,
      ] = await Promise.all([
        db.select({ n: count() }).from(reports).where(eq(reports.status, "open")),
        db.select({ n: count() }).from(reports).where(eq(reports.status, "investigating")),
        db
          .select({ n: count() })
          .from(reports)
          .where(and(inArray(reports.category, SAFETY_CATEGORIES as unknown as string[]), inArray(reports.status, ["open", "investigating"]))),
        db.select({ n: count() }).from(feedback).where(eq(feedback.status, "open")),
        db.select({ n: count() }).from(payments).where(and(gte(payments.createdAt, todayStart), eq(payments.status, "failed"))),
        latestValue("money.mrr_usd"),
        latestValue("llm.cost_usd_estimated"),
        Promise.resolve(currentErrorRate()),
        // "Was X yesterday" — a snapshot from last night's rollup, compared
        // against each of these counts' live value right now. Not a strict
        // day-over-day delta (the live side is "as of this instant"), but
        // it's the honest comparison the data actually supports.
        valueOnDate("moderation.open_reports", yesterday),
        valueOnDate("moderation.investigating_reports", yesterday),
        valueOnDate("moderation.safety_reports_open", yesterday),
        valueOnDate("moderation.open_feedback", yesterday),
        valueOnDate("money.failed_payments", yesterday),
        valueOnDate("money.mrr_usd", dayBeforeYesterday),
        valueOnDate("llm.cost_usd_estimated", dayBeforeYesterday),
        sumByPrefixOnDate("money.paid_subscribers.", yesterday),
      ]);

      const [signups30d, sparkOpenReports, sparkSafety, sparkFeedback, sparkFailedPayments, sparkMrr, sparkLlm] = await Promise.all([
        seriesForKey("growth.signups", 30),
        seriesForKey("moderation.open_reports", 14),
        seriesForKey("moderation.safety_reports_open", 14),
        seriesForKey("moderation.open_feedback", 14),
        seriesForKey("money.failed_payments", 14),
        seriesForKey("money.mrr_usd", 14),
        seriesForKey("llm.cost_usd_estimated", 14),
      ]);

      res.json({
        computedAt: new Date().toISOString(),
        openReports: Number(open?.n ?? 0),
        openReportsYesterday,
        investigatingReports: Number(investigating?.n ?? 0),
        investigatingReportsYesterday: investigatingYesterday,
        safetyReportsOpen: Number(safety?.n ?? 0),
        safetyReportsOpenYesterday: safetyYesterday,
        openFeedback: Number(openFeedback?.n ?? 0),
        openFeedbackYesterday,
        failedPaymentsToday: Number(failedPaymentsToday?.n ?? 0),
        failedPaymentsYesterday,
        mrrUsd: mrr, // from yesterday's rollup — see /api/admin/metrics/summary for the date
        mrrUsdDayBefore: mrrDayBefore,
        payingUsersCount: payingUsers, // as of the same rollup date as mrrUsd
        llmSpendYesterdayUsd: llmToday,
        llmSpendDayBeforeUsd: llmDayBefore,
        errorRatePct: err.pct,
        errorRateSampleSize: err.sampleSize,
        errorRateWindowMinutes: err.windowMinutes,
        signups30d,
        sparklines: {
          openReports: sparkOpenReports.map((r) => r.value),
          safetyReportsOpen: sparkSafety.map((r) => r.value),
          openFeedback: sparkFeedback.map((r) => r.value),
          failedPaymentsToday: sparkFailedPayments.map((r) => r.value),
          mrrUsd: sparkMrr.map((r) => r.value),
          llmSpendYesterdayUsd: sparkLlm.map((r) => r.value),
        },
      });
    } catch (e) {
      console.error("[admin] overview error:", e);
      res.status(500).json({ message: "Failed to load overview" });
    }
  });
}
