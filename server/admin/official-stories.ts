// Console: the official Destira status library (server/official-stories.ts
// turns it into 2–3 stories a day). Upload an image or a short video, give it
// an optional button, and either schedule it for a day or leave it evergreen.
import type { Express } from "express";
import multer from "multer";
import path from "path";
import { desc, eq } from "drizzle-orm";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import { db } from "../db";
import { officialStoryItems, events } from "@shared/schema";
import { putObject, getSignedUrl, getObjectBuffer, keyFromUploadUrl, isObjectStorageEnabled } from "../storage/objectStorage";
import { getPerDay, setPerDay, rebuildToday, todaysOfficialStories, harareDay } from "../official-stories";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype) || VIDEO_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Upload a JPEG, PNG or WebP image, or an MP4 or WebM video"));
  },
});

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_SEC = 60;

interface Fields {
  caption: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  eventId: number | null;
  scheduledFor: string | null;
  evergreen: boolean;
  active?: boolean;
}

/** Shared validation for create and edit. Returns an error message or the fields. */
function readFields(body: any, partial: boolean): Fields | string {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const caption = str(body.caption);
  if (caption && caption.length > 140) return "Keep the caption under 140 characters";
  const ctaLabel = str(body.ctaLabel);
  const ctaUrl = str(body.ctaUrl);
  if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl)) return "A button needs both its words and where it goes";
  if (ctaLabel && ctaLabel.length > 28) return "Keep the button under 28 characters";
  // Only places inside the app: nothing a member could be sent off-site by.
  if (ctaUrl && !/^\/[A-Za-z0-9\-_/?=&.%]*$/.test(ctaUrl)) return "The button must point inside the app, like /invite or /events";
  const eventId = body.eventId != null && body.eventId !== "" ? Number(body.eventId) : null;
  if (eventId != null && !Number.isInteger(eventId)) return "That event id isn't valid";
  const scheduledFor = str(body.scheduledFor);
  if (scheduledFor && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) return "Pick a date for the schedule";
  const evergreen = body.evergreen === undefined ? !partial || undefined : body.evergreen === true || body.evergreen === "true";
  const out: Fields = { caption, ctaLabel, ctaUrl, eventId, scheduledFor, evergreen: evergreen ?? true };
  if (body.active !== undefined) out.active = body.active === true || body.active === "true";
  if (!out.evergreen && !out.scheduledFor) return "Schedule it for a day, or make it evergreen";
  return out;
}

export function registerAdminOfficialStoryRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/official-stories", "support", async (_req, res) => {
    try {
      const [items, perDay, today] = await Promise.all([
        db.select().from(officialStoryItems).orderBy(desc(officialStoryItems.createdAt)),
        getPerDay(),
        todaysOfficialStories(),
      ]);
      const titles = new Map<number, string>();
      const evIds = items.map((i) => i.eventId).filter((x): x is number => x != null);
      for (const id of evIds) {
        const [e] = await db.select({ title: events.title }).from(events).where(eq(events.id, id));
        if (e) titles.set(id, e.title);
      }
      res.json({
        perDay,
        today: { ...today, isToday: today.day === harareDay() },
        items: items.map((i) => ({
          ...i,
          eventTitle: i.eventId ? titles.get(i.eventId) ?? null : null,
          // The console has its own session, so media goes through here.
          previewUrl: `/api/admin/official-stories/${i.id}/media`,
        })),
      });
    } catch (e) {
      console.error("[admin] official stories list error:", e);
      res.status(500).json({ message: "Failed to load the Destira status library" });
    }
  });

  adminRoute(app, "get", "/api/admin/official-stories/:id/media", "support", async (req, res) => {
    const [item] = await db.select().from(officialStoryItems).where(eq(officialStoryItems.id, Number(req.params.id)));
    const key = keyFromUploadUrl(item?.mediaUrl);
    if (!key) return res.sendStatus(404);
    if (isObjectStorageEnabled) {
      const url = await getSignedUrl(key, 600);
      return url ? res.redirect(url) : res.sendStatus(404);
    }
    const buf = await getObjectBuffer(key);
    if (!buf) return res.sendStatus(404);
    res.type(path.extname(key)).send(buf);
  });

  adminRoute(app, "post", "/api/admin/official-stories", "admin", upload.single("media"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Choose an image or a video" });
    const isVideo = VIDEO_TYPES.includes(file.mimetype);
    if (!isVideo && file.size > MAX_IMAGE_BYTES) return res.status(400).json({ message: "Images can be up to 8 MB" });
    const durationSec = isVideo ? Math.round(Number(req.body.durationSec) || 0) : null;
    if (isVideo && (!durationSec || durationSec > MAX_VIDEO_SEC)) {
      return res.status(400).json({ message: `Videos can be up to ${MAX_VIDEO_SEC} seconds` });
    }
    const fields = readFields(req.body, false);
    if (typeof fields === "string") return res.status(400).json({ message: fields });
    try {
      const ext = isVideo ? (file.mimetype === "video/webm" ? ".webm" : ".mp4") : file.mimetype === "image/png" ? ".png" : file.mimetype === "image/webp" ? ".webp" : ".jpg";
      const key = `official-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      await putObject(key, file.buffer, file.mimetype);
      const adminUserId = (req as any).admin.userId;
      const [item] = await db
        .insert(officialStoryItems)
        .values({ ...fields, mediaUrl: `/uploads/${key}`, mediaType: isVideo ? "video" : "image", durationSec, createdBy: adminUserId })
        .returning();
      await auditAdmin(req, adminUserId, "official_story.create", { targetType: "official_story", targetId: item.id });
      res.json(item);
    } catch (e) {
      console.error("[admin] official story upload error:", e);
      res.status(500).json({ message: "Couldn't save that upload" });
    }
  });

  adminRoute(app, "patch", "/api/admin/official-stories/:id", "admin", async (req, res) => {
    const id = Number(req.params.id);
    const [current] = await db.select().from(officialStoryItems).where(eq(officialStoryItems.id, id));
    if (!current) return res.sendStatus(404);
    const fields = readFields({ ...current, ...req.body }, true);
    if (typeof fields === "string") return res.status(400).json({ message: fields });
    const [item] = await db.update(officialStoryItems).set(fields).where(eq(officialStoryItems.id, id)).returning();
    await auditAdmin(req, (req as any).admin.userId, "official_story.update", { targetType: "official_story", targetId: id, details: req.body });
    res.json(item);
  });

  adminRoute(app, "delete", "/api/admin/official-stories/:id", "admin", async (req, res) => {
    const id = Number(req.params.id);
    await db.delete(officialStoryItems).where(eq(officialStoryItems.id, id));
    await auditAdmin(req, (req as any).admin.userId, "official_story.delete", { targetType: "official_story", targetId: id });
    res.json({ ok: true });
  });

  adminRoute(app, "post", "/api/admin/official-stories/settings", "admin", async (req, res) => {
    const n = Number(req.body?.perDay);
    if (n !== 2 && n !== 3) return res.status(400).json({ message: "Choose 2 or 3 a day" });
    const adminUserId = (req as any).admin.userId;
    await setPerDay(n, adminUserId);
    await auditAdmin(req, adminUserId, "official_story.per_day", { details: { perDay: n } });
    res.json({ perDay: n });
  });

  adminRoute(app, "post", "/api/admin/official-stories/rebuild-today", "admin", async (req, res) => {
    try {
      const made = await rebuildToday();
      await auditAdmin(req, (req as any).admin.userId, "official_story.rebuild_today", { details: { made } });
      res.json({ made });
    } catch (e) {
      console.error("[admin] rebuild official stories error:", e);
      res.status(500).json({ message: "Couldn't rebuild today's posts" });
    }
  });
}
