// Blocking, reports, feedback, referrals, account and settings.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { authStorage, hashPassword, verifyPassword } from "../replit_integrations/auth";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { twinMemory as twinMemoryTable, twinMemoryFacts, twinMemorySummary } from "@shared/schema";
import { deleteObject, keyFromUploadUrl } from "../storage/objectStorage";
import * as gate from "../gate";
import * as referralsService from "../referrals";
import { recordShare } from "../growth";
import { getEventSeats } from "../event-seats";
import { referralClaimSchema } from "@shared/schema";
import * as emailTemplates from "../email/templates";
import { REPORT_CATEGORIES, FEEDBACK_CATEGORIES } from "@shared/admin";
import { reports as reportsTable, feedback as feedbackTable } from "@shared/schema";
import { upload, getUserId } from "./shared";
import { validateAgePreferences } from "./profiles";

export function registerAccountRoutes(app: Express) {
  // ============ PLANS ============

  // Get all active plans
  app.get("/api/plans", async (req, res) => {
    try {
      const allPlans = await storage.getPlans();
      res.json(allPlans);
    } catch (e) {
      res.status(500).json({ message: "Failed to get plans" });
    }
  });

  // Get a specific plan
  app.get("/api/plans/:id", async (req, res) => {
    try {
      const plan = await storage.getPlan(parseInt(req.params.id));
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      res.json(plan);
    } catch (e) {
      res.status(500).json({ message: "Failed to get plan" });
    }
  });

  // Block / unblock
  app.post("/api/users/block/:targetUserId", async (req, res) => {
    const blockerId = getUserId(req);
    if (!blockerId) return res.sendStatus(401);
    try {
      const { targetUserId } = req.params;
      const entry = await storage.blockUser(blockerId, targetUserId);
      res.json(entry);
    } catch (err) {
      res.status(500).json({ message: "Failed to block user" });
    }
  });

  app.delete("/api/users/block/:targetUserId", async (req, res) => {
    const blockerId = getUserId(req);
    if (!blockerId) return res.sendStatus(401);
    try {
      const { targetUserId } = req.params;
      await storage.unblockUser(blockerId, targetUserId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to unblock user" });
    }
  });

  // Report is distinct from block: it files a record for review. It also blocks
  // — you shouldn't keep seeing someone you've reported — but the reverse isn't
  // true, so they're separate controls in the UI.
  app.post("/api/users/:targetUserId/report", async (req, res) => {
    const reporterId = getUserId(req);
    if (!reporterId) return res.sendStatus(401);
    const { targetUserId } = req.params;
    if (targetUserId === reporterId) return res.status(400).json({ message: "You can't report yourself" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 1000) : "";
    const category = (REPORT_CATEGORIES as readonly string[]).includes(req.body?.category) ? req.body.category : "other";
    // Evidence ids are optional and client-supplied today (no picker UI yet) —
    // {type: "direct_message"|"group_message", id}. Never raw content.
    const evidence = Array.isArray(req.body?.evidence)
      ? req.body.evidence
          .filter((e: any) => e && typeof e.type === "string" && (typeof e.id === "string" || typeof e.id === "number"))
          .slice(0, 10)
          .map((e: any) => ({ type: e.type, id: String(e.id) }))
      : [];
    try {
      // The report is what actually persists and reaches the console queue.
      // The old audit-log-only trail stays too — belt and suspenders, cheap.
      await storage.createAuditLog(reporterId, "user_reported", { targetUserId, reason, category });
      const [newReport] = await db.insert(reportsTable).values({ reporterId, subjectId: targetUserId, category, freeText: reason || null, evidence }).returning();
      const isSafety = category === "safety_escalation" || category === "underage_concern";
      emailTemplates.alertReportFiled({ reportId: newReport.id, category, isSafety }).catch(() => {});
      // Auto-block so the reporter never has to see this person again — the
      // report persists independently of the block, and can't be undone by it.
      await storage.blockUser(reporterId, targetUserId).catch(() => {});
      res.json({ success: true });
    } catch (err) {
      console.error("Report submission error:", err);
      res.status(500).json({ message: "Failed to submit report" });
    }
  });

  // Settings → send feedback. Different job from a report: no target user, no
  // block, just a note to the operator. Surfaced in its own console queue.
  app.post("/api/feedback", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const category = (FEEDBACK_CATEGORIES as readonly string[]).includes(req.body?.category) ? req.body.category : "other";
    const freeText = typeof req.body?.freeText === "string" ? req.body.freeText.trim().slice(0, 4000) : "";
    if (!freeText) return res.status(400).json({ message: "Tell us a bit more" });
    const contactBackConsent = req.body?.contactBackConsent === true;
    const appVersion = typeof req.body?.appVersion === "string" ? req.body.appVersion.slice(0, 40) : null;
    const platform = typeof req.body?.platform === "string" ? req.body.platform.slice(0, 40) : null;
    try {
      await db.insert(feedbackTable).values({ userId, category, freeText, contactBackConsent, appVersion, platform });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to send feedback" });
    }
  });

  app.get("/api/users/blocked", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const blocked = await storage.getBlockedUsers(userId);
      const enriched = await Promise.all(blocked.map(async (b) => {
        const p = await storage.getProfile(b.blockedId);
        const photos = await storage.getUserPhotos(b.blockedId);
        const mainPhoto = photos.find(ph => ph.isMainProfilePhoto)?.photoUrl || photos[0]?.photoUrl || null;
        return { ...b, displayName: p?.displayName || b.blockedId, photoUrl: mainPhoto };
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to get blocked users" });
    }
  });

  // Referrals — a friend who joins gets you both a free week (plus profile
  // views for the inviter); never an extra read, never placement.
  app.get("/api/referrals/me", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const summary = await referralsService.getReferralSummary(userId);
      const origin = `${req.protocol}://${req.get("host")}`;
      res.json({ ...summary, url: `${origin}/?ref=${summary.code}` });
    } catch (err) {
      console.error("Referral summary error:", err);
      res.status(500).json({ message: "Failed to load referrals" });
    }
  });

  app.post("/api/referrals/claim", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = referralClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid code" });
    }
    try {
      const result = await referralsService.claimCode(userId, parsed.data.code);
      if (!result.ok) {
        const msg =
          result.reason === "self"
            ? "That is your own code."
            : result.reason === "already"
              ? "You have already been referred."
              : "That code is not valid.";
        return res.status(409).json({ message: msg, reason: result.reason });
      }
      const summary = await referralsService.getReferralSummary(userId);
      res.json(summary);
    } catch (err) {
      console.error("Referral claim error:", err);
      res.status(500).json({ message: "Failed to claim code" });
    }
  });

  // Android App Links: lets the Destira app open destira.date links (events,
  // invites, groups). ANDROID_APP_CERT_SHA256 holds the app's signing
  // certificate fingerprint(s), comma-separated — from Play Console → App
  // integrity once it's on the Play Store, or the upload key before that.
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const fingerprints = (process.env.ANDROID_APP_CERT_SHA256 || "")
      .split(",")
      .map((f) => f.trim().toUpperCase())
      .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
    res.json(
      fingerprints.length
        ? [
            {
              relation: ["delegate_permission/common.handle_all_urls"],
              target: { namespace: "android_app", package_name: "date.destira.app", sha256_cert_fingerprints: fingerprints },
            },
          ]
        : [],
    );
  });

  // Public: "Rudo invited you" on the landing page. First name only, and only
  // for a code its owner chose to share.
  app.get("/api/referrals/inviter/:code", async (req, res) => {
    try {
      const firstName = await referralsService.getInviterFirstName(String(req.params.code));
      if (!firstName) return res.sendStatus(404);
      res.json({ firstName, rewardDays: referralsService.REFERRAL_REWARD_DAYS });
    } catch (err) {
      console.error("Inviter lookup error:", err);
      res.sendStatus(500);
    }
  });

  // Live seat numbers for the Status card's badge ("6 women's seats left").
  app.get("/api/events/:id/seats", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const seats = await getEventSeats(Number(req.params.id)).catch(() => null);
    if (!seats) return res.sendStatus(404);
    res.json(seats);
  });

  // One row per tap on a share action, for the console's Growth page.
  app.post("/api/growth/share", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { kind, format, targetId } = req.body ?? {};
    if ((kind !== "event" && kind !== "invite") || (format !== "status_card" && format !== "link" && format !== "destira_story")) {
      return res.status(400).json({ message: "Invalid share" });
    }
    try {
      await recordShare(userId, kind, format, targetId == null ? null : String(targetId).slice(0, 64));
      res.sendStatus(204);
    } catch (err) {
      console.error("Share log error:", err);
      res.sendStatus(500);
    }
  });

  // Support tickets
  app.post("/api/support/tickets", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { subject, message } = req.body;
      if (!subject || !message) return res.status(400).json({ message: "Subject and message required" });
      const ticket = await storage.createSupportTicket(userId, subject, message);
      res.json(ticket);
    } catch (err) {
      res.status(500).json({ message: "Failed to submit ticket" });
    }
  });

  // Data export
  app.get("/api/account/export-data", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const profile = await storage.getProfile(userId);
      const matches = await storage.getMatches(userId);
      const twinMemory = await storage.getTwinMemory(userId, 200);
      res.setHeader("Content-Disposition", "attachment; filename=destira-data.json");
      res.setHeader("Content-Type", "application/json");
      res.json({ profile, matches, twinMemory, exportedAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  // Change password — verifies the current password (scrypt) and stores a
  // freshly-salted hash on the user's account. This is the same credential
  // /api/auth/login checks, so changing it here actually re-secures sign-in.
  app.post("/api/account/change-password", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required" });
      }
      if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
        return res.status(400).json({ message: "Invalid input" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }
      const user = await authStorage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Account not found" });
      if (user.passwordHash) {
        const valid = await verifyPassword(currentPassword, user.passwordHash);
        if (!valid) {
          return res.status(401).json({ message: "Current password is incorrect" });
        }
      }
      const newHash = await hashPassword(newPassword);
      await authStorage.updateUser(userId, { passwordHash: newHash });
      res.json({ success: true, message: "Password updated successfully" });
    } catch (err) {
      console.error("Change password error:", err);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // Change email — requires the current password as re-authentication since
  // there's no email service configured to send a verification link yet.
  // Once one is connected, this can move to token-in-email + confirm.
  app.post("/api/account/change-email", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { newEmail, currentPassword } = req.body;
      if (typeof newEmail !== "string" || typeof currentPassword !== "string" || !currentPassword) {
        return res.status(400).json({ message: "New email and current password are required" });
      }
      const normalizedEmail = newEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ message: "Enter a valid email address" });
      }
      const user = await authStorage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Account not found" });
      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      const existing = await authStorage.getUserByEmail(normalizedEmail);
      if (existing && existing.id !== userId) {
        return res.status(409).json({ message: "That email is already in use" });
      }
      const updated = await authStorage.updateUser(userId, { email: normalizedEmail });
      res.json({ success: true, email: updated.email });
    } catch (err: any) {
      if (err?.code === "23505") {
        return res.status(409).json({ message: "That email is already in use" });
      }
      console.error("Change email error:", err);
      res.status(500).json({ message: "Failed to update email" });
    }
  });

  // Delete account
  app.delete("/api/account", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { confirmation } = req.body;
      if (confirmation !== "DELETE") return res.status(400).json({ message: "Type DELETE to confirm" });
      // The photo files themselves, not just their rows — read before the rows go.
      const photoKeys = (await storage.getUserPhotos(userId))
        .flatMap((p) => [p.photoUrl, p.variants?.w800, p.variants?.w1600])
        .map(keyFromUploadUrl)
        .filter((k): k is string => k !== null);
      await storage.deleteAllUserData(userId);
      req.logout?.(() => {});
      res.json({ success: true });
      // After the response, like a single photo delete: a storage hiccup leaves
      // an orphaned file for a sweep, never a failed account deletion.
      await Promise.allSettled(photoKeys.map((k) => deleteObject(k)));
    } catch (err) {
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Clear Twin memory
  app.delete("/api/twin/memory", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await db.delete(twinMemoryTable).where(eq(twinMemoryTable.userId, userId));
      await db.delete(twinMemoryFacts).where(eq(twinMemoryFacts.userId, userId));
      await db.delete(twinMemorySummary).where(eq(twinMemorySummary.userId, userId));
      await storage.updateProfile(userId, { twinQuestionsAnswered: 10 });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to clear Twin memory" });
    }
  });

  // Tier limits check — preflight only; authoritative enforcement is on /api/matches
  app.post("/api/likes", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const currentCount = await storage.getDailyLikeCount(userId);
      const g = await gate.checkGate(userId, "daily_likes", { countOverride: currentCount });
      if (!g.ok) return res.status(403).json(gate.gateBody(g, "daily_likes"));
      res.json({ success: true, count: currentCount, limit: g.limit });
    } catch (err) {
      res.status(500).json({ message: "Failed to check like limit" });
    }
  });

  // Verification status update
  // Twin Tone settings — persisted in twinProfileStructured.twinToneProfile
  app.post("/api/settings/twin-tone", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { twinToneProfile } = req.body;
      if (!twinToneProfile || typeof twinToneProfile !== "object") {
        return res.status(400).json({ message: "twinToneProfile object required" });
      }
      await storage.upsertTwinProfileStructured(userId, { twinToneProfile });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to save Twin tone" });
    }
  });

  // Discovery preferences
  app.post("/api/settings/discovery", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { maxDistanceKm, ageMinPreference, ageMaxPreference, seekingGenders } = req.body;

      if (ageMinPreference != null || ageMaxPreference != null) {
        const existing = await storage.getProfile(userId);
        const ageError = validateAgePreferences(req.body, existing);
        if (ageError) return res.status(400).json({ message: ageError });
      }

      await storage.updateProfile(userId, {
        ...(maxDistanceKm != null && { maxDistanceKm }),
        ...(ageMinPreference != null && { ageMinPreference }),
        ...(ageMaxPreference != null && { ageMaxPreference }),
        ...(Array.isArray(seekingGenders) && { seekingGenders }),
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to save discovery preferences" });
    }
  });
}
