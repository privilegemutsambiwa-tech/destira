// The "is anything wrong right now" screen: open reports, failed payments,
// error rate, LLM spend, MRR — everything else lives behind nav.
import type { Express } from "express";
import { db } from "../db";
import { reports, feedback, payments, metricDaily } from "@shared/schema";
import { eq, count, and, inArray, gte, lt, desc } from "drizzle-orm";
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

export function registerAdminOverviewRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/overview", "read_only", async (req, res) => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [[open], [investigating], [safety], [openFeedback], [failedPaymentsToday], mrr, llmToday, err] = await Promise.all([
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
      ]);

      res.json({
        computedAt: new Date().toISOString(),
        openReports: Number(open?.n ?? 0),
        investigatingReports: Number(investigating?.n ?? 0),
        safetyReportsOpen: Number(safety?.n ?? 0),
        openFeedback: Number(openFeedback?.n ?? 0),
        failedPaymentsToday: Number(failedPaymentsToday?.n ?? 0),
        mrrUsd: mrr, // from yesterday's rollup — see /api/admin/metrics/summary for the date
        llmSpendYesterdayUsd: llmToday,
        errorRatePct: err.pct,
        errorRateSampleSize: err.sampleSize,
        errorRateWindowMinutes: err.windowMinutes,
      });
    } catch (e) {
      console.error("[admin] overview error:", e);
      res.status(500).json({ message: "Failed to load overview" });
    }
  });
}
