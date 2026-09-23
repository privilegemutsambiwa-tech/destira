// The moderation queue. Every read of a report's cited evidence is
// audit-logged and scoped: only the specific message ids the reporter cited,
// only while the report is still open/investigating (time-boxed — once a
// report is actioned or dismissed, evidence view closes). Never the accused
// user's other conversations, never their location.
import type { Express } from "express";
import { db } from "../db";
import { reports, moderationActions, directMessages, groupMessages, profiles, users, userPhotos, events } from "@shared/schema";
import { and, desc, asc, eq, sql, inArray, count } from "drizzle-orm";
import { adminRoute, requireStepUp } from "./auth";
import { auditAdmin } from "./audit";
import { storage } from "../storage";
import {
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  SAFETY_CATEGORIES,
  MODERATION_ACTION_TYPES,
  MODERATION_ACTION_COPY,
  type ReportStatus,
} from "@shared/admin";
import { scrubReply } from "../disclosure";

async function subjectDisplay(userId: string) {
  const [p] = await db.select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.userId, userId));
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return { displayName: p?.displayName ?? null, email: u?.email ?? null };
}

export function registerAdminReportRoutes(app: Express) {
  // Filing volume, last 14 days — computed at request time straight from the
  // reports table (not a metric_daily rollup) since it's cheap at this scale
  // and this is the one place it's used.
  adminRoute(app, "get", "/api/admin/reports/volume", "support", async (req, res) => {
    try {
      const since = new Date(Date.now() - 13 * 86400000);
      since.setHours(0, 0, 0, 0);
      const rows = await db
        .select({ day: sql<string>`to_char(${reports.createdAt}, 'YYYY-MM-DD')`, n: count() })
        .from(reports)
        .where(sql`${reports.createdAt} >= ${since}`)
        .groupBy(sql`to_char(${reports.createdAt}, 'YYYY-MM-DD')`);
      const byDay = new Map(rows.map((r) => [r.day, Number(r.n)]));
      const series: { date: string; value: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        series.push({ date: d, value: byDay.get(d) ?? 0 });
      }
      res.json({ series });
    } catch (e) {
      console.error("[admin] report volume error:", e);
      res.status(500).json({ message: "Failed to load report volume" });
    }
  });

  // Queue: oldest-first by default; safety categories always pinned to the top
  // regardless of sort, and flagged with the repeat-subject count.
  adminRoute(app, "get", "/api/admin/reports", "support", async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

    const conds = [];
    if (status && (REPORT_STATUSES as readonly string[]).includes(status)) conds.push(eq(reports.status, status));
    if (category && (REPORT_CATEGORIES as readonly string[]).includes(category)) conds.push(eq(reports.category, category));
    const where = conds.length ? and(...conds) : undefined;

    try {
      const [{ total }] = await db.select({ total: count() }).from(reports).where(where);
      const rows = await db
        .select()
        .from(reports)
        .where(where)
        .orderBy(asc(reports.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      // repeat-subject signal: count of ALL reports (any status) per subject in this page
      const subjectIds = Array.from(new Set(rows.map((r) => r.subjectId)));
      const repeatCounts = new Map<string, number>();
      if (subjectIds.length) {
        const rc = await db
          .select({ subjectId: reports.subjectId, n: count() })
          .from(reports)
          .where(inArray(reports.subjectId, subjectIds))
          .groupBy(reports.subjectId);
        for (const r of rc) repeatCounts.set(r.subjectId, Number(r.n));
      }

      const enriched = await Promise.all(
        rows.map(async (r) => ({
          ...r,
          subject: await subjectDisplay(r.subjectId),
          repeatCount: repeatCounts.get(r.subjectId) ?? 1,
          isSafety: (SAFETY_CATEGORIES as readonly string[]).includes(r.category),
        })),
      );
      // Pin safety-category reports to the top, oldest-first within each group.
      enriched.sort((a, b) => (a.isSafety === b.isSafety ? 0 : a.isSafety ? -1 : 1));

      await auditAdmin(req, (req as any).admin.userId, "report.list", { details: { status, category, page } });
      res.json({ reports: enriched, total: Number(total), page, pageSize });
    } catch (e) {
      console.error("[admin] reports list error:", e);
      res.status(500).json({ message: "Failed to load reports" });
    }
  });

  adminRoute(app, "get", "/api/admin/reports/:id", "support", async (req, res) => {
    const id = Number(req.params.id);
    try {
      const [r] = await db.select().from(reports).where(eq(reports.id, id));
      if (!r) return res.status(404).json({ message: "Not found" });

      await auditAdmin(req, (req as any).admin.userId, "report.view", { targetType: "report", targetId: id });

      // Evidence: only while open/investigating (time-boxed), only the cited
      // ids, scrubbed the same way an outgoing twin reply is.
      let evidence: Array<{ type: string; id: string; content: string | null }> = [];
      const canViewEvidence = r.status === "open" || r.status === "investigating";
      if (canViewEvidence && Array.isArray(r.evidence) && r.evidence.length) {
        for (const item of r.evidence.slice(0, 20)) {
          let content: string | null = null;
          try {
            if (item.type === "direct_message") {
              const [m] = await db.select().from(directMessages).where(eq(directMessages.id, Number(item.id)));
              if (m) content = scrubReply(m.content).text;
            } else if (item.type === "group_message") {
              const [m] = await db.select().from(groupMessages).where(eq(groupMessages.id, Number(item.id)));
              if (m) content = scrubReply(m.content).text;
            } else if (item.type === "photo") {
              const [p] = await db.select().from(userPhotos).where(eq(userPhotos.id, Number(item.id)));
              if (p) content = p.photoUrl;
            } else if (item.type === "event") {
              const [ev] = await db.select().from(events).where(eq(events.id, Number(item.id)));
              if (ev) content = ev.title;
            }
          } catch {
            content = null;
          }
          evidence.push({ type: item.type, id: item.id, content });
        }
        await auditAdmin(req, (req as any).admin.userId, "report.evidence_view", {
          targetType: "report",
          targetId: id,
          details: { count: evidence.length },
        });
      }

      const actions = await db.select().from(moderationActions).where(eq(moderationActions.reportId, id)).orderBy(desc(moderationActions.createdAt));
      const [reporter, subject] = await Promise.all([subjectDisplay(r.reporterId), subjectDisplay(r.subjectId)]);
      const priorAgainstSubject = await db.select({ n: count() }).from(reports).where(eq(reports.subjectId, r.subjectId));

      res.json({
        report: r,
        reporter,
        subject,
        evidence,
        evidenceScoped: canViewEvidence,
        actions,
        repeatCount: Number(priorAgainstSubject[0]?.n ?? 1),
      });
    } catch (e) {
      console.error("[admin] report detail error:", e);
      res.status(500).json({ message: "Failed to load report" });
    }
  });

  adminRoute(app, "patch", "/api/admin/reports/:id", "support", async (req, res) => {
    const id = Number(req.params.id);
    const patch: Record<string, unknown> = {};
    const body = req.body || {};
    if (typeof body.status === "string" && (REPORT_STATUSES as readonly string[]).includes(body.status)) {
      patch.status = body.status as ReportStatus;
      if (body.status === "actioned" || body.status === "dismissed") patch.resolvedAt = new Date();
    }
    if (typeof body.assignee === "string") patch.assignee = body.assignee;
    if (typeof body.resolutionNote === "string") patch.resolutionNote = body.resolutionNote.slice(0, 2000);
    if (!Object.keys(patch).length) return res.status(400).json({ message: "Nothing to update" });
    patch.updatedAt = new Date();
    try {
      await auditAdmin(req, (req as any).admin.userId, "report.update", { targetType: "report", targetId: id, details: patch });
      const [updated] = await db.update(reports).set(patch as any).where(eq(reports.id, id)).returning();
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to update report" });
    }
  });

  // File a moderation action against the subject of a report. suspend/ban
  // require a fresh step-up (password re-entry) — the two truly destructive
  // ones. A written reason is mandatory for every action, including dismiss.
  adminRoute(app, "post", "/api/admin/reports/:id/actions", "support", async (req, res, next) => {
    const type = req.body?.type;
    if (type === "suspend" || type === "ban") return requireStepUp()(req, res, next);
    next();
  }, async (req, res) => {
    const id = Number(req.params.id);
    const { type, reason, evidenceRef } = req.body || {};
    if (!(MODERATION_ACTION_TYPES as readonly string[]).includes(type)) {
      return res.status(400).json({ message: "Unknown action type" });
    }
    if (typeof reason !== "string" || !reason.trim()) {
      return res.status(400).json({ message: "A reason is required" });
    }
    // ban is admin+ only, not support
    const admin = (req as any).admin;
    if (type === "ban" && admin.role !== "admin" && admin.role !== "owner") {
      return res.status(403).json({ message: "Banning needs the admin role" });
    }
    const needsEvidence = type === "remove_photo" || type === "remove_message" || type === "unpublish_event";
    let ref: { type: string; id: string } | null = null;
    if (needsEvidence) {
      if (!evidenceRef || typeof evidenceRef.type !== "string" || (typeof evidenceRef.id !== "string" && typeof evidenceRef.id !== "number")) {
        return res.status(400).json({ message: "Cite which photo, message, or event this action targets" });
      }
      ref = { type: evidenceRef.type, id: String(evidenceRef.id) };
    }
    try {
      const [r] = await db.select().from(reports).where(eq(reports.id, id));
      if (!r) return res.status(404).json({ message: "Report not found" });
      const trimmedReason = reason.trim().slice(0, 2000);

      // The actual enforcement — every branch verifies the cited item really
      // belongs to the report's subject before touching it, so a bad-faith or
      // stale evidenceRef can't be used to act on someone else's content.
      if (type === "suspend" || type === "ban") {
        await db.update(profiles).set({
          moderationStatus: type === "ban" ? "banned" : "suspended",
          moderationStatusReason: trimmedReason,
          moderationStatusAt: new Date(),
        }).where(eq(profiles.userId, r.subjectId));
      } else if (type === "remove_photo") {
        const photoId = Number(ref!.id);
        const [photo] = await db.select().from(userPhotos).where(eq(userPhotos.id, photoId));
        if (!photo || photo.userId !== r.subjectId) {
          return res.status(400).json({ message: "That photo doesn't belong to this report's subject" });
        }
        await storage.deleteUserPhoto(r.subjectId, photoId);
      } else if (type === "remove_message") {
        const msgId = Number(ref!.id);
        if (ref!.type === "direct_message") {
          const msg = await storage.getDirectMessage(msgId);
          if (!msg || msg.senderId !== r.subjectId) {
            return res.status(400).json({ message: "That message doesn't belong to this report's subject" });
          }
          await storage.deleteDirectMessageByAdmin(msgId);
        } else if (ref!.type === "group_message") {
          const msg = await storage.getGroupMessage(msgId);
          if (!msg || msg.userId !== r.subjectId) {
            return res.status(400).json({ message: "That message doesn't belong to this report's subject" });
          }
          await storage.deleteGroupMessage(msgId);
        } else {
          return res.status(400).json({ message: "Unknown message evidence type" });
        }
      } else if (type === "unpublish_event") {
        const eventId = Number(ref!.id);
        const [event] = await db.select().from(events).where(eq(events.id, eventId));
        if (!event || (event.hostUserId !== r.subjectId && event.createdByUserId !== r.subjectId)) {
          return res.status(400).json({ message: "That event doesn't belong to this report's subject" });
        }
        await db.update(events).set({ status: "cancelled", cancelReason: trimmedReason, cancelledAt: new Date() }).where(eq(events.id, eventId));
      }
      // warn / dismiss_report: logged only, nothing further to enforce.

      await auditAdmin(req, admin.userId, "report.action", {
        targetType: "user",
        targetId: r.subjectId,
        details: { reportId: id, type, reason: trimmedReason, evidenceRef: ref },
      });

      await db.insert(moderationActions).values({
        reportId: id,
        targetUserId: r.subjectId,
        type,
        reason: trimmedReason,
        adminUserId: admin.userId,
        evidenceRef: ref,
      });

      const newStatus = type === "dismiss_report" ? "dismissed" : "actioned";
      await db.update(reports).set({ status: newStatus, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(reports.id, id));

      res.json({ ok: true, copy: MODERATION_ACTION_COPY[type as keyof typeof MODERATION_ACTION_COPY] });
    } catch (e) {
      console.error("[admin] report action error:", e);
      res.status(500).json({ message: "Failed to record action" });
    }
  });
}
