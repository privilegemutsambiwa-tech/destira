// Push, two ways, one sendPush:
//  - Web push (browsers). VAPID keys from env (generate with
//    `npx web-push generate-vapid-keys`): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//    VAPID_SUBJECT (mailto: or https://). iOS Safari only delivers to a
//    home-screen-installed PWA (16.4+); Android Chrome delivers from the
//    service worker even when closed.
//  - The Android/iOS app, through Firebase Cloud Messaging. FIREBASE_SERVICE_ACCOUNT
//    = the service-account JSON from Firebase console → Project settings →
//    Service accounts (the whole JSON, on one line).
// Either unset = that path is a no-op; the in-app banner + notification inbox
// still work.

import webpush from "web-push";
import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { db } from "./db";
import { pushSubscriptions, deviceTokens, profiles, pushLog, twinNotifications, type PushLogRow } from "@shared/schema";
import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import {
  EXEMPT_CATEGORIES, PUSH_CATEGORIES, PUSH_DAILY_BUDGET, BURST_WINDOW_MS, isQuietHour, localClock, type NotificationCategory,
} from "@shared/notify";

let ready = false;
try {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:hello@destira.date",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    ready = true;
  } else {
    console.log("[push] VAPID keys not set — web push disabled (in-app alerts still work)");
  }
} catch (e) {
  console.error("[push] setup failed:", e);
}

let fcmApp: App | null = null;
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    fcmApp = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(raw)) });
  } else {
    console.log("[push] FIREBASE_SERVICE_ACCOUNT not set — app push disabled (web push unaffected)");
  }
} catch (e) {
  console.error("[push] Firebase setup failed:", e);
  fcmApp = null;
}

export function pushConfigured(): boolean {
  return ready;
}
export function appPushConfigured(): boolean {
  return fcmApp !== null;
}
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export type { NotificationCategory };

// Missing key => on, matching the Settings toggles' default-enabled behavior
// (a user who never opened the toggle keeps getting notified).
async function memberPushState(userId: string): Promise<{ prefs: Record<string, boolean>; tz: string | null }> {
  const [row] = await db.select({ prefs: profiles.notificationPrefs, tz: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  return { prefs: row?.prefs ?? {}, tz: row?.tz ?? null };
}

export type PushOutcome = "sent" | "held" | "over_budget" | "off" | "duplicate";
export interface PushOptions {
  /** Once-only: a second push with the same key for this member is dropped. */
  dedupeKey?: string;
  /** For tests and sweeps that reason about a specific moment. */
  now?: Date;
}

const NON_EXEMPT: string[] = PUSH_CATEGORIES.filter((c) => !EXEMPT_CATEGORIES.has(c));
NON_EXEMPT.push("digest");

async function nonExemptSentToday(userId: string, day: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(pushLog).where(and(
    eq(pushLog.userId, userId), eq(pushLog.localDay, day), eq(pushLog.status, "sent"), inArray(pushLog.category, NON_EXEMPT),
  ));
  return Number(r?.n ?? 0);
}

async function sentWithinBurst(userId: string, now: Date): Promise<boolean> {
  const [recent] = await db.select({ id: pushLog.id }).from(pushLog).where(and(
    eq(pushLog.userId, userId), eq(pushLog.status, "sent"), inArray(pushLog.category, NON_EXEMPT),
    gte(pushLog.createdAt, new Date(now.getTime() - BURST_WINDOW_MS)),
  )).limit(1);
  return !!recent;
}

// The one place a category-gated push goes out. Every send-site funnels
// through here, so a new notification type can't skip the member's switch,
// the daily budget, quiet hours or the burst rule:
//   - switched off                    -> nothing
//   - matches/messages                -> straight out, any hour, not counted
//   - 21:00-08:00 their time          -> held, folded into one push at 08:00
//   - within 15 min of the last one   -> held, folded into one a little later
//   - already 4 today                 -> not pushed (it's still in the bell)
export async function sendCategorizedPush(userId: string, category: NotificationCategory, payload: PushPayload, opts: PushOptions = {}): Promise<PushOutcome> {
  const now = opts.now ?? new Date();
  const { prefs, tz } = await memberPushState(userId);
  const { hour, day } = localClock(tz, now);
  const row = { userId, category, title: payload.title, body: payload.body, url: payload.url ?? null, tag: payload.tag ?? null, localDay: day, createdAt: now };

  let id: number | null = null;
  if (opts.dedupeKey) {
    const [claimed] = await db.insert(pushLog).values({ ...row, dedupeKey: opts.dedupeKey, status: "pending" })
      .onConflictDoNothing().returning({ id: pushLog.id });
    if (!claimed) return "duplicate";
    id = claimed.id;
  }
  const record = async (status: Exclude<PushOutcome, "duplicate">) => {
    if (id != null) await db.update(pushLog).set({ status }).where(eq(pushLog.id, id));
    else await db.insert(pushLog).values({ ...row, status });
    return status;
  };

  if (prefs[category] === false) return record("off");
  if (EXEMPT_CATEGORIES.has(category)) {
    await sendPush(userId, payload);
    return record("sent");
  }
  if (isQuietHour(hour)) return record("held");
  if ((await nonExemptSentToday(userId, day)) >= PUSH_DAILY_BUDGET) return record("over_budget");
  if (await sentWithinBurst(userId, now)) return record("held");
  // Counted before it goes out, so two at once can't both slip under the budget.
  await record("sent");
  await sendPush(userId, payload);
  return "sent";
}

/**
 * Held pushes go out once the member's morning arrives (or the burst window
 * passes): one held item as itself, two or more folded into a single push
 * that opens the bell. Either way it counts as one against the day's budget.
 */
export async function runPushDigests(opts: { now?: Date } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const held = await db.select().from(pushLog).where(eq(pushLog.status, "held")).orderBy(asc(pushLog.createdAt));
  const byUser = new Map<string, PushLogRow[]>();
  for (const r of held) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  let sent = 0;
  for (const [userId, rows] of Array.from(byUser.entries())) {
    const { prefs, tz } = await memberPushState(userId);
    const { hour, day } = localClock(tz, now);
    if (isQuietHour(hour)) continue;
    if (await sentWithinBurst(userId, now)) continue;
    const ids = rows.map((r) => r.id);
    const claimed = await db.update(pushLog).set({ status: "digested" })
      .where(and(inArray(pushLog.id, ids), eq(pushLog.status, "held"))).returning({ id: pushLog.id });
    if (claimed.length !== ids.length) continue;
    // Switched off since it was held: those are dropped.
    const live = rows.filter((r) => prefs[r.category] !== false);
    if (!live.length) continue;
    if ((await nonExemptSentToday(userId, day)) >= PUSH_DAILY_BUDGET) continue;
    const one = live.length === 1 ? live[0] : null;
    const payload: PushPayload = one
      ? { title: one.title, body: one.body, url: one.url ?? undefined, tag: one.tag ?? undefined }
      : {
          title: `${live.length} things since you last looked`,
          body: live.slice(0, 3).map((r) => r.title).join(" · "),
          url: "/notifications",
          tag: "digest",
        };
    await db.insert(pushLog).values({
      userId, category: one ? one.category : "digest", title: payload.title, body: payload.body,
      url: payload.url ?? null, tag: payload.tag ?? null, status: "sent", localDay: day, createdAt: now,
    });
    await sendPush(userId, payload);
    sent++;
  }
  return sent;
}

/**
 * The bell and the push together, for moments that belong in both: one
 * inbox row (with the screen it opens), then the push through the budget.
 * With a dedupeKey the claim comes first, so a reminder can't land twice.
 */
export async function notify(
  userId: string,
  category: NotificationCategory,
  n: { type: string; title: string; body: string; url: string; tag?: string },
  opts: PushOptions = {},
): Promise<PushOutcome> {
  const push = () => sendCategorizedPush(userId, category, { title: n.title, body: n.body, url: n.url, tag: n.tag }, opts);
  const inbox = () => db.insert(twinNotifications).values({ userId, type: n.type, title: n.title, body: n.body, url: n.url });
  if (opts.dedupeKey) {
    const outcome = await push();
    if (outcome !== "duplicate") await inbox();
    return outcome;
  }
  await inbox();
  return push();
}

let digestTimer: NodeJS.Timeout | null = null;
/** Every 5 minutes: fold and send whatever was held. */
export function startPushDigests(): void {
  if (digestTimer) return;
  const tick = () => runPushDigests().catch((e) => console.error("[push] digest sweep failed:", e));
  setTimeout(tick, 60_000);
  digestTimer = setInterval(tick, 5 * 60_000);
}

// Best-effort, to every browser and phone the member has. Prunes dead
// subscriptions and tokens. Never throws.
export async function sendPush(userId: string, payload: PushPayload): Promise<void> {
  await Promise.all([sendWebPush(userId, payload), sendAppPush(userId, payload)]);
}

// Tokens Firebase says will never deliver again.
const DEAD_TOKEN = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

async function sendAppPush(userId: string, payload: PushPayload): Promise<void> {
  if (!fcmApp) return;
  try {
    const rows = await db.select().from(deviceTokens).where(eq(deviceTokens.userId, userId));
    if (!rows.length) return;
    const res = await getMessaging(fcmApp).sendEachForMulticast({
      tokens: rows.map((r) => r.token),
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url ?? "/", ...(payload.tag ? { tag: payload.tag } : {}) },
      android: {
        priority: "high",
        notification: {
          channelId: "destira",
          icon: "ic_stat_destira",
          color: "#FF6B4A",
          ...(payload.tag ? { tag: payload.tag } : {}),
        },
      },
    });
    const dead = res.responses
      .map((r, i) => (!r.success && DEAD_TOKEN.has(r.error?.code ?? "") ? rows.at(i)?.token : null))
      .filter((t): t is string => !!t);
    if (dead.length) await db.delete(deviceTokens).where(inArray(deviceTokens.token, dead)).catch(() => {});
  } catch (e) {
    console.error("[push] app push failed:", e);
  }
}

async function sendWebPush(userId: string, payload: PushPayload): Promise<void> {
  if (!ready) return;
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 900 },
        );
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint)).catch(() => {});
        }
      }
    }),
  );
}
