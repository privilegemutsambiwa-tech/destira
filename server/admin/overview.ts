// The "is anything wrong right now" screen: open reports, failed payments,
// error rate, LLM spend, MRR — everything else lives behind nav.
import type { Express } from "express";
import { db } from "../db";
import { reports, feedback, payments, metricDaily, events, llmCallLog } from "@shared/schema";
import { eq, count, and, inArray, gte, lt, desc, asc, like, sum } from "drizzle-orm";
import { adminRoute } from "./auth";
import { SAFETY_CATEGORIES, REPORT_CATEGORY_LABEL, FEEDBACK_CATEGORY_LABEL } from "@shared/admin";
import { LIMITS } from "@shared/entitlements";
import { currentErrorRate, failureSummary, ERROR_WINDOW_MS, ERROR_RETAIN_MS } from "./error-rate";

// One line in a tile's "what's behind this number" panel.
interface DetailRow {
  title: string;
  subtitle?: string;
  meta?: string;
  tone?: "alert";
  href?: string;
}
interface TileDetail {
  title: string;
  intro: string;
  rows: DetailRow[];
  empty: string;
  viewAll?: { href: string; label: string };
}

function ago(d: Date | string | number | null | undefined): string {
  if (!d) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
const excerpt = (t: string | null | undefined, n = 140) => {
  const x = (t ?? "").replace(/\s+/g, " ").trim();
  return x.length > n ? `${x.slice(0, n - 1)}…` : x;
};
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const TILE_LIMIT = 8;

async function reportRows(statuses: string[], safetyOnly: boolean): Promise<{ rows: DetailRow[]; total: number }> {
  const cond = safetyOnly
    ? and(inArray(reports.status, statuses), inArray(reports.category, SAFETY_CATEGORIES as unknown as string[]))
    : inArray(reports.status, statuses);
  const [list, [total]] = await Promise.all([
    db.select().from(reports).where(cond).orderBy(asc(reports.createdAt)).limit(TILE_LIMIT),
    db.select({ n: count() }).from(reports).where(cond),
  ]);
  return {
    total: Number(total?.n ?? 0),
    rows: list.map((r) => ({
      title: (REPORT_CATEGORY_LABEL as Record<string, string>)[r.category] ?? r.category,
      subtitle: excerpt(r.freeText) || "No description written",
      meta: `${r.status} · opened ${ago(r.createdAt)}`,
      tone: (SAFETY_CATEGORIES as readonly string[]).includes(r.category) ? ("alert" as const) : undefined,
      href: `/console/reports/${r.id}`,
    })),
  };
}

export async function tileDetail(tile: string): Promise<TileDetail | null> {
  switch (tile) {
    case "openReports":
    case "investigating":
    case "safety": {
      const cfg = {
        openReports: { title: "Open reports", statuses: ["open"], safety: false, intro: "Reports nobody has picked up yet, oldest first." },
        investigating: { title: "Investigating", statuses: ["investigating"], safety: false, intro: "Reports someone is currently looking into, oldest first." },
        safety: { title: "Safety-category open", statuses: ["open", "investigating"], safety: true, intro: "Reports about real-world danger or someone who may be underage. These come first." },
      }[tile]!;
      const { rows, total } = await reportRows(cfg.statuses, cfg.safety);
      return {
        title: cfg.title,
        intro: `${cfg.intro}${total > rows.length ? ` Showing ${rows.length} of ${total}.` : ""}`,
        rows,
        empty: "Nothing here. That's the good answer.",
        viewAll: { href: "/console/reports", label: "Open the reports queue" },
      };
    }
    case "feedback": {
      const [list, [total]] = await Promise.all([
        db.select().from(feedback).where(eq(feedback.status, "open")).orderBy(asc(feedback.createdAt)).limit(TILE_LIMIT),
        db.select({ n: count() }).from(feedback).where(eq(feedback.status, "open")),
      ]);
      const totalN = Number(total?.n ?? 0);
      return {
        title: "Open feedback",
        intro: `What members have written in that you haven't marked reviewed.${totalN > list.length ? ` Showing ${list.length} of ${totalN}.` : ""}`,
        rows: list.map((f) => ({
          title: (FEEDBACK_CATEGORY_LABEL as Record<string, string>)[f.category] ?? f.category,
          subtitle: excerpt(f.freeText),
          meta: [f.platform, f.appVersion, ago(f.createdAt)].filter(Boolean).join(" · "),
          href: "/console/feedback",
        })),
        empty: "No unread feedback.",
        viewAll: { href: "/console/feedback", label: "Open all feedback" },
      };
    }
    case "failedPayments": {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const list = await db
        .select()
        .from(payments)
        .where(and(gte(payments.createdAt, todayStart), eq(payments.status, "failed")))
        .orderBy(desc(payments.createdAt))
        .limit(TILE_LIMIT);
      return {
        title: "Failed payments today",
        intro: "Attempts that did not go through today, newest first. Phone numbers are masked.",
        rows: list.map((p) => ({
          title: `${usd(p.amount)} · ${p.tier ?? "unknown plan"} · ${p.period}`,
          subtitle: p.failureReason || p.rawStatus || "The provider gave no reason",
          meta: [p.provider, p.phoneNumberMasked, ago(p.createdAt)].filter(Boolean).join(" · "),
          tone: "alert" as const,
        })),
        empty: "No failed payments today.",
      };
    }
    case "mrr": {
      const tiers = ["spark", "flame", "ember"] as const;
      const counts = await Promise.all(tiers.map((t) => latestValue(`money.paid_subscribers.${t}`)));
      const rows: DetailRow[] = tiers.map((t, i) => {
        const n = counts[i] ?? 0;
        const price = (LIMITS as any)[t]?.priceCents ?? 0;
        return {
          title: `${t[0].toUpperCase()}${t.slice(1)} · ${n} paying`,
          subtitle: `${n} × ${usd(price)} per month = ${usd(n * price)}`,
        };
      });
      return {
        title: "Monthly recurring revenue",
        intro: "Where the number comes from: paying members by plan, from the latest nightly count.",
        rows,
        empty: "No paying members yet.",
        viewAll: { href: "/console/metrics", label: "Open money metrics" },
      };
    }
    case "llm": {
      const start = new Date(`${isoDaysAgo(1)}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 86400000);
      const list = await db
        .select({ callType: llmCallLog.callType, cost: sum(llmCallLog.costUsd), n: count() })
        .from(llmCallLog)
        .where(and(gte(llmCallLog.createdAt, start), lt(llmCallLog.createdAt, end)))
        .groupBy(llmCallLog.callType);
      return {
        title: "AI spend yesterday (estimated)",
        intro: "Which features used the AI, most expensive first. Estimated from token counts, not billed amounts.",
        rows: list
          .sort((a, b) => Number(b.cost ?? 0) - Number(a.cost ?? 0))
          .map((r) => ({
            title: r.callType.replace(/_/g, " "),
            subtitle: `$${Number(r.cost ?? 0).toFixed(4)} across ${Number(r.n)} call${Number(r.n) === 1 ? "" : "s"}`,
          })),
        empty: "No AI calls were logged yesterday.",
        viewAll: { href: "/console/metrics", label: "Open AI cost metrics" },
      };
    }
    default:
      return null;
  }
}

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
  // "What's behind this number" for one overview tile: the actual reports,
  // payments, plans or AI features that add up to it.
  adminRoute(app, "get", "/api/admin/overview/details/:tile", "read_only", async (req, res) => {
    try {
      const detail = await tileDetail(String(req.params.tile));
      if (!detail) return res.status(404).json({ message: "Unknown tile" });
      res.json(detail);
    } catch (e) {
      console.error("[admin] overview detail error:", e);
      res.status(500).json({ message: "Failed to load details" });
    }
  });

  // The failures behind the error-rate number: grouped by what broke, with a
  // plain-English reading and the underlying message. In memory, so it resets
  // whenever the server restarts.
  adminRoute(app, "get", "/api/admin/errors/recent", "support", async (_req, res) => {
    res.json({
      rate: currentErrorRate(),
      window: failureSummary(ERROR_WINDOW_MS),
      last24h: failureSummary(ERROR_RETAIN_MS),
      note: "Kept in memory since the server last restarted (up to 24 hours, newest 500).",
    });
  });

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
        [pendingEvents],
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
        // Live count, not a rollup metric like the others below — this is a
        // queue that should always be near zero, so a day-over-day sparkline
        // adds little; the nav badge just needs "is there anything to look at".
        db.select({ n: count() }).from(events).where(eq(events.status, "pending_review")),
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
        pendingEvents: Number(pendingEvents?.n ?? 0),
        failedPaymentsToday: Number(failedPaymentsToday?.n ?? 0),
        failedPaymentsYesterday,
        mrrUsd: mrr, // from yesterday's rollup — see /api/admin/metrics/summary for the date
        mrrUsdDayBefore: mrrDayBefore,
        payingUsersCount: payingUsers, // as of the same rollup date as mrrUsd
        llmSpendYesterdayUsd: llmToday,
        llmSpendDayBeforeUsd: llmDayBefore,
        errorRatePct: err.pct,
        errorRateSampleSize: err.sampleSize,
        errorRateFailedCount: err.failedCount,
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
