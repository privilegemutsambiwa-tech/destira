// The "is anything wrong right now" screen. Phase 1/2 ships the pieces that
// exist (reports, feedback); Phase 3 adds MRR/error-rate/LLM-spend here once
// those rollups exist. Every number here is a cheap, live, indexed count —
// no metric_daily dependency yet.
import type { Express } from "express";
import { db } from "../db";
import { reports, feedback } from "@shared/schema";
import { eq, count, and, inArray } from "drizzle-orm";
import { adminRoute } from "./auth";
import { SAFETY_CATEGORIES } from "@shared/admin";

export function registerAdminOverviewRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/overview", "read_only", async (req, res) => {
    try {
      const [[open], [investigating], [safety], [openFeedback]] = await Promise.all([
        db.select({ n: count() }).from(reports).where(eq(reports.status, "open")),
        db.select({ n: count() }).from(reports).where(eq(reports.status, "investigating")),
        db
          .select({ n: count() })
          .from(reports)
          .where(
            and(
              inArray(reports.category, SAFETY_CATEGORIES as unknown as string[]),
              inArray(reports.status, ["open", "investigating"]),
            ),
          ),
        db.select({ n: count() }).from(feedback).where(eq(feedback.status, "open")),
      ]);
      res.json({
        computedAt: new Date().toISOString(),
        openReports: Number(open?.n ?? 0),
        investigatingReports: Number(investigating?.n ?? 0),
        safetyReportsOpen: Number(safety?.n ?? 0),
        openFeedback: Number(openFeedback?.n ?? 0),
        // Placeholders — real once Phase 3 rollups exist. Labelled, not faked.
        mrrUsd: null,
        llmSpendTodayUsd: null,
        errorRatePct: null,
      });
    } catch (e) {
      res.status(500).json({ message: "Failed to load overview" });
    }
  });
}
