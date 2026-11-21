// Selfie verification (docs/destira-3-upgrade-prompt.md Part A).
//
// The verified mark means one thing: a person on the Destira team compared a
// live selfie, taken copying a pose we picked at random, with the member's
// profile photos, and they match. Nothing else sets profiles.isVerified: no
// timer, no client field (server/routes.ts strips it from profile saves).
//
// Member side:   GET  /api/verification          state + the pose to copy
//                POST /api/verification          selfie (multipart "selfie") + pose
//                POST /api/profile/verify        old app builds (base64, no pose)
// Console side:  server/admin/verification.ts
//
// Privacy: the selfie is stored under a "vselfie-" key that the ordinary
// /uploads route refuses to serve, is only ever read by the console, and is
// deleted as soon as it's been reviewed.
import type { Express } from "express";
import crypto from "crypto";
import sharp from "sharp";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { profiles, userPhotos, verificationRequests } from "@shared/schema";
import { POSES, type VerificationState } from "@shared/verification";
import { putObject } from "./storage/objectStorage";

/** Keys with this prefix are selfies: never served by /uploads or /m. */
export const SELFIE_PREFIX = "vselfie-";

/** Fresh submissions per member per day, so a rejected member can retry
 *  a few times but nobody can flood the queue. */
const MAX_PER_DAY = 5;

export function isSelfieKey(key: string): boolean {
  return key.startsWith(SELFIE_PREFIX);
}

async function stateFor(userId: string) {
  const [p] = await db
    .select({ isVerified: profiles.isVerified, status: profiles.verificationStatus })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const [last] = await db
    .select()
    .from(verificationRequests)
    .where(eq(verificationRequests.userId, userId))
    .orderBy(desc(verificationRequests.createdAt))
    .limit(1);
  let state: VerificationState = "unverified";
  if (p?.isVerified) state = "verified";
  else if (last?.status === "pending") state = "pending";
  else if (last?.status === "rejected") state = "rejected";
  return {
    state,
    rejectReason: state === "rejected" ? last?.rejectReason ?? null : null,
    submittedAt: state === "pending" ? last?.createdAt ?? null : null,
  };
}

function randomPose() {
  return POSES[crypto.randomInt(POSES.length)];
}

async function hasFacePhoto(userId: string): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(userPhotos).where(eq(userPhotos.userId, userId));
  return Number(row?.n ?? 0) > 0;
}

/** Stores the selfie and opens a pending request. Returns an error message
 *  for the member, or null on success. */
async function submit(userId: string, image: Buffer, pose: string | null): Promise<{ status: number; message: string } | null> {
  if (!(await hasFacePhoto(userId))) {
    return { status: 400, message: "Add a clear photo of your face to your profile first, so we have something to compare your selfie with." };
  }
  const current = await stateFor(userId);
  if (current.state === "verified") return { status: 409, message: "You're already verified." };
  if (current.state === "pending") return { status: 409, message: "Your selfie is already with our team. We'll let you know soon." };

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [today] = await db
    .select({ n: sql<number>`count(*)` })
    .from(verificationRequests)
    .where(and(eq(verificationRequests.userId, userId), gte(verificationRequests.createdAt, since)));
  if (Number(today?.n ?? 0) >= MAX_PER_DAY) {
    return { status: 429, message: "That's a lot of tries for one day. Please try again tomorrow." };
  }

  // Re-encode: strips EXIF (incl. location), fixes rotation, caps the size.
  let clean: Buffer;
  try {
    clean = await sharp(image).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    return { status: 400, message: "That photo couldn't be read. Please take the selfie again." };
  }
  const key = `${SELFIE_PREFIX}${crypto.randomBytes(16).toString("hex")}.jpg`;
  await putObject(key, clean, "image/jpeg");
  await db.insert(verificationRequests).values({ userId, pose, selfieKey: key, status: "pending" });
  await db.update(profiles).set({ verificationStatus: "pending", isVerified: false }).where(eq(profiles.userId, userId));
  return null;
}

export function registerVerificationRoutes(app: Express, getUserId: (req: any) => string | null, upload: any) {
  app.get("/api/verification", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const s = await stateFor(userId);
      res.json({ ...s, pose: s.state === "verified" || s.state === "pending" ? null : randomPose(), hasPhoto: await hasFacePhoto(userId) });
    } catch (e) {
      console.error("[verification] state error:", e);
      res.status(500).json({ message: "Couldn't load your verification." });
    }
  });

  app.post("/api/verification", upload.single("selfie"), async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (!req.file) return res.status(400).json({ message: "Take a selfie first." });
    const pose = typeof req.body?.pose === "string" && POSES.some((p) => p.key === req.body.pose) ? req.body.pose : null;
    if (!pose) return res.status(400).json({ message: "Something went wrong with the pose. Please start again." });
    try {
      const err = await submit(userId, req.file.buffer, pose);
      if (err) return res.status(err.status).json({ message: err.message });
      res.json(await stateFor(userId));
    } catch (e) {
      console.error("[verification] submit error:", e);
      res.status(500).json({ message: "Couldn't send your selfie. Please try again." });
    }
  });

  // Older app builds post a base64 selfie with no pose. It still goes to a
  // person for review (who sees there was no pose), never auto-approved.
  app.post("/api/profile/verify", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const b64 = typeof req.body?.selfieBase64 === "string" ? req.body.selfieBase64 : "";
    if (!b64) return res.status(400).json({ message: "Take a selfie first." });
    const buf = Buffer.from(b64, "base64");
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return res.status(400).json({ message: "That photo couldn't be read." });
    try {
      const err = await submit(userId, buf, null);
      if (err) return res.status(err.status).json({ message: err.message });
      res.json({ success: true, verificationStatus: "pending" });
    } catch (e) {
      console.error("[verification] legacy submit error:", e);
      res.status(500).json({ message: "Failed to submit verification" });
    }
  });
}
