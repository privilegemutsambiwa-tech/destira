// Admin console: member lifecycle email. Mode switch (off/live), daily cap,
// per-kind switches, a dry run ("who would get what right now"), a rendered
// preview of each email for any member, a test send to your own inbox, and
// the send log. Also announcements: a one-off email to every member.
import type { Express } from "express";
import { eq } from "drizzle-orm";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import { db } from "../db";
import { users } from "@shared/models/auth";
import * as memberEmail from "../member-email";
import * as announcements from "../member-email/announcements";
import { resendConfigured } from "../email/resend";

function isKind(k: unknown): k is memberEmail.MemberEmailKind {
  return typeof k === "string" && (memberEmail.MEMBER_EMAIL_KINDS as readonly string[]).includes(k);
}

export function registerAdminMemberEmailRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/member-email", "support", async (_req, res) => {
    try {
      const [settings, stats, log] = await Promise.all([
        memberEmail.getMemberEmailSettings(),
        memberEmail.stats(7),
        memberEmail.recentLog(50),
      ]);
      res.json({
        settings,
        stats,
        log,
        kinds: memberEmail.MEMBER_EMAIL_KINDS.map((k) => ({ key: k, label: memberEmail.KIND_LABEL[k] })),
        delivery: {
          connected: resendConfigured(),
          production: process.env.NODE_ENV === "production",
          fromConfigured: !!(process.env.EMAIL_FROM_MEMBERS || process.env.EMAIL_FROM),
        },
      });
    } catch (e) {
      console.error("[admin] member email load error:", e);
      res.status(500).json({ message: "Failed to load member email" });
    }
  });

  adminRoute(app, "patch", "/api/admin/member-email/settings", "admin", async (req, res) => {
    const body = req.body ?? {};
    const patch: Partial<memberEmail.MemberEmailSettings> = {};
    if (body.mode === "off" || body.mode === "live") patch.mode = body.mode;
    if (typeof body.dailyCap === "number") patch.dailyCap = body.dailyCap;
    if (body.kinds && typeof body.kinds === "object") {
      const kinds: Partial<Record<memberEmail.MemberEmailKind, boolean>> = {};
      for (const [k, v] of Object.entries(body.kinds)) if (isKind(k) && typeof v === "boolean") kinds[k] = v;
      patch.kinds = kinds as Record<memberEmail.MemberEmailKind, boolean>;
    }
    try {
      const adminUserId = (req as any).admin.userId;
      const next = await memberEmail.updateMemberEmailSettings(patch, adminUserId);
      await auditAdmin(req, adminUserId, "member_email.settings", { details: patch });
      res.json(next);
    } catch (e) {
      console.error("[admin] member email settings error:", e);
      res.status(500).json({ message: "Failed to save" });
    }
  });

  adminRoute(app, "post", "/api/admin/member-email/dry-run", "support", async (_req, res) => {
    try {
      res.json(await memberEmail.dryRun());
    } catch (e) {
      console.error("[admin] member email dry run error:", e);
      res.status(500).json({ message: "Dry run failed" });
    }
  });

  // Preview a kind rendered for one member (by email), or for yourself.
  adminRoute(app, "get", "/api/admin/member-email/preview", "support", async (req, res) => {
    const kind = req.query.kind;
    if (!isKind(kind)) return res.status(400).json({ message: "Unknown email kind" });
    try {
      let userId: string = (req as any).admin.userId;
      const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
      if (email) {
        const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
        if (!u) return res.status(404).json({ message: "No member with that email" });
        userId = u.id;
      }
      const content = await memberEmail.previewFor(userId, kind);
      if (!content) return res.status(404).json({ message: "That account can't receive member email (no email or not active)" });
      res.json(content);
    } catch (e) {
      console.error("[admin] member email preview error:", e);
      res.status(500).json({ message: "Preview failed" });
    }
  });

  adminRoute(app, "post", "/api/admin/member-email/test", "admin", async (req, res) => {
    const kind = req.body?.kind;
    if (!isKind(kind)) return res.status(400).json({ message: "Unknown email kind" });
    try {
      const adminUserId = (req as any).admin.userId;
      const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, adminUserId));
      if (!me?.email) return res.status(400).json({ message: "Your account has no email address" });
      const r = await memberEmail.sendTest(adminUserId, kind, me.email);
      await auditAdmin(req, adminUserId, "member_email.test", { details: { kind, ok: r.ok } });
      if (!r.ok) return res.status(400).json({ message: r.error });
      res.json({ ok: true, to: memberEmail.maskEmail(me.email) });
    } catch (e) {
      console.error("[admin] member email test error:", e);
      res.status(500).json({ message: "Test send failed" });
    }
  });

  // ── announcements (member-email/announcements.ts) ──────────────────
  const meOf = async (req: any) => {
    const userId: string = req.admin.userId;
    const [me] = await db.select({ email: users.email, firstName: users.firstName }).from(users).where(eq(users.id, userId));
    return { userId, email: me?.email ?? null, firstName: (me?.firstName ?? "").trim().split(" ")[0] };
  };

  adminRoute(app, "get", "/api/admin/announcements", "support", async (_req, res) => {
    try {
      const [items, audience] = await Promise.all([announcements.listWithProgress(), announcements.audienceSize()]);
      res.json({ items, audience });
    } catch (e) {
      console.error("[admin] announcements load error:", e);
      res.status(500).json({ message: "Failed to load announcements" });
    }
  });

  adminRoute(app, "post", "/api/admin/announcements/preview", "support", async (req, res) => {
    const v = announcements.validateDraft(req.body);
    if ("error" in v) return res.status(400).json({ message: v.error });
    try {
      res.json(announcements.render(v.draft, await meOf(req)));
    } catch (e) {
      console.error("[admin] announcement preview error:", e);
      res.status(500).json({ message: "Preview failed" });
    }
  });

  adminRoute(app, "post", "/api/admin/announcements/test", "admin", async (req, res) => {
    const v = announcements.validateDraft(req.body);
    if ("error" in v) return res.status(400).json({ message: v.error });
    try {
      const me = await meOf(req);
      if (!me.email) return res.status(400).json({ message: "Your account has no email address" });
      const r = await announcements.sendAnnouncementTest(v.draft, me, me.email);
      await auditAdmin(req, me.userId, "announcement.test", { details: { subject: v.draft.subject, ok: r.ok } });
      if (!r.ok) return res.status(400).json({ message: r.error });
      res.json({ ok: true, to: memberEmail.maskEmail(me.email) });
    } catch (e) {
      console.error("[admin] announcement test error:", e);
      res.status(500).json({ message: "Test send failed" });
    }
  });

  adminRoute(app, "post", "/api/admin/announcements", "admin", async (req, res) => {
    const v = announcements.validateDraft(req.body);
    if ("error" in v) return res.status(400).json({ message: v.error });
    if (!resendConfigured() && process.env.NODE_ENV === "production") {
      return res.status(400).json({ message: "Email isn't connected yet (RESEND_API_KEY). Nothing was sent." });
    }
    try {
      const adminUserId = (req as any).admin.userId;
      const a = await announcements.startAnnouncement(v.draft, adminUserId);
      await auditAdmin(req, adminUserId, "announcement.send", { details: { id: a.id, subject: a.subject, audience: a.audience } });
      res.json(a);
    } catch (e) {
      console.error("[admin] announcement send error:", e);
      res.status(500).json({ message: "Couldn't start sending" });
    }
  });

  adminRoute(app, "post", "/api/admin/announcements/:id/cancel", "admin", async (req, res) => {
    try {
      const adminUserId = (req as any).admin.userId;
      const ok = await announcements.cancelAnnouncement(String(req.params.id), adminUserId);
      if (!ok) return res.status(404).json({ message: "That announcement isn't sending" });
      await auditAdmin(req, adminUserId, "announcement.cancel", { details: { id: req.params.id } });
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin] announcement cancel error:", e);
      res.status(500).json({ message: "Couldn't stop it" });
    }
  });
}
