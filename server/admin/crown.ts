// Console: Destira Crown (shared/crown.ts, server/crown.ts). Applications to
// approve or decline, members, revoking (admin + step-up, with a reason the
// member sees), and the seat cap. Every action writes an audit row.
import type { Express, Response } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { crownMembers, profiles, userPhotos, users } from "@shared/schema";
import { CROWN_APPROVAL_HOLD_DAYS } from "@shared/crown";
import { adminRoute, requireStepUp } from "./auth";
import { auditAdmin } from "./audit";
import { crownSettings, forgetCrownCache, isActiveRow, seatsTaken, setCrownSettings } from "../crown";
import { introStats } from "../crown-perks";
import { getObjectBuffer, keyFromUploadUrl } from "../storage/objectStorage";
import { storage } from "../storage";
import { notify as notifyMember } from "../push";

const DAY_MS = 86_400_000;

async function streamKey(res: Response, key: string | null) {
  if (!key) return res.sendStatus(404);
  const buf = await getObjectBuffer(key);
  if (!buf) return res.sendStatus(404);
  res.setHeader("Content-Type", key.endsWith(".webp") ? "image/webp" : key.endsWith(".png") ? "image/png" : "image/jpeg");
  res.setHeader("Cache-Control", "no-store");
  res.send(buf);
}

async function notify(userId: string, title: string, body: string, url: string) {
  await notifyMember(userId, "account", { type: "crown", title, body, url, tag: "crown" }).catch(() => {});
}

export async function pendingCrownApplications(): Promise<number> {
  const rows = await db.select({ userId: crownMembers.userId }).from(crownMembers).where(eq(crownMembers.status, "applied"));
  return rows.length;
}

export function registerAdminCrownRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/crown", "support", async (_req, res) => {
    try {
      const now = new Date();
      const rows = await db
        .select({
          userId: crownMembers.userId,
          status: crownMembers.status,
          city: crownMembers.city,
          note: crownMembers.note,
          appliedAt: crownMembers.appliedAt,
          decidedAt: crownMembers.decidedAt,
          reason: crownMembers.reason,
          activeUntil: crownMembers.activeUntil,
          displayName: profiles.displayName,
          age: profiles.age,
          location: profiles.location,
          isVerified: profiles.isVerified,
          moderationStatus: profiles.moderationStatus,
          email: users.email,
          joinedAt: users.createdAt,
        })
        .from(crownMembers)
        .leftJoin(profiles, eq(profiles.userId, crownMembers.userId))
        .leftJoin(users, eq(users.id, crownMembers.userId))
        .orderBy(asc(crownMembers.appliedAt));
      const ids = rows.map((r) => r.userId);
      const photos = ids.length
        ? await db
            .select({ id: userPhotos.id, userId: userPhotos.userId })
            .from(userPhotos)
            .where(inArray(userPhotos.userId, ids))
            .orderBy(desc(userPhotos.isMainProfilePhoto), asc(userPhotos.orderIndex))
        : [];
      const photosBy = new Map<string, number[]>();
      for (const p of photos) photosBy.set(p.userId, [...(photosBy.get(p.userId) ?? []), p.id]);
      const holdFrom = now.getTime() - CROWN_APPROVAL_HOLD_DAYS * DAY_MS;
      const out = rows.map((r) => ({
        ...r,
        photoIds: (photosBy.get(r.userId) ?? []).slice(0, 4),
        active: isActiveRow(r, now),
        holdLapsed: r.status === "approved" && (!r.decidedAt || r.decidedAt.getTime() <= holdFrom),
      }));
      const [settings, taken] = await Promise.all([crownSettings(), seatsTaken(now)]);
      res.json({ settings, seatsTaken: taken, holdDays: CROWN_APPROVAL_HOLD_DAYS, rows: out, intros: await introStats(30) });
    } catch (e) {
      console.error("[admin] crown error:", e);
      res.status(500).json({ message: "Failed to load Crown" });
    }
  });

  // Only photos of someone who applied for Crown.
  adminRoute(app, "get", "/api/admin/crown/:userId/photo/:photoId", "support", async (req, res) => {
    const userId = String(req.params.userId);
    const [row] = await db.select({ userId: crownMembers.userId }).from(crownMembers).where(eq(crownMembers.userId, userId));
    if (!row) return res.sendStatus(404);
    const [p] = await db.select().from(userPhotos).where(and(eq(userPhotos.id, Number(req.params.photoId)), eq(userPhotos.userId, userId)));
    if (!p) return res.sendStatus(404);
    const variants = (p as any).variants as { w800?: string } | null;
    return streamKey(res, keyFromUploadUrl(variants?.w800 ?? p.photoUrl));
  });

  adminRoute(app, "post", "/api/admin/crown/:userId/approve", "admin", async (req, res) => {
    const userId = String(req.params.userId);
    const adminUserId = (req as any).admin.userId;
    try {
      const [p] = await db.select({ isVerified: profiles.isVerified, moderationStatus: profiles.moderationStatus }).from(profiles).where(eq(profiles.userId, userId));
      if (!p?.isVerified) return res.status(409).json({ message: "Not verified. Crown is for verified members only." });
      if ((p.moderationStatus ?? "active") !== "active") return res.status(409).json({ message: "This account is held or suspended." });
      const { seatCap } = await crownSettings();
      if ((await seatsTaken()) >= seatCap) return res.status(409).json({ message: `Every seat is taken (${seatCap}). Raise the cap or wait for one to open.` });
      const now = new Date();
      const [r] = await db
        .update(crownMembers)
        .set({ status: "approved", decidedAt: now, decidedBy: adminUserId, reason: null, updatedAt: now })
        .where(and(eq(crownMembers.userId, userId), inArray(crownMembers.status, ["applied", "approved"])))
        .returning();
      if (!r) return res.status(409).json({ message: "Only an open application can be approved." });
      await auditAdmin(req, adminUserId, "crown.approve", { targetType: "user", targetId: userId });
      await notify(userId, "You're approved for Crown", `Your seat is held for ${CROWN_APPROVAL_HOLD_DAYS} days. Tap to finish joining.`, "/crown");
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin] crown approve error:", e);
      res.status(500).json({ message: "Couldn't approve" });
    }
  });

  adminRoute(app, "post", "/api/admin/crown/:userId/decline", "admin", async (req, res) => {
    const userId = String(req.params.userId);
    const adminUserId = (req as any).admin.userId;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 400) : "";
    if (reason.length < 5) return res.status(400).json({ message: "Give a short reason; the member sees it." });
    try {
      const now = new Date();
      const [r] = await db
        .update(crownMembers)
        .set({ status: "declined", decidedAt: now, decidedBy: adminUserId, reason, updatedAt: now })
        .where(and(eq(crownMembers.userId, userId), inArray(crownMembers.status, ["applied", "approved"])))
        .returning();
      if (!r) return res.status(409).json({ message: "Only an open application can be declined." });
      await auditAdmin(req, adminUserId, "crown.decline", { targetType: "user", targetId: userId, details: { reason } });
      await notify(userId, "About your Crown application", reason, "/crown");
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin] crown decline error:", e);
      res.status(500).json({ message: "Couldn't decline" });
    }
  });

  // Ends the crown at once. No refund (Terms); the plan underneath (Ember)
  // keeps running to its end, so the member keeps what they paid for there.
  adminRoute(
    app,
    "post",
    "/api/admin/crown/:userId/revoke",
    "admin",
    (req, res, next) => requireStepUp()(req, res, next),
    async (req, res) => {
      const userId = String(req.params.userId);
      const adminUserId = (req as any).admin.userId;
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 400) : "";
      if (reason.length < 5) return res.status(400).json({ message: "Give a reason; the member sees it." });
      try {
        const now = new Date();
        const [r] = await db
          .update(crownMembers)
          .set({ status: "revoked", decidedAt: now, decidedBy: adminUserId, reason, activeUntil: now, updatedAt: now })
          .where(and(eq(crownMembers.userId, userId), inArray(crownMembers.status, ["active", "approved"])))
          .returning();
        if (!r) return res.status(409).json({ message: "Not a Crown member." });
        forgetCrownCache();
        await auditAdmin(req, adminUserId, "crown.revoke", { targetType: "user", targetId: userId, details: { reason } });
        await notify(userId, "Your crown has been removed", reason, "/crown");
        res.json({ ok: true });
      } catch (e) {
        console.error("[admin] crown revoke error:", e);
        res.status(500).json({ message: "Couldn't revoke" });
      }
    },
  );

  adminRoute(app, "patch", "/api/admin/crown/settings", "admin", async (req, res) => {
    const adminUserId = (req as any).admin.userId;
    const patch: { seatCap?: number; open?: boolean } = {};
    if (typeof req.body?.seatCap === "number") patch.seatCap = req.body.seatCap;
    if (typeof req.body?.open === "boolean") patch.open = req.body.open;
    try {
      const next = await setCrownSettings(patch, adminUserId);
      await auditAdmin(req, adminUserId, "crown.settings", { details: patch });
      res.json(next);
    } catch (e) {
      console.error("[admin] crown settings error:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });
}
