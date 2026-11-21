// Scam and abuse defence (docs/destira-3-upgrade-prompt.md Part B).
//
// Signals go to the console's Risk queue (server/admin/risk.ts); a person
// decides. The only automatic step is a hold, for a clear pattern (asking
// several people for money in a day): a held account is hidden from Discover
// and can't message or like until the team looks. Nothing is deleted.
//
//   scanText          messages, story replies, profile text  -> flags
//   blockIfHeld       refuse sends from a held account
//   checkLikeBurst    likes sprayed in bulk                  -> flag
//   checkPhoto        same photo on another account          -> flag
//   sessionGuard      ends the session of a banned/suspended member, records
//                     the device id each account uses
//   checkNewProfile   a new profile on a banned member's device -> hold
import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import sharp from "sharp";
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { accountDevices, matches, photoHashes, profiles, riskFlags, userPhotos } from "@shared/schema";
import { detectRisks, type RiskHit } from "@shared/safety";
import { getObjectBuffer, keyFromUploadUrl } from "../storage/objectStorage";

const DAY = 24 * 3600 * 1000;
/** Held while the team reviews: hidden from Discover (which needs "active"), can't send. */
export const HELD = "review";

// ── flags ────────────────────────────────────────────────────────────

type FlagInput = {
  userId: string;
  kind: string;
  severity: "low" | "medium" | "high";
  source: string;
  refId?: string | number | null;
  otherUserId?: string | null;
  snippet?: string | null;
};

/** One open flag per member, kind and place per day: a scammer who sends the
 *  same thing ten times in one chat is one flag, not ten. */
async function flag(f: FlagInput): Promise<boolean> {
  const [dup] = await db
    .select({ id: riskFlags.id })
    .from(riskFlags)
    .where(
      and(
        eq(riskFlags.userId, f.userId),
        eq(riskFlags.kind, f.kind),
        eq(riskFlags.status, "open"),
        f.otherUserId ? eq(riskFlags.otherUserId, f.otherUserId) : sql`${riskFlags.otherUserId} is null`,
        gte(riskFlags.createdAt, new Date(Date.now() - DAY)),
      ),
    )
    .limit(1);
  if (dup) return false;
  await db.insert(riskFlags).values({
    userId: f.userId,
    kind: f.kind,
    severity: f.severity,
    source: f.source,
    refId: f.refId != null ? String(f.refId) : null,
    otherUserId: f.otherUserId ?? null,
    snippet: f.snippet ? f.snippet.slice(0, 300) : null,
  });
  return true;
}

async function hold(userId: string, why: string) {
  const [p] = await db.select({ status: profiles.moderationStatus }).from(profiles).where(eq(profiles.userId, userId));
  if (!p || p.status !== "active") return; // already held, suspended or banned; or no profile yet
  await db
    .update(profiles)
    .set({ moderationStatus: HELD, moderationStatusReason: why, moderationStatusAt: new Date() })
    .where(eq(profiles.userId, userId));
  await flag({ userId, kind: "auto_hold", severity: "high", source: "system", snippet: why });
  console.warn(`[safety] held ${userId}: ${why}`);
}

/** Asking several different people for money in a day, or a pile of serious
 *  signals, is a pattern worth stopping until a person looks. */
async function maybeHold(userId: string) {
  const since = new Date(Date.now() - DAY);
  const rows = await db
    .select({ kind: riskFlags.kind, severity: riskFlags.severity, other: riskFlags.otherUserId })
    .from(riskFlags)
    // Only open flags: once the team clears something as a false alarm it
    // must not count towards holding them again.
    .where(and(eq(riskFlags.userId, userId), eq(riskFlags.status, "open"), gte(riskFlags.createdAt, since), ne(riskFlags.kind, "auto_hold")));
  const askedFor = new Set(rows.filter((r) => r.kind === "money_request" && r.other).map((r) => r.other));
  const serious = rows.filter((r) => r.severity !== "low").length;
  if (askedFor.size >= 3) await hold(userId, `Asked ${askedFor.size} people for money in 24 hours`);
  else if (serious >= 5) await hold(userId, `${serious} scam signals in 24 hours`);
}

// ── messages ─────────────────────────────────────────────────────────

/** Scans text a member sent and flags anything worth a look. Fire and forget:
 *  it never delays or blocks the message itself. */
export async function scanText(p: {
  senderId: string;
  text: unknown;
  source: "dm" | "group" | "story_comment" | "profile";
  refId?: string | number | null;
  recipientId?: string | null;
}): Promise<RiskHit[]> {
  if (typeof p.text !== "string" || !p.text.trim()) return [];
  const hits = detectRisks(p.text);
  if (!hits.length) return hits;
  try {
    let added = false;
    for (const h of hits) {
      // A number or "WhatsApp" is only a tip for the reader; on its own it's
      // a flag only when it's on a profile (where it reaches everyone).
      if (h.kind === "off_platform" && p.source !== "profile") continue;
      const kind = p.source === "profile" ? "profile_text" : h.kind;
      added =
        (await flag({
          userId: p.senderId,
          kind,
          severity: p.source === "profile" && h.kind === "off_platform" ? "low" : h.severity,
          source: p.source,
          refId: p.refId,
          otherUserId: p.recipientId ?? null,
          snippet: h.snippet,
        })) || added;
    }
    if (added) await maybeHold(p.senderId);
  } catch (e) {
    console.error("[safety] scan failed:", e);
  }
  return hits;
}

/** Sends a 403 and returns true if this account is held for review. */
export async function blockIfHeld(res: Response, userId: string): Promise<boolean> {
  const [p] = await db.select({ status: profiles.moderationStatus }).from(profiles).where(eq(profiles.userId, userId));
  if (p?.status !== HELD) return false;
  res.status(403).json({
    code: "ACCOUNT_IN_REVIEW",
    message: "Your account is being checked by our team, so you can't send messages or likes right now. We'll be in touch soon.",
  });
  return true;
}

// ── likes ────────────────────────────────────────────────────────────

const BURST_LIKES = 40;
const BURST_WINDOW_MS = 10 * 60 * 1000;
export async function checkLikeBurst(userId: string): Promise<void> {
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(matches)
      .where(and(eq(matches.user1Id, userId), gte(matches.createdAt, new Date(Date.now() - BURST_WINDOW_MS))));
    const n = Number(row?.n ?? 0);
    if (n >= BURST_LIKES) {
      await flag({ userId, kind: "like_burst", severity: "medium", source: "like", snippet: `${n} likes in 10 minutes` });
    }
  } catch (e) {
    console.error("[safety] like burst check failed:", e);
  }
}

// ── photos ───────────────────────────────────────────────────────────

/** 64-bit difference hash: survives resizing and recompression. */
export async function dHash(buf: Buffer): Promise<string> {
  const px = await sharp(buf).rotate().grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

function distance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** Near-identical photos differ in only a few of 64 bits. */
const SAME_PHOTO_MAX_DISTANCE = 5;

/** Fingerprints a newly added profile photo and flags it if another account
 *  already uses the same picture. Fire and forget. */
export async function checkPhoto(userId: string, photoId: number, photoUrl: string): Promise<void> {
  try {
    const key = keyFromUploadUrl(photoUrl);
    if (!key) return;
    const buf = await getObjectBuffer(key);
    if (!buf) return;
    const hash = await dHash(buf);
    await db.insert(photoHashes).values({ photoId, userId, hash }).onConflictDoNothing();
    // Only photos that are still up: a deleted photo's fingerprint stays in
    // the table but must not count.
    const others = await db
      .select({ userId: photoHashes.userId, photoId: photoHashes.photoId, hash: photoHashes.hash })
      .from(photoHashes)
      .innerJoin(userPhotos, eq(userPhotos.id, photoHashes.photoId))
      .where(ne(photoHashes.userId, userId));
    const same = others.find((o) => distance(o.hash, hash) <= SAME_PHOTO_MAX_DISTANCE);
    if (same) {
      await flag({
        userId,
        kind: "duplicate_photo",
        severity: "medium",
        source: "photo",
        refId: photoId,
        otherUserId: same.userId,
        snippet: `Photo #${photoId} matches photo #${same.photoId} on another account`,
      });
    }
  } catch (e) {
    console.error("[safety] photo check failed:", e);
  }
}

// ── sessions and devices ─────────────────────────────────────────────

const DEVICE_COOKIE = "vf_dev";
const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/;

function deviceIdOf(req: Request): string | null {
  const h = req.get("x-destira-device");
  if (h && DEVICE_RE.test(h)) return h;
  const c = (req.headers.cookie ?? "").split(/;\s*/).find((x) => x.startsWith(`${DEVICE_COOKIE}=`));
  const v = c ? decodeURIComponent(c.slice(DEVICE_COOKIE.length + 1)) : null;
  return v && DEVICE_RE.test(v) ? v : null;
}

// Small in-memory caches so this costs nothing on most requests.
const statusCache = new Map<string, { status: string; at: number }>();
const STATUS_TTL_MS = 60 * 1000;
const seenDevice = new Map<string, number>();
const DEVICE_TOUCH_MS = 6 * 3600 * 1000;

async function moderationStatusOf(userId: string): Promise<string> {
  const hit = statusCache.get(userId);
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.status;
  const [p] = await db.select({ status: profiles.moderationStatus }).from(profiles).where(eq(profiles.userId, userId));
  const status = p?.status ?? "active";
  statusCache.set(userId, { status, at: Date.now() });
  return status;
}

/** Call after changing someone's moderation status so it applies at once. */
export function forgetStatus(userId: string) {
  statusCache.delete(userId);
}

async function touchDevice(userId: string, deviceId: string) {
  const k = `${userId}:${deviceId}`;
  const last = seenDevice.get(k);
  if (last && Date.now() - last < DEVICE_TOUCH_MS) return;
  seenDevice.set(k, Date.now());
  await db
    .insert(accountDevices)
    .values({ userId, deviceId })
    .onConflictDoUpdate({ target: [accountDevices.userId, accountDevices.deviceId], set: { lastSeenAt: new Date() } });
}

/** Mount right after the session middleware. */
export function sessionGuard() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Every browser gets a random id that stays with it (the app sends its own).
    if (!req.get("x-destira-device") && !deviceIdOf(req)) {
      res.append(
        "Set-Cookie",
        `${DEVICE_COOKIE}=${crypto.randomBytes(18).toString("base64url")}; Path=/; Max-Age=${400 * 86400}; HttpOnly; SameSite=Lax${req.secure ? "; Secure" : ""}`,
      );
    }
    if (!req.path.startsWith("/api/") || req.path.startsWith("/api/admin")) return next();
    const userId = (req as any).isAuthenticated?.() ? (req as any).user?.claims?.sub : null;
    if (!userId) return next();
    try {
      const status = await moderationStatusOf(userId);
      if (status === "banned" || status === "suspended") {
        // A ban used to stop only new logins; a phone already signed in kept
        // working. End the session so the ban applies everywhere at once.
        (req as any).logout?.(() => {
          (req as any).session?.destroy?.(() => {});
        });
        return res.status(401).json({
          code: "ACCOUNT_RESTRICTED",
          message: status === "banned" ? "This account has been removed for violating our terms." : "This account is temporarily suspended.",
        });
      }
      const dev = deviceIdOf(req);
      if (dev) touchDevice(userId, dev).catch(() => {});
    } catch (e) {
      console.error("[safety] session guard error:", e);
    }
    next();
  };
}

/** Banned in the last 90 days on the same phone or browser as this account? */
async function sharesDeviceWithBanned(userId: string): Promise<string | null> {
  const mine = await db.select({ deviceId: accountDevices.deviceId }).from(accountDevices).where(eq(accountDevices.userId, userId));
  if (!mine.length) return null;
  const rows = await db
    .select({ userId: accountDevices.userId })
    .from(accountDevices)
    .innerJoin(profiles, eq(profiles.userId, accountDevices.userId))
    .where(
      and(
        inArray(
          accountDevices.deviceId,
          mine.map((d) => d.deviceId),
        ),
        ne(accountDevices.userId, userId),
        eq(profiles.moderationStatus, "banned"),
        gte(profiles.moderationStatusAt, new Date(Date.now() - 90 * DAY)),
      ),
    )
    .limit(1);
  return rows[0]?.userId ?? null;
}

/** Right after a profile is first created. Shared phones are common, so this
 *  holds the new account for a person to look at rather than refusing it. */
export async function checkNewProfile(req: Request, userId: string): Promise<void> {
  try {
    const dev = deviceIdOf(req);
    if (dev) await touchDevice(userId, dev);
    const banned = await sharesDeviceWithBanned(userId);
    if (!banned) return;
    await flag({ userId, kind: "banned_device", severity: "high", source: "device", otherUserId: banned, snippet: "Same phone or browser as a banned account" });
    await hold(userId, "Signed up on the same phone or browser as a banned account");
    forgetStatus(userId);
  } catch (e) {
    console.error("[safety] new profile check failed:", e);
  }
}
