// The console's Growth page: where signups come from, whether they finish
// setting up and come back, and how invites and shares are doing.
//
// Unlike metrics.ts this reads live tables rather than metric_daily — every
// query is bounded to one window of signups (at most 90 days), which stays
// cheap at this size, and it means a referral or share shows up the moment it
// happens instead of after the nightly rollup.
import type { Express } from "express";
import { db } from "../db";
import { users, profiles, signupSources, referrals, shareEvents, userActivityDaily } from "@shared/schema";
import { and, eq, gte, ne, sql, count, inArray } from "drizzle-orm";
import { DESTIRA_SYSTEM_USER_ID } from "../system-user";
import { adminRoute } from "./auth";

const WINDOWS = [7, 30, 90] as const;
const DAY_MS = 86400000;

export function registerAdminGrowthRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/growth", "support", async (req, res) => {
    try {
      const requested = Number(req.query.days);
      const days = (WINDOWS as readonly number[]).includes(requested) ? requested : 30;
      const since = new Date(Date.now() - days * DAY_MS);
      // "Came back" needs a full first week to have happened.
      const weekAgo = new Date(Date.now() - 7 * DAY_MS);
      const inWindow = and(gte(users.createdAt, since), ne(users.id, DESTIRA_SYSTEM_USER_ID));

      const cohort = await db
        .select({
          id: users.id,
          createdAt: users.createdAt,
          source: signupSources.source,
          detail: signupSources.detail,
          onboarded: profiles.onboardingCompleted,
        })
        .from(users)
        .leftJoin(signupSources, eq(signupSources.userId, users.id))
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .where(inWindow);

      // Any activity on days 1–7 after the signup day.
      const returned = await db
        .selectDistinct({ userId: userActivityDaily.userId })
        .from(userActivityDaily)
        .innerJoin(users, eq(users.id, userActivityDaily.userId))
        .where(
          and(
            inWindow,
            sql`${userActivityDaily.date} > (${users.createdAt})::date`,
            sql`${userActivityDaily.date} <= (${users.createdAt})::date + 7`,
          ),
        );
      const returnedIds = new Set(returned.map((r) => r.userId));

      type Row = { source: string; signups: number; finishedSetup: number; measurable: number; cameBack: number };
      const bySource = new Map<string, Row>();
      const byDay = new Map<string, Record<string, number>>();
      for (const u of cohort) {
        // No row = joined before sources were tracked.
        const source = u.source ?? "untracked";
        const row = bySource.get(source) ?? { source, signups: 0, finishedSetup: 0, measurable: 0, cameBack: 0 };
        row.signups++;
        if (u.onboarded) row.finishedSetup++;
        if (u.createdAt && u.createdAt <= weekAgo) {
          row.measurable++;
          if (returnedIds.has(u.id)) row.cameBack++;
        }
        bySource.set(source, row);
        if (u.createdAt) {
          const d = u.createdAt.toISOString().slice(0, 10);
          const day = byDay.get(d) ?? {};
          day[source] = (day[source] ?? 0) + 1;
          byDay.set(d, day);
        }
      }
      const series: { date: string; counts: Record<string, number> }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
        series.push({ date: d, counts: byDay.get(d) ?? {} });
      }

      // Referrals made in this window.
      const refRows = await db
        .select({
          referrerUserId: referrals.referrerUserId,
          status: referrals.status,
          referrerDays: referrals.referrerRewardDays,
          invitedDays: referrals.invitedRewardDays,
        })
        .from(referrals)
        .where(gte(referrals.createdAt, since));
      const perReferrer = new Map<string, { joined: number; finished: number }>();
      let finished = 0;
      let freeDays = 0;
      for (const r of refRows) {
        const done = r.status !== "pending";
        if (done) finished++;
        freeDays += (r.referrerDays ?? 0) + (r.invitedDays ?? 0);
        const p = perReferrer.get(r.referrerUserId) ?? { joined: 0, finished: 0 };
        p.joined++;
        if (done) p.finished++;
        perReferrer.set(r.referrerUserId, p);
      }
      const topIds = Array.from(perReferrer.entries())
        .sort((a, b) => b[1].finished - a[1].finished || b[1].joined - a[1].joined)
        .slice(0, 10);
      const topNames = topIds.length
        ? await db
            .select({ userId: profiles.userId, displayName: profiles.displayName })
            .from(profiles)
            .where(inArray(profiles.userId, topIds.map(([id]) => id)))
        : [];
      const nameOf = new Map(topNames.map((n) => [n.userId, n.displayName]));
      const topReferrers = topIds.map(([id, p]) => ({ userId: id, name: nameOf.get(id) || "Unnamed member", ...p }));

      // Shares in this window, and the signups whose first page came from a share.
      const shareRows = await db
        .select({ kind: shareEvents.kind, format: shareEvents.format, n: count() })
        .from(shareEvents)
        .where(gte(shareEvents.createdAt, since))
        .groupBy(shareEvents.kind, shareEvents.format);
      const [{ sharers }] = await db
        .select({ sharers: sql<number>`count(distinct ${shareEvents.userId})` })
        .from(shareEvents)
        .where(gte(shareEvents.createdAt, since));
      const fromShares = cohort.filter(
        (u) => u.source === "share_card" || (u.source === "referral" && u.detail === "share_card"),
      ).length;

      const [{ n: allTimeTracked }] = await db.select({ n: count() }).from(signupSources);

      res.json({
        days,
        computedAt: new Date().toISOString(),
        totals: {
          signups: cohort.length,
          finishedSetup: cohort.filter((u) => u.onboarded).length,
          measurable: Array.from(bySource.values()).reduce((s, r) => s + r.measurable, 0),
          cameBack: Array.from(bySource.values()).reduce((s, r) => s + r.cameBack, 0),
        },
        sources: Array.from(bySource.values()).sort((a, b) => b.signups - a.signups),
        series,
        referrals: {
          joined: refRows.length,
          finishedSetup: finished,
          freeWeeksGiven: Math.round((freeDays / 7) * 10) / 10,
          topReferrers,
        },
        shares: {
          byKind: shareRows.map((r) => ({ kind: r.kind, format: r.format, count: Number(r.n) })),
          sharers: Number(sharers ?? 0),
          signupsFromShares: fromShares,
        },
        trackingStarted: Number(allTimeTracked) > 0,
      });
    } catch (e) {
      console.error("[admin] growth error:", e);
      res.status(500).json({ message: "Failed to load growth" });
    }
  });
}

