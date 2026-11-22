// Direct messages catch up with the Lounge (docs/destira-3-upgrade-prompt.md
// Part E): reactions, photos (optionally view once), voice notes, a typing
// indicator, and edit or unsend within 10 minutes.
//
// Media is stored under a "dm-" key the general /uploads route refuses, and
// only ever served through GET /api/dm/media/:id, which checks the member is
// in the conversation (and, for view once, that it hasn't been opened yet).
import type { Express, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import * as safety from "./safety";
import * as push from "./push";
import { putObject, getObjectBuffer } from "./storage/objectStorage";
import { directMessages, dmReactions, type DirectMessage } from "@shared/schema";
import {
  DM_EDIT_WINDOW_MS, DM_REACTIONS, DM_TEXT_MAX, PHOTO_MAX_BYTES, VOICE_MAX_BYTES, VOICE_MAX_MS,
  type DmContentType, type DmMessageView,
} from "@shared/dm";

export const DM_MEDIA_PREFIX = "dm-";
/** Keys the general /uploads route must never serve. */
export const isDmMediaKey = (key: string) => key.startsWith(DM_MEDIA_PREFIX);

const AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
};
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const base = file.mimetype.split(";")[0];
    if (IMAGE_TYPES.has(base) || AUDIO_TYPES[base]) cb(null, true);
    else cb(new Error("Only photos and voice notes can be sent here"));
  },
});

const editWindowSql = sql`${directMessages.createdAt} > now() - make_interval(secs => ${DM_EDIT_WINDOW_MS / 1000})`;

/** The chat's view of each message: never the stored key or the original. */
export async function presentDirectMessages(rows: DirectMessage[], viewerId: string): Promise<DmMessageView[]> {
  const ids = rows.map((r) => r.id);
  const reactions = ids.length
    ? await db.select({ messageId: dmReactions.messageId, userId: dmReactions.userId, emoji: dmReactions.emoji })
        .from(dmReactions).where(inArray(dmReactions.messageId, ids))
    : [];
  const byMessage = new Map<number, { userId: string; emoji: string }[]>();
  for (const r of reactions) {
    const list = byMessage.get(r.messageId) ?? [];
    list.push({ userId: r.userId, emoji: r.emoji });
    byMessage.set(r.messageId, list);
  }
  return rows.map((m) => {
    const unsent = !!m.unsentAt;
    const meta = m.mediaMeta ?? {};
    const viewOnce = !!meta.viewOnce;
    const hasMedia = !!m.mediaKey && !unsent && !m.isDeletedByAdmin;
    return {
      id: m.id,
      matchId: m.matchId,
      senderId: m.senderId,
      content: unsent ? "" : m.content,
      contentType: (m.contentType as DmContentType) || "text",
      createdAt: (m.createdAt ?? new Date()).toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      unsentAt: m.unsentAt ? m.unsentAt.toISOString() : null,
      clientId: m.clientId ?? null,
      isDeletedByAdmin: m.isDeletedByAdmin ?? null,
      // A view-once photo opens once, for the recipient only.
      mediaAvailable: hasMedia && (!viewOnce || (m.senderId !== viewerId && !m.viewedAt)),
      viewOnce,
      viewed: viewOnce && !!m.viewedAt,
      durationMs: typeof meta.durationMs === "number" ? meta.durationMs : null,
      reactions: unsent ? [] : byMessage.get(m.id) ?? [],
    };
  });
}

/** An outbox retry of something already sent: hand back the first one. */
export async function findByClientId(matchId: number, clientId: unknown): Promise<DirectMessage | undefined> {
  if (typeof clientId !== "string" || !clientId) return undefined;
  const [m] = await db.select().from(directMessages)
    .where(and(eq(directMessages.matchId, matchId), eq(directMessages.clientId, clientId)));
  return m;
}

export function cleanClientId(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(v) ? v : null;
}

// ── typing ───────────────────────────────────────────────────────────
// In memory: it only matters for the next few seconds, and a restart losing
// it is harmless.
const TYPING_TTL_MS = 6000;
const typing = new Map<string, number>(); // `${matchId}:${userId}` -> until
setInterval(() => {
  const now = Date.now();
  typing.forEach((until, k) => { if (until < now) typing.delete(k); });
}, 30_000).unref?.();

// Membership is checked on every typing call (they come every few seconds),
// so remember the answer for a minute.
const memberCache = new Map<string, { ok: boolean; other: string | null; until: number }>();
async function inMatch(matchId: number, userId: string): Promise<{ ok: boolean; other: string | null }> {
  const k = `${matchId}:${userId}`;
  const hit = memberCache.get(k);
  if (hit && hit.until > Date.now()) return hit;
  const m = await storage.getMatch(matchId);
  const ok = !!m && m.status === "matched" && (m.user1Id === userId || m.user2Id === userId);
  const other = m ? (m.user1Id === userId ? m.user2Id : m.user1Id) : null;
  if (memberCache.size > 20_000) memberCache.clear();
  memberCache.set(k, { ok, other, until: Date.now() + 60_000 });
  return { ok, other };
}

async function loadOwnMessage(res: Response, messageId: number, userId: string): Promise<DirectMessage | null> {
  const [m] = await db.select().from(directMessages).where(eq(directMessages.id, messageId));
  if (!m) { res.status(404).json({ message: "Message not found" }); return null; }
  if (m.senderId !== userId) { res.status(403).json({ message: "Only the sender can change a message" }); return null; }
  if (m.unsentAt || m.isDeletedByAdmin) { res.status(410).json({ message: "This message was removed" }); return null; }
  return m;
}

export function registerDmExtraRoutes(app: Express, getUserId: (req: any) => string | null) {
  // ── photos and voice notes ──
  app.post("/api/messages/:matchId/media", (req, res, next) => {
    mediaUpload.single("file")(req, res, (err: any) => {
      if (err) {
        const tooBig = err?.code === "LIMIT_FILE_SIZE";
        return res.status(tooBig ? 413 : 400).json({ message: tooBig ? "That file is too big to send" : String(err?.message || "Upload failed") });
      }
      next();
    });
  }, async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.matchId);
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      if (match.user1Id !== userId && match.user2Id !== userId) return res.sendStatus(403);
      if (match.status !== "matched") return res.status(400).json({ message: "Not matched yet" });
      if (await safety.blockIfHeld(res, userId)) return;
      if (!req.file) return res.status(400).json({ message: "No file" });

      const clientId = cleanClientId(req.body?.clientId);
      const dup = await findByClientId(matchId, clientId);
      if (dup) return res.status(200).json((await presentDirectMessages([dup], userId))[0]);

      const mime = String(req.file.mimetype).split(";")[0];
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      let contentType: DmContentType;
      let mediaKey: string;
      let meta: NonNullable<DirectMessage["mediaMeta"]>;
      if (IMAGE_TYPES.has(mime)) {
        // Re-encoded: drops EXIF (location) and keeps it light on data.
        let out: Buffer;
        let info: { width: number; height: number };
        try {
          ({ data: out, info } = await sharp(req.file.buffer).rotate()
            .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 80 }).toBuffer({ resolveWithObject: true }));
        } catch {
          return res.status(400).json({ message: "That photo couldn't be read" });
        }
        mediaKey = `${DM_MEDIA_PREFIX}${unique}.webp`;
        await putObject(mediaKey, out, "image/webp");
        contentType = "photo";
        meta = { mime: "image/webp", width: info.width, height: info.height, viewOnce: req.body?.viewOnce === "1" || req.body?.viewOnce === "true" };
      } else {
        if (req.file.size > VOICE_MAX_BYTES) return res.status(413).json({ message: "That voice note is too long" });
        const durationMs = Math.round(Number(req.body?.durationMs));
        if (!Number.isFinite(durationMs) || durationMs < 300) return res.status(400).json({ message: "That voice note is too short" });
        // A little slack for the recorder stopping a beat late.
        if (durationMs > VOICE_MAX_MS + 1500) return res.status(400).json({ message: "Voice notes can be up to a minute" });
        mediaKey = `${DM_MEDIA_PREFIX}${unique}.${AUDIO_TYPES[mime]}`;
        await putObject(mediaKey, req.file.buffer, mime);
        contentType = "voice";
        meta = { mime, durationMs: Math.min(durationMs, VOICE_MAX_MS) };
      }

      const label = contentType === "photo" ? (meta.viewOnce ? "Photo · view once" : "Photo") : "Voice note";
      let msg: DirectMessage;
      try {
        msg = await storage.sendDirectMessage(matchId, userId, label, { contentType, mediaKey, mediaMeta: meta, clientId });
      } catch (e) {
        // Two retries racing on the same clientId: the unique index caught it.
        const again = await findByClientId(matchId, clientId);
        if (!again) throw e;
        msg = again;
      }
      res.status(201).json((await presentDirectMessages([msg], userId))[0]);

      const recipientId = match.user1Id === userId ? match.user2Id : match.user1Id;
      typing.delete(`${matchId}:${userId}`);
      const sender = await storage.getProfile(userId);
      push.sendCategorizedPush(recipientId, "messages", {
        title: sender?.displayName || "Someone",
        body: contentType === "photo" ? "Sent you a photo" : "Sent you a voice note",
        url: `/chat/${matchId}`,
        tag: `dm-${matchId}`,
      }).catch(() => {});
    } catch (e) {
      console.error("[dm] media send failed:", e);
      res.status(500).json({ message: "Failed to send" });
    }
  });

  app.get("/api/dm/media/:messageId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const [m] = await db.select().from(directMessages).where(eq(directMessages.id, parseInt(req.params.messageId)));
      if (!m || !m.mediaKey || m.unsentAt || m.isDeletedByAdmin) return res.sendStatus(404);
      const { ok } = await inMatch(m.matchId, userId);
      if (!ok) return res.sendStatus(404);
      const meta = m.mediaMeta ?? {};
      if (meta.viewOnce) {
        if (m.senderId === userId) return res.status(403).json({ message: "A view-once photo can only be opened by the person you sent it to" });
        if (m.viewedAt) return res.status(410).json({ message: "Already opened" });
      }
      const buf = await getObjectBuffer(m.mediaKey);
      if (!buf) return res.sendStatus(404);
      if (meta.viewOnce) {
        // Claimed atomically: two taps at once still open it only once.
        const claimed = await db.update(directMessages).set({ viewedAt: sql`now()` })
          .where(and(eq(directMessages.id, m.id), isNull(directMessages.viewedAt))).returning({ id: directMessages.id });
        if (claimed.length === 0) return res.status(410).json({ message: "Already opened" });
        res.setHeader("Cache-Control", "no-store");
      } else {
        res.setHeader("Cache-Control", "private, max-age=86400");
      }
      res.setHeader("Content-Type", meta.mime || "application/octet-stream");
      res.send(buf);
    } catch (e) {
      res.status(500).json({ message: "Failed to load" });
    }
  });

  // ── reactions: one each, a new one replaces it, null takes it off ──
  app.put("/api/dm/:messageId/reaction", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const emoji = req.body?.emoji ?? null;
    if (emoji !== null && !(DM_REACTIONS as readonly string[]).includes(emoji)) return res.status(400).json({ message: "Unknown reaction" });
    try {
      const [m] = await db.select().from(directMessages).where(eq(directMessages.id, parseInt(req.params.messageId)));
      if (!m) return res.status(404).json({ message: "Message not found" });
      const { ok, other } = await inMatch(m.matchId, userId);
      if (!ok) return res.sendStatus(403);
      if (m.unsentAt || m.isDeletedByAdmin) return res.status(410).json({ message: "This message was removed" });
      if (emoji === null) {
        await db.delete(dmReactions).where(and(eq(dmReactions.messageId, m.id), eq(dmReactions.userId, userId)));
        return res.json({ messageId: m.id, emoji: null });
      }
      const [prev] = await db.select({ emoji: dmReactions.emoji }).from(dmReactions)
        .where(and(eq(dmReactions.messageId, m.id), eq(dmReactions.userId, userId)));
      await db.insert(dmReactions).values({ messageId: m.id, userId, emoji })
        .onConflictDoUpdate({ target: [dmReactions.messageId, dmReactions.userId], set: { emoji, createdAt: sql`now()` } });
      res.json({ messageId: m.id, emoji });
      // Tell the sender, once per new reaction (not on a retry of the same one).
      if (m.senderId !== userId && other && prev?.emoji !== emoji) {
        const p = await storage.getProfile(userId);
        push.sendCategorizedPush(m.senderId, "messages", {
          title: p?.displayName || "Someone",
          body: `Reacted ${emoji} to ${m.contentType === "photo" ? "your photo" : m.contentType === "voice" ? "your voice note" : `“${m.content.slice(0, 60)}”`}`,
          url: `/chat/${m.matchId}`,
          tag: `dm-${m.matchId}`,
        }).catch(() => {});
      }
    } catch (e) {
      res.status(500).json({ message: "Failed to react" });
    }
  });

  // ── edit: text only, sender only, within 10 minutes ──
  app.patch("/api/dm/:messageId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content) return res.status(400).json({ message: "A message can't be empty" });
    if (content.length > DM_TEXT_MAX) return res.status(400).json({ message: "That message is too long" });
    try {
      const m = await loadOwnMessage(res, parseInt(req.params.messageId), userId);
      if (!m) return;
      if (m.contentType !== "text") return res.status(400).json({ message: "Only text messages can be edited" });
      if (await safety.blockIfHeld(res, userId)) return;
      const [updated] = await db.update(directMessages)
        .set({ content, editedAt: sql`now()`, originalContent: sql`coalesce(${directMessages.originalContent}, ${directMessages.content})` })
        .where(and(eq(directMessages.id, m.id), editWindowSql)).returning();
      if (!updated) return res.status(409).json({ message: "Messages can be edited for 10 minutes after sending" });
      res.json((await presentDirectMessages([updated], userId))[0]);
      const { other } = await inMatch(m.matchId, userId);
      safety.scanText({ senderId: userId, text: content, source: "dm", refId: m.id, recipientId: other }).catch(() => {});
    } catch (e) {
      res.status(500).json({ message: "Failed to edit" });
    }
  });

  // ── unsend: sender only, within 10 minutes; gone for both sides ──
  // The original is kept server-side (originalContent, and the media file)
  // so a report about it can still be looked into.
  app.delete("/api/dm/:messageId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const m = await loadOwnMessage(res, parseInt(req.params.messageId), userId);
      if (!m) return;
      const [updated] = await db.update(directMessages)
        .set({ unsentAt: sql`now()`, content: "", originalContent: sql`coalesce(${directMessages.originalContent}, ${directMessages.content})` })
        .where(and(eq(directMessages.id, m.id), editWindowSql)).returning();
      if (!updated) return res.status(409).json({ message: "Messages can be unsent for 10 minutes after sending" });
      await db.delete(dmReactions).where(eq(dmReactions.messageId, m.id));
      res.json((await presentDirectMessages([updated], userId))[0]);
    } catch (e) {
      res.status(500).json({ message: "Failed to unsend" });
    }
  });

  // ── typing ──
  app.post("/api/dm/:matchId/typing", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.matchId);
    const { ok } = await inMatch(matchId, userId).catch(() => ({ ok: false, other: null }));
    if (!ok) return res.sendStatus(403);
    const k = `${matchId}:${userId}`;
    if (req.body?.typing === false) typing.delete(k);
    else typing.set(k, Date.now() + TYPING_TTL_MS);
    res.json({ ok: true });
  });

  app.get("/api/dm/:matchId/typing", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.matchId);
    const { ok, other } = await inMatch(matchId, userId).catch(() => ({ ok: false, other: null }));
    if (!ok || !other) return res.sendStatus(403);
    const until = typing.get(`${matchId}:${other}`);
    res.setHeader("Cache-Control", "no-store");
    res.json({ typing: !!until && until > Date.now() });
  });
}

/** Sending a text clears that member's typing state straight away. */
export function stoppedTyping(matchId: number, userId: string) {
  typing.delete(`${matchId}:${userId}`);
}
