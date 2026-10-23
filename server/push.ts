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
import { pushSubscriptions, deviceTokens, profiles } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

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

export type NotificationCategory = "matches" | "messages" | "stories" | "interviews" | "events";

// Missing key => on, matching the Settings toggles' default-enabled behavior
// (a user who never opened the toggle keeps getting notified).
async function categoryEnabled(userId: string, category: NotificationCategory): Promise<boolean> {
  const [row] = await db.select({ prefs: profiles.notificationPrefs }).from(profiles).where(eq(profiles.userId, userId));
  const v = row?.prefs?.[category];
  return v !== false;
}

// The one place a category-gated push goes out — every send-site funnels
// through here instead of calling sendPush directly, so a new notification
// type can't accidentally skip the user's preference.
export async function sendCategorizedPush(userId: string, category: NotificationCategory, payload: PushPayload): Promise<void> {
  if (!(await categoryEnabled(userId, category))) return;
  await sendPush(userId, payload);
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
