// Console: the selfie verification queue (server/verification.ts is the
// member side). A reviewer sees the selfie, the pose that was asked for and
// the member's profile photos, then approves or rejects with a reason the
// member is shown. Every view and decision is audit-logged. The selfie is
// deleted the moment a decision is made.
import type { Express, Response } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { profiles, userPhotos, users, verificationRequests } from "@shared/schema";
import { poseText, REJECT_REASONS } from "@shared/verification";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import { deleteObject, getObjectBuffer, keyFromUploadUrl } from "../storage/objectStorage";
import { sendPush } from "../push";
import { storage } from "../storage";

async function streamKey(res: Response, key: string | null) {
  if (!key) return res.sendStatus(404);
  const buf = await getObjectBuffer(key);
  if (!buf) return res.sendStatus(404);
  res.setHeader("Content-Type", key.endsWith(".webp") ? "image/webp" : key.endsWith(".png") ? "image/png" : "image/jpeg");
  // Never cached anywhere: these are only for the reviewer, right now.
  res.setHeader("Cache-Control", "no-store");
  res.send(buf);
}

async function decide(id: number, adminUserId: string, approve: boolean, reason: string | null) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(verificationRequests).where(eq(verificationRequests.id, id)).for("update");
    if (!r) return { error: 404 as const };
    if (r.status !== "pending") return { error: 409 as const };
    await tx
      .update(verificationRequests)
      .set({ status: approve ? "approved" : "rejected", rejectReason: approve ? null : reason, reviewedBy: adminUserId, reviewedAt: new Date(), selfieKey: null })
      .where(eq(verificationRequests.id, id));
    await tx
      .update(profiles)
      .set({ isVerified: approve, verificationStatus: approve ? "verified" : "rejected" })
      .where(eq(profiles.userId, r.userId));
    return { request: r };
  });
}

export function registerAdminVerificationRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/verification", "support", async (req, res) => {
    const status = req.query.status === "approved" || req.query.status === "rejected" ? req.query.status : "pending";
    try {
      const rows = await db
        .select({
          id: verificationRequests.id,
          userId: verificationRequests.userId,
          pose: verificationRequests.pose,
          status: verificationRequests.status,
          rejectReason: verificationRequests.rejectReason,
          hasSelfie: sql<boolean>`${verificationRequests.selfieKey} is not null`,
          createdAt: verificationRequests.createdAt,
          reviewedAt: verificationRequests.reviewedAt,
          displayName: profiles.displayName,
          age: profiles.age,
          gender: profiles.gender,
          location: profiles.locationName,
          email: users.email,
        })
        .from(verificationRequests)
        .leftJoin(profiles, eq(profiles.userId, verificationRequests.userId))
        .leftJoin(users, eq(users.id, verificationRequests.userId))
        .where(eq(verificationRequests.status, status))
        .orderBy(status === "pending" ? asc(verificationRequests.createdAt) : desc(verificationRequests.reviewedAt))
        .limit(50);

      const out = await Promise.all(
        rows.map(async (r) => {
          const photos = await db
            .select({ id: userPhotos.id, isMain: userPhotos.isMainProfilePhoto })
            .from(userPhotos)
            .where(eq(userPhotos.userId, r.userId))
            .orderBy(desc(userPhotos.isMainProfilePhoto), asc(userPhotos.orderIndex))
            .limit(6);
          const [prev] = await db
            .select({ n: sql<number>`count(*)` })
            .from(verificationRequests)
            .where(and(eq(verificationRequests.userId, r.userId), eq(verificationRequests.status, "rejected")));
          return { ...r, poseText: poseText(r.pose), photoIds: photos.map((p) => p.id), previousRejections: Number(prev?.n ?? 0) };
        }),
      );
      await auditAdmin(req, (req as any).admin.userId, "verification.list", { details: { status } });
      res.json({ requests: out, rejectReasons: REJECT_REASONS });
    } catch (e) {
      console.error("[admin] verification list error:", e);
      res.status(500).json({ message: "Failed to load verification requests" });
    }
  });

  adminRoute(app, "get", "/api/admin/verification/:id/selfie", "support", async (req, res) => {
    const id = Number(req.params.id);
    const [r] = await db.select().from(verificationRequests).where(eq(verificationRequests.id, id));
    if (!r || r.status !== "pending") return res.sendStatus(404);
    await auditAdmin(req, (req as any).admin.userId, "verification.view_selfie", { targetType: "verification_request", targetId: id });
    return streamKey(res, r.selfieKey);
  });

  // Only a photo that belongs to the member in this request.
  adminRoute(app, "get", "/api/admin/verification/:id/photo/:photoId", "support", async (req, res) => {
    const id = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    const [r] = await db.select().from(verificationRequests).where(eq(verificationRequests.id, id));
    if (!r) return res.sendStatus(404);
    const [p] = await db.select().from(userPhotos).where(and(eq(userPhotos.id, photoId), eq(userPhotos.userId, r.userId)));
    if (!p) return res.sendStatus(404);
    const variants = (p as any).variants as { w800?: string } | null;
    return streamKey(res, keyFromUploadUrl(variants?.w800 ?? p.photoUrl));
  });

  adminRoute(app, "post", "/api/admin/verification/:id/approve", "support", async (req, res) => {
    const id = Number(req.params.id);
    const adminUserId = (req as any).admin.userId;
    try {
      const out = await decide(id, adminUserId, true, null);
      if (out.error || !out.request) return res.status(out.error ?? 404).json({ message: out.error === 404 ? "Not found" : "Already reviewed" });
      if (out.request.selfieKey) await deleteObject(out.request.selfieKey).catch(() => {});
      await auditAdmin(req, adminUserId, "verification.approve", { targetType: "verification_request", targetId: id, details: { userId: out.request.userId } });
      const title = "You're verified";
      const body = "Your verified mark is now on your profile. People can see you're really you.";
      await storage.createNotification(out.request.userId, "verification", title, body).catch(() => {});
      sendPush(out.request.userId, { title, body, url: "/profile", tag: "verification" }).catch(() => {});
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin] verification approve error:", e);
      res.status(500).json({ message: "Failed to approve" });
    }
  });

  adminRoute(app, "post", "/api/admin/verification/:id/reject", "support", async (req, res) => {
    const id = Number(req.params.id);
    const adminUserId = (req as any).admin.userId;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
    if (!reason) return res.status(400).json({ message: "Pick or write a reason. The member will see it." });
    try {
      const out = await decide(id, adminUserId, false, reason);
      if (out.error || !out.request) return res.status(out.error ?? 404).json({ message: out.error === 404 ? "Not found" : "Already reviewed" });
      if (out.request.selfieKey) await deleteObject(out.request.selfieKey).catch(() => {});
      await auditAdmin(req, adminUserId, "verification.reject", { targetType: "verification_request", targetId: id, details: { userId: out.request.userId, reason } });
      const title = "Let's try your selfie again";
      await storage.createNotification(out.request.userId, "verification", title, reason).catch(() => {});
      sendPush(out.request.userId, { title, body: reason, url: "/settings#verify", tag: "verification" }).catch(() => {});
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin] verification reject error:", e);
      res.status(500).json({ message: "Failed to reject" });
    }
  });
}
