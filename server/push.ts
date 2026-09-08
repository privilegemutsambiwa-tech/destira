// Web push. VAPID keys come from env (generate with `npx web-push generate-vapid-keys`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https://)
// If they're unset, push is a no-op — the in-app banner + notification inbox
// still work. iOS Safari only delivers to a home-screen-installed PWA (16.4+);
// Android Chrome delivers from the service worker even when closed.

import webpush from "web-push";
import { db } from "./db";
import { pushSubscriptions } from "@shared/schema";
import { eq } from "drizzle-orm";

let ready = false;
try {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:hello@vibeflow.app",
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

export function pushConfigured(): boolean {
  return ready;
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

// Best-effort. Prunes dead subscriptions (404/410). Never throws.
export async function sendPush(userId: string, payload: PushPayload): Promise<void> {
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
