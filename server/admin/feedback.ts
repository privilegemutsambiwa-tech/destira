import type { Express } from "express";
import { db } from "../db";
import { feedback, profiles } from "@shared/schema";
import { and, asc, eq, count } from "drizzle-orm";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import { FEEDBACK_STATUSES } from "@shared/admin";

export function registerAdminFeedbackRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/feedback", "support", async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const where = status && (FEEDBACK_STATUSES as readonly string[]).includes(status) ? eq(feedback.status, status) : undefined;
    try {
      const [{ total }] = await db.select({ total: count() }).from(feedback).where(where);
      const rows = await db.select().from(feedback).where(where).orderBy(asc(feedback.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
      const enriched = await Promise.all(
        rows.map(async (f) => {
          const [p] = await db.select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.userId, f.userId));
          return { ...f, displayName: p?.displayName ?? null };
        }),
      );
      await auditAdmin(req, (req as any).admin.userId, "feedback.list", { details: { status, page } });
      res.json({ feedback: enriched, total: Number(total), page, pageSize });
    } catch (e) {
      res.status(500).json({ message: "Failed to load feedback" });
    }
  });

  adminRoute(app, "patch", "/api/admin/feedback/:id", "support", async (req, res) => {
    const id = Number(req.params.id);
    if (req.body?.status !== "reviewed" && req.body?.status !== "open") {
      return res.status(400).json({ message: "Bad status" });
    }
    try {
      await auditAdmin(req, (req as any).admin.userId, "feedback.update", { targetType: "feedback", targetId: id, details: req.body });
      const [updated] = await db.update(feedback).set({ status: req.body.status }).where(eq(feedback.id, id)).returning();
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to update" });
    }
  });
}
