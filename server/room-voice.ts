// Voice notes in Lounge rooms (docs/destira-3-upgrade-prompt.md Part J), the
// same recorder and player as direct messages (Part E).
//   POST /api/groups/:id/voice                  multipart: file, durationMs, replyToMessageId?
//   GET  /api/groups/:id/voice/:messageId       the audio, for members of the room only
// Kept under a "dm-" key, which the general /uploads route refuses.
import type { Express, Request } from "express";
import multer from "multer";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import * as safety from "./safety";
import { putObject, getObjectBuffer } from "./storage/objectStorage";
import { DM_MEDIA_PREFIX } from "./dm-extras";
import { denyIfCantPost } from "./lounge-moderation";
import { notifyRoomMessage } from "./lounge-discovery";
import { groupMessages } from "@shared/schema";
import { VOICE_MAX_BYTES, VOICE_MAX_MS } from "@shared/dm";

const AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VOICE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (AUDIO_TYPES[file.mimetype.split(";")[0]]) cb(null, true);
    else cb(new Error("Only voice notes can be sent here"));
  },
});

export const roomVoiceUrl = (groupId: number, messageId: number) => `/api/groups/${groupId}/voice/${messageId}`;

export function registerRoomVoiceRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  app.post("/api/groups/:id/voice", (req, res, next) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) return res.status(err?.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: err?.code === "LIMIT_FILE_SIZE" ? "That voice note is too long" : err.message });
      next();
    });
  }, async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = Number.parseInt(req.params.id, 10);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member) return res.status(403).json({ message: "Must join group first" });
      const group = await storage.getGroup(groupId);
      const mod = member.role === "owner" || member.role === "admin";
      if (!mod && group?.postingPermission === "admins_only") return res.status(403).json({ message: "Only admins can post in this group" });
      if (!mod && group?.canMembersSendMessages === false) return res.status(403).json({ message: "The host has turned off messaging in this group" });
      if (!mod && group?.mediaPermission === "admin_only") return res.status(403).json({ message: "Only admins can post media in this group" });
      if (await denyIfCantPost(res, group, member)) return;
      if (await safety.blockIfHeld(res, userId)) return;

      if (!req.file) return res.status(400).json({ message: "No voice note attached" });
      const mime = String(req.file.mimetype).split(";")[0];
      const durationMs = Math.round(Number(req.body?.durationMs));
      if (!Number.isFinite(durationMs) || durationMs < 300) return res.status(400).json({ message: "That voice note is too short" });
      if (durationMs > VOICE_MAX_MS + 1500) return res.status(400).json({ message: "Voice notes can be up to a minute" });
      const replyTo = Number.parseInt(String(req.body?.replyToMessageId ?? ""), 10);

      const key = `${DM_MEDIA_PREFIX}room${groupId}-${Date.now()}-${Math.round(Math.random() * 1e9)}.${AUDIO_TYPES[mime]}`;
      await putObject(key, req.file.buffer, mime);
      const [row] = await db.insert(groupMessages).values({
        groupId,
        userId,
        nickname: member.nickname || "Someone",
        content: "Voice note",
        contentType: "voice",
        mediaKey: key,
        durationMs: Math.min(durationMs, VOICE_MAX_MS),
        replyToMessageId: Number.isFinite(replyTo) ? replyTo : null,
      }).returning();
      const [msg] = await db.update(groupMessages).set({ mediaUrl: roomVoiceUrl(groupId, row.id) })
        .where(eq(groupMessages.id, row.id)).returning();
      res.status(201).json({ ...msg, mediaKey: null, originalContent: null });
      notifyRoomMessage(groupId, userId, msg).catch(() => {});
    } catch (e) {
      console.error("[room-voice] send failed:", e);
      res.status(500).json({ message: "Failed to send" });
    }
  });

  app.get("/api/groups/:id/voice/:messageId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const groupId = Number.parseInt(req.params.id, 10);
      const [m] = await db.select().from(groupMessages)
        .where(and(eq(groupMessages.id, Number.parseInt(req.params.messageId, 10)), eq(groupMessages.groupId, groupId)));
      if (!m || !m.mediaKey || m.isDeletedByAdmin || m.deletedForEveryone) return res.sendStatus(404);
      if (!(await storage.isGroupMember(groupId, userId))) return res.sendStatus(404);
      const buf = await getObjectBuffer(m.mediaKey);
      if (!buf) return res.sendStatus(404);
      const ext = m.mediaKey.split(".").pop() ?? "";
      const mime = Object.entries(AUDIO_TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.setHeader("Content-Type", mime);
      res.send(buf);
    } catch {
      res.status(500).json({ message: "Failed to load" });
    }
  });
}
