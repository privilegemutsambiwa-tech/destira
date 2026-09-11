import type { Express } from "express";
import { db } from "../db";
import { emailAlertConfig, emailLog } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import { ALERT_TYPES, ALERT_META, DIGEST_TYPES, DIGEST_META } from "@shared/email-alerts";
import { testSend, getDefaultRecipient, setDefaultRecipient } from "../email";

export function registerAdminEmailRoutes(app: Express) {
  // Always returns every known alert type, seeding a default row for any
  // that don't have one yet — the console never shows a blank for a type
  // that simply hasn't been touched. Every row also carries the resolved
  // effectiveRecipient (its own override, or the console-wide default) so
  // "enabled with nowhere to send" is a value the client can just check for,
  // not recompute.
  adminRoute(app, "get", "/api/admin/email/config", "admin", async (req, res) => {
    try {
      const rows = await db.select().from(emailAlertConfig);
      const byType = new Map(rows.map((r) => [r.alertType, r]));
      const defaultRecipient = await getDefaultRecipient();

      const build = (type: string, label: string, configurable: boolean, hasThreshold: boolean) => {
        const row = byType.get(type);
        const recipientEmail = row?.recipientEmail ?? "";
        const enabled = row?.enabled ?? true;
        const effectiveRecipient = recipientEmail || defaultRecipient;
        return {
          alertType: type,
          label,
          configurable,
          hasThreshold,
          enabled,
          threshold: row?.threshold ?? null,
          recipientEmail,
          isInherited: !recipientEmail,
          effectiveRecipient,
          noRecipient: enabled && !effectiveRecipient,
        };
      };

      const digests = DIGEST_TYPES.map((type) => build(type, DIGEST_META[type].label, true, false));
      const alerts = ALERT_TYPES.map((type) => build(type, ALERT_META[type].label, ALERT_META[type].configurable, ALERT_META[type].hasThreshold));
      res.json({ defaultRecipient, items: [...digests, ...alerts] });
    } catch (e) {
      res.status(500).json({ message: "Failed to load email config" });
    }
  });

  adminRoute(app, "patch", "/api/admin/email/default-recipient", "admin", async (req, res) => {
    const recipientEmail = typeof req.body?.recipientEmail === "string" ? req.body.recipientEmail.trim() : "";
    try {
      await setDefaultRecipient(recipientEmail, (req as any).admin.userId);
      await auditAdmin(req, (req as any).admin.userId, "email_config.update", { targetType: "default_recipient", details: { recipientEmail } });
      res.json({ ok: true, defaultRecipient: recipientEmail });
    } catch (e) {
      console.error("[admin] default recipient update error:", e);
      res.status(500).json({ message: "Failed to save" });
    }
  });

  adminRoute(app, "patch", "/api/admin/email/config/:type", "admin", async (req, res) => {
    const type = String(req.params.type);
    const isAlert = (ALERT_TYPES as readonly string[]).includes(type);
    const isDigest = (DIGEST_TYPES as readonly string[]).includes(type);
    if (!isAlert && !isDigest) return res.status(400).json({ message: "Unknown alert type" });
    if (isAlert && !ALERT_META[type as keyof typeof ALERT_META].configurable) {
      return res.status(400).json({ message: "This alert type can't be turned off — it's safety-critical." });
    }
    const patch: Record<string, unknown> = {};
    if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
    if (typeof req.body?.threshold === "string" || req.body?.threshold === null) patch.threshold = req.body.threshold;
    if (typeof req.body?.recipientEmail === "string") patch.recipientEmail = req.body.recipientEmail.trim();
    if (!Object.keys(patch).length) return res.status(400).json({ message: "Nothing to update" });
    patch.updatedBy = (req as any).admin.userId;
    patch.updatedAt = new Date();
    try {
      await auditAdmin(req, (req as any).admin.userId, "email_config.update", { targetType: "alert_type", targetId: type, details: patch });
      await db
        .insert(emailAlertConfig)
        .values({ alertType: type, enabled: true, recipientEmail: "", ...patch } as any)
        .onConflictDoUpdate({ target: emailAlertConfig.alertType, set: patch as any });
      const [row] = await db.select().from(emailAlertConfig).where(eq(emailAlertConfig.alertType, type));
      res.json(row);
    } catch (e) {
      console.error("[admin] email config update error:", e);
      res.status(500).json({ message: "Failed to save" });
    }
  });

  adminRoute(app, "post", "/api/admin/email/test-send", "admin", async (req, res) => {
    const type = req.body?.type;
    const isDigest = type === "daily_digest" || type === "weekly_digest";
    if (!isDigest && !(ALERT_TYPES as readonly string[]).includes(type)) return res.status(400).json({ message: "Unknown alert type" });
    try {
      await auditAdmin(req, (req as any).admin.userId, "email_config.test_send", { targetType: "alert_type", targetId: type });
      if (isDigest) {
        const { sendDailyDigest, sendWeeklyDigest } = await import("../email/digest");
        await (type === "daily_digest" ? sendDailyDigest() : sendWeeklyDigest());
        return res.json({ ok: true });
      }
      const r = await testSend(type, typeof req.body?.recipientOverride === "string" ? req.body.recipientOverride : undefined);
      res.json(r);
    } catch (e) {
      res.status(500).json({ message: "Test send failed" });
    }
  });

  // Recent send attempts — a silent email failure must be visible here, not
  // just in a server log nobody reads.
  adminRoute(app, "get", "/api/admin/email/log", "admin", async (req, res) => {
    try {
      const rows = await db.select().from(emailLog).orderBy(desc(emailLog.createdAt)).limit(100);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: "Failed to load email log" });
    }
  });
}
