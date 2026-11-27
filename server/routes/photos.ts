// Uploaded files and profile photos.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage, PhotoNotFoundError, PhotoTooSmallError } from "../storage";
import { and } from "drizzle-orm";
import path from "path";
import sharp from "sharp";
import { UPLOAD_DIR, putObject, deleteObject, getSignedUrl, generateFilename, isObjectStorageEnabled, keyFromUploadUrl } from "../storage/objectStorage";
import { updatePhotoRoleSchema, updatePhotoFocalSchema } from "@shared/schema";
import { isSelfieKey } from "../verification";
import * as safety from "../safety";
import { isDmMediaKey } from "../dm-extras";
import { upload, getUserId } from "./shared";

export function registerPhotosRoutes(app: Express) {
  // The bucket (server/storage/objectStorage.ts) is private, so every fetch —
  // whether it ends up served from Supabase Storage or the local dev
  // fallback — goes through here rather than a public static mount. This
  // only gates "is someone logged in at all"; per-resource visibility (e.g.
  // a private profile's photos) is enforced where URLs are handed out, e.g.
  // GET /api/photos/:userId below.
  app.get("/uploads/*key", async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parts = req.params.key;
    const key = Array.isArray(parts) ? parts.join("/") : String(parts ?? "");
    if (!key || key.includes("..")) return res.sendStatus(400);
    // Verification selfies are for the review team only (server/verification.ts).
    if (isSelfieKey(key)) return res.sendStatus(404);
    // Chat photos and voice notes go through /api/dm/media/:id (server/dm-extras.ts).
    if (isDmMediaKey(key)) return res.sendStatus(404);

    // Files never change (unique names): let the browser keep them, and hand
    // out the same storage link for a day so it lands on its cached copy.
    if (isObjectStorageEnabled) {
      const url = await getSignedUrl(key, 2 * 86_400);
      if (!url) return res.sendStatus(404);
      res.setHeader("Cache-Control", "private, max-age=86400");
      return res.redirect(url);
    }
    res.setHeader("Cache-Control", "private, max-age=2592000, immutable");
    res.sendFile(path.join(UPLOAD_DIR, key), (err: unknown) => {
      if (err) res.sendStatus(404);
    });
  });

  app.post("/api/uploads/image", upload.single("image"), async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (!req.file) return res.status(400).json({ message: "No image file provided" });

    const filename: string = generateFilename(req.file.originalname);
    const url = `/uploads/${filename}`;
    const base = filename.replace(/\.[^.]+$/, "");
    let variants: { w800?: string; w1600?: string } | undefined;

    // Strip EXIF (incl. GPS) before storing the original — done entirely in
    // memory from the upload buffer, then handed to putObject() (Supabase
    // Storage, or the local dev fallback). sharp drops all metadata unless
    // withMetadata() is called. Best-effort: on any failure the untouched
    // original still gets stored and serves.
    try {
      const cleaned = await sharp(req.file.buffer).rotate().toBuffer();
      await putObject(filename, cleaned, req.file.mimetype);
    } catch (e) {
      console.error("[uploads] EXIF strip failed, storing original:", e);
      await putObject(filename, req.file.buffer, req.file.mimetype);
    }

    // Webp derivatives Discover / profile galleries actually render. Kept
    // separate from the block above so a failure here never overwrites the
    // already-stored original with something worse.
    try {
      const mk = async (w: number, q: number) => {
        const name = `${base}.w${w}.webp`;
        const resized = await sharp(req.file.buffer).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: q }).toBuffer();
        await putObject(name, resized, "image/webp");
        return `/uploads/${name}`;
      };
      variants = { w800: await mk(800, 78), w1600: await mk(1600, 80) };
    } catch (e) {
      console.error("[uploads] variant generation failed:", e);
    }

    res.json({ url, filename, variants });
  });

  app.get("/api/photos/:userId", async (req, res) => {
    const currentUserId = getUserId(req);
    if (!currentUserId) return res.sendStatus(401);
    try {
      const targetUserId = req.params.userId;
      if (targetUserId !== currentUserId) {
        const profile = await storage.getProfile(targetUserId);
        if (profile && !profile.isPublic) {
          return res.json([]);
        }
      }
      const photos = await storage.getUserPhotos(targetUserId);
      res.json(photos);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch photos" });
    }
  });

  app.post("/api/photos", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { photoUrl, orderIndex, isMainProfilePhoto, width, height, variants } = req.body ?? {};
    if (typeof photoUrl !== "string" || !photoUrl) {
      return res.status(400).json({ message: "photoUrl is required" });
    }
    const safeVariants =
      variants && typeof variants === "object"
        ? {
            ...(typeof variants.w800 === "string" ? { w800: variants.w800 } : {}),
            ...(typeof variants.w1600 === "string" ? { w1600: variants.w1600 } : {}),
          }
        : undefined;
    try {
      const photo = await storage.addUserPhoto(userId, photoUrl, orderIndex || 0, {
        isMain: !!isMainProfilePhoto,
        width: Number.isFinite(width) ? Math.round(width) : undefined,
        height: Number.isFinite(height) ? Math.round(height) : undefined,
        variants: safeVariants && Object.keys(safeVariants).length ? safeVariants : undefined,
      });
      res.status(201).json(photo);
      safety.checkPhoto(userId, photo.id, photoUrl).catch(() => {});
    } catch (e) {
      res.status(500).json({ message: "Failed to add photo" });
    }
  });

  app.patch("/api/photos/:id/role", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const photoId = parseInt(req.params.id, 10);
    if (Number.isNaN(photoId)) return res.status(400).json({ message: "Invalid photo id" });
    const parsed = updatePhotoRoleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid role", errors: parsed.error.flatten() });
    try {
      const result = await storage.setPhotoRole(userId, photoId, parsed.data.role);
      const photos = await storage.getUserPhotos(userId);
      res.json({ ...result, photos });
    } catch (e) {
      if (e instanceof PhotoNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof PhotoTooSmallError) return res.status(422).json({ message: e.message });
      console.error("Set photo role error:", e);
      res.status(500).json({ message: "Failed to update photo role" });
    }
  });

  app.patch("/api/photos/:id/focal", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const photoId = parseInt(req.params.id, 10);
    if (Number.isNaN(photoId)) return res.status(400).json({ message: "Invalid photo id" });
    const parsed = updatePhotoFocalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid focal point", errors: parsed.error.flatten() });
    try {
      const photo = await storage.setPhotoFocal(userId, photoId, parsed.data.target, parsed.data.x, parsed.data.y);
      res.json(photo);
    } catch (e) {
      if (e instanceof PhotoNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Set photo focal error:", e);
      res.status(500).json({ message: "Failed to update focal point" });
    }
  });

  app.delete("/api/photos/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const photo = await storage.deleteUserPhoto(userId, parseInt(req.params.id));
      res.json({ success: true });
      // Bucket cleanup happens after the response — a failure here shouldn't
      // turn a successful delete into a 500, it just leaves an orphaned
      // object for a future sweep.
      if (photo) {
        const keys = [photo.photoUrl, photo.variants?.w800, photo.variants?.w1600]
          .map(keyFromUploadUrl)
          .filter((k): k is string => k !== null);
        await Promise.allSettled(keys.map((k) => deleteObject(k)));
      }
    } catch (e) {
      res.status(500).json({ message: "Failed to delete photo" });
    }
  });

  app.put("/api/photos/reorder", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { photoIds } = req.body;
    try {
      await storage.reorderUserPhotos(userId, photoIds);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to reorder photos" });
    }
  });
}
