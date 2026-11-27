// Helpers the route modules share: who's signed in, upload limits, the
// AI rate limit, "It's a match!" and the profile-text scan.
import { storage } from "../storage";
import { and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import { putObject } from "../storage/objectStorage";
import * as push from "../push";
import * as safety from "../safety";

const aiRateLimits = new Map<string, number[]>();
export function checkAIRateLimit(userId: string, maxPerMinute: number = 10): boolean {
  const now = Date.now();
  const timestamps = aiRateLimits.get(userId) || [];
  const recent = timestamps.filter(t => now - t < 60000);
  if (recent.length >= maxPerMinute) return false;
  recent.push(now);
  aiRateLimits.set(userId, recent);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of aiRateLimits.entries()) {
    const recent = timestamps.filter(t => now - t < 60000);
    if (recent.length === 0) aiRateLimits.delete(key);
    else aiRateLimits.set(key, recent);
  }
}, 300000);

// Buffers in memory rather than writing to local disk — putObject() below
// sends that buffer to Supabase Storage (or local disk as a dev fallback,
// see server/storage/objectStorage.ts) instead of multer writing it itself.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
    }
  },
});

// Separate instance for host-video: that route takes a `video` field
// (recorded webm/mp4, up to 60s) alongside a `poster` image field, which the
// image-only fileFilter above would reject outright. 50MB covers a 60s
// in-app recording at a reasonable bitrate with headroom.
export const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      file.fieldname === "poster"
        ? ["image/jpeg", "image/png", "image/webp"]
        : ["video/webm", "video/mp4"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported ${file.fieldname} type: ${file.mimetype}`));
    }
  },
});

// Fires from every path that can flip a match to "matched" (mutual like,
// like-back, an accepted private-chat request, VIP auto-match) — one place
// so "It's a match!" always reaches both people the same way.
export async function notifyMatch(match: { id: number; user1Id: string; user2Id: string }): Promise<void> {
  try {
    const [p1, p2] = await Promise.all([storage.getProfile(match.user1Id), storage.getProfile(match.user2Id)]);
    const name1 = p1?.displayName || "Someone";
    const name2 = p2?.displayName || "Someone";
    await Promise.all([
      storage.createNotification(match.user1Id, "match", "It's a match!", `You and ${name2} matched.`, `/chat/${match.id}`),
      storage.createNotification(match.user2Id, "match", "It's a match!", `You and ${name1} matched.`, `/chat/${match.id}`),
    ]);
    push.sendCategorizedPush(match.user1Id, "matches", { title: "It's a match!", body: `You and ${name2} matched.`, url: "/matches", tag: `match-${match.id}` }).catch(() => {});
    push.sendCategorizedPush(match.user2Id, "matches", { title: "It's a match!", body: `You and ${name1} matched.`, url: "/matches", tag: `match-${match.id}` }).catch(() => {});
  } catch (e) {
    console.error("notifyMatch error:", e);
  }
}

// Profile text that reaches everyone (bio, about me, prompt answers): flag
// numbers, money asks and scam lines for the Risk queue (server/safety/).
export function scanProfileText(userId: string, body: any) {
  const parts = [body?.bio, body?.aboutMe, body?.prompts ? JSON.stringify(body.prompts) : null, body?.details?.job, body?.details?.country].filter((v) => typeof v === "string" && v.trim());
  if (parts.length) safety.scanText({ senderId: userId, text: parts.join("\n"), source: "profile" }).catch(() => {});
}

export function getUserId(req: any): string | null {
  if (!req.isAuthenticated()) return null;
  return (req.user as any).claims.sub;
}

// Reactions and polls are keyed off a bare group-message id with no group
// id in the URL, so without this a member of ANY group could read/react to
// a message in a group they never joined just by guessing/incrementing the
// id. Resolves the message, then requires the caller to actually be a
// member of the group it belongs to.
export async function requireGroupMessageAccess(messageId: number, userId: string) {
  const message = await storage.getGroupMessage(messageId);
  if (!message) return { ok: false as const, status: 404, body: { message: "Message not found" } };
  const member = await storage.getGroupMember(message.groupId, userId);
  if (!member) return { ok: false as const, status: 403, body: { message: "Not authorized" } };
  return { ok: true as const, message };
}

// Raw GPS coordinates never need to leave the server, even for a user's own
// profile — the client only ever needs the coarse locationName / a computed
// distanceKm. Used on every route that serializes a full Profile row.
export function stripRawLocation<T extends Record<string, any>>(profile: T): Omit<T, "locationLat" | "locationLng"> {
  const { locationLat, locationLng, ...safe } = profile;
  return safe;
}
