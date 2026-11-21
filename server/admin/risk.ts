// Console: the Risk queue (server/safety/ raises the flags). One row per
// member with open flags, most serious first. A reviewer clears (false alarm,
// and lifts an automatic hold), holds, or bans. Every view and action is
// audit-logged; closing flags wipes their snippets.
import type { Express } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { moderationActions, profiles, riskFlags, users } from "@shared/schema";
import { RISK_LABEL } from "@shared/safety";
import { adminRoute, requireStepUp } from "./auth";
import { auditAdmin } from "./audit";
import { forgetStatus, HELD } from "../safety";

const SEV_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

async function closeFlags(userId: string, adminUserId: string, status: "cleared" | "actioned") {
  await db
    .update(riskFlags)
    .set({ status, reviewedBy: adminUserId, reviewedAt: new Date(), snippet: null })
    .where(and(eq(riskFlags.userId, userId), eq(riskFlags.status, "open")));
}

export function registerAdminRiskRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/risk", "support", async (req, res) => {
    // Low-severity flags (a number on a profile) only show when asked for.
    const includeLow = req.query.all === "1";
    try {
      const flags = await db
        .select()
        .from(riskFlags)
        .where(and(eq(riskFlags.status, "open"), includeLow ? undefined : inArray(riskFlags.severity, ["medium", "high"])))
        .orderBy(desc(riskFlags.createdAt))
        .limit(500);
      const userIds = Array.from(new Set(flags.map((f) => f.userId)));
      const people = userIds.length
        ? await db
            .select({ userId: profiles.userId, displayName: profiles.displayName, age: profiles.age, status: profiles.moderationStatus, reason: profiles.moderationStatusReason, isVerified: profiles.isVerified, createdAt: users.createdAt, email: users.email })
            .from(profiles)
            .innerJoin(users, eq(users.id, profiles.userId))
            .where(inArray(profiles.userId, userIds))
        : [];
      const byUser = new Map(people.map((p) => [p.userId, p]));
      const otherIds = Array.from(new Set(flags.map((f) => f.otherUserId).filter((x): x is string => !!x && !x.startsWith("group:"))));
      const others = otherIds.length
        ? await db.select({ userId: profiles.userId, displayName: profiles.displayName }).from(profiles).where(inArray(profiles.userId, otherIds))
        : [];
      const otherName = new Map(others.map((o) => [o.userId, o.displayName]));

      const groups = userIds.map((uid) => {
        const mine = flags.filter((f) => f.userId === uid);
        const worst = mine.reduce((w, f) => Math.min(w, SEV_RANK[f.severity] ?? 2), 2);
        return {
          userId: uid,
          member: byUser.get(uid) ?? null,
          worst: (["high", "medium", "low"] as const)[worst],
          flags: mine.map((f) => ({
            id: f.id,
            kind: f.kind,
            label: (RISK_LABEL as Record<string, string>)[f.kind] ?? f.kind,
            severity: f.severity,
            source: f.source,
            snippet: f.snippet,
            other: f.otherUserId?.startsWith("group:") ? `a group (#${f.otherUserId.slice(6)})` : f.otherUserId ? otherName.get(f.otherUserId) || "another member" : null,
            otherUserId: f.otherUserId,
            createdAt: f.createdAt,
          })),
        };
      });
      groups.sort((a, b) => SEV_RANK[a.worst] - SEV_RANK[b.worst] || b.flags.length - a.flags.length);
      await auditAdmin(req, (req as any).admin.userId, "risk.list", { details: { includeLow } });
      res.json({ members: groups });
    } catch (e) {
      console.error("[admin] risk list error:", e);
      res.status(500).json({ message: "Failed to load the risk queue" });
    }
  });

  // False alarm: close the flags; an automatic hold is lifted.
  adminRoute(app, "post", "/api/admin/risk/:userId/clear", "support", async (req, res) => {
    const userId = String(req.params.userId);
    const adminUserId = (req as any).admin.userId;
    try {
      await closeFlags(userId, adminUserId, "cleared");
      await db
        .update(profiles)
        .set({ moderationStatus: "active", moderationStatusReason: null, moderationStatusAt: new Date() })
        .where(and(eq(profiles.userId, userId), eq(profiles.moderationStatus, HELD)));
      forgetStatus(userId);
      await auditAdmin(req, adminUserId, "risk.clear", { targetType: "user", targetId: userId });
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin] risk clear error:", e);
      res.status(500).json({ message: "Failed to clear" });
    }
  });

  // Hold: hidden from Discover, can't message or like, until cleared or banned.
  adminRoute(app, "post", "/api/admin/risk/:userId/hold", "support", async (req, res) => {
    const userId = String(req.params.userId);
    const adminUserId = (req as any).admin.userId;
    const reason = typeof req.body?.reason === "string" && req.body.reason.trim() ? req.body.reason.trim().slice(0, 500) : "Held by the team for a closer look";
    try {
      await db
        .update(profiles)
        .set({ moderationStatus: HELD, moderationStatusReason: reason, moderationStatusAt: new Date() })
        .where(and(eq(profiles.userId, userId), eq(profiles.moderationStatus, "active")));
      forgetStatus(userId);
      await auditAdmin(req, adminUserId, "risk.hold", { targetType: "user", targetId: userId, details: { reason } });
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin] risk hold error:", e);
      res.status(500).json({ message: "Failed to hold" });
    }
  });

  adminRoute(
    app,
    "post",
    "/api/admin/risk/:userId/ban",
    "admin",
    (req, res, next) => requireStepUp()(req, res, next),
    async (req, res) => {
      const userId = String(req.params.userId);
      const adminUserId = (req as any).admin.userId;
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 2000) : "";
      if (!reason) return res.status(400).json({ message: "A reason is required." });
      try {
        await db.transaction(async (tx) => {
          await tx
            .update(profiles)
            .set({ moderationStatus: "banned", moderationStatusReason: reason, moderationStatusAt: new Date() })
            .where(eq(profiles.userId, userId));
          await tx.insert(moderationActions).values({ targetUserId: userId, type: "ban", reason, adminUserId });
        });
        await closeFlags(userId, adminUserId, "actioned");
        forgetStatus(userId);
        await auditAdmin(req, adminUserId, "risk.ban", { targetType: "user", targetId: userId, details: { reason } });
        res.json({ ok: true });
      } catch (e) {
        console.error("[admin] risk ban error:", e);
        res.status(500).json({ message: "Failed to ban" });
      }
    },
  );
}

/** For the console overview badge. */
export async function openRiskCount(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(distinct ${riskFlags.userId})` })
    .from(riskFlags)
    .where(and(eq(riskFlags.status, "open"), inArray(riskFlags.severity, ["medium", "high"])));
  return Number(r?.n ?? 0);
}
