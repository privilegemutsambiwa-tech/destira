// Meta Conversions API: the server tells Meta about sign-ups and payments, so
// ad campaigns can learn who actually joins and pays. The browser pixel
// (client/src/lib/pixel.ts) misses phones that block it and never sees a
// payment (those are confirmed server to server), so these come from here.
//
// Each event carries the same event id the browser uses (when the browser
// sends one), so Meta counts it once. Personal details are SHA-256 hashed as
// Meta requires; the raw values never leave the server.
//
// Env (set on Render by the owner):
//   META_CAPI_TOKEN        Events Manager > Settings > Conversions API > Generate access token
//   META_PIXEL_ID          optional; defaults to Destira's pixel
//   META_TEST_EVENT_CODE   optional; shows events under Events Manager > Test events
// Without a token (and always in local dev) nothing is sent.
import crypto from "crypto";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { adMatchKeys, users } from "@shared/schema";

const PIXEL_ID = process.env.META_PIXEL_ID?.trim() || "1741505700253566";
const TOKEN = process.env.META_CAPI_TOKEN?.trim();
const TEST_CODE = process.env.META_TEST_EVENT_CODE?.trim();
const API = "https://graph.facebook.com/v21.0";
const SITE = "https://www.destira.date";

export const metaCapiEnabled = !!TOKEN && process.env.NODE_ENV === "production";

const sha = (v: string) => crypto.createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers?.cookie;
  if (typeof raw !== "string") return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(v.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function clientIp(req: Request): string | null {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return fwd || req.socket?.remoteAddress || null;
}

/** At sign-up: keep what Meta needs to match this member's later payment to
 *  the ad they came from. Never throws. */
export async function rememberAdMatchKeys(userId: string, req: Request): Promise<void> {
  try {
    const fbp = readCookie(req, "_fbp");
    const fbc = readCookie(req, "_fbc");
    await db
      .insert(adMatchKeys)
      .values({ userId, fbp, fbc, clientIp: clientIp(req), userAgent: req.get("user-agent")?.slice(0, 400) ?? null })
      .onConflictDoNothing();
  } catch (e) {
    console.error("[meta] couldn't store match keys:", e);
  }
}

type MetaEvent = {
  name: "CompleteRegistration" | "Purchase" | "Subscribe";
  eventId: string;
  userId: string;
  sourceUrl?: string;
  value?: number;
  currency?: string;
  contentName?: string;
};

/** Fire and forget. Logs and swallows every failure. */
export async function sendMetaEvent(ev: MetaEvent): Promise<void> {
  if (!metaCapiEnabled) return;
  try {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, ev.userId));
    const [k] = await db.select().from(adMatchKeys).where(eq(adMatchKeys.userId, ev.userId));
    const userData: Record<string, unknown> = { external_id: [sha(ev.userId)] };
    if (u?.email) userData.em = [sha(u.email)];
    if (k?.fbp) userData.fbp = k.fbp;
    if (k?.fbc) userData.fbc = k.fbc;
    if (k?.clientIp) userData.client_ip_address = k.clientIp;
    if (k?.userAgent) userData.client_user_agent = k.userAgent;
    const customData: Record<string, unknown> = {};
    if (ev.value != null) {
      customData.value = Number(ev.value.toFixed(2));
      customData.currency = ev.currency ?? "USD";
    }
    if (ev.contentName) customData.content_name = ev.contentName;

    const body: Record<string, unknown> = {
      data: [
        {
          event_name: ev.name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: ev.eventId,
          action_source: "website",
          event_source_url: ev.sourceUrl ?? SITE,
          user_data: userData,
          custom_data: customData,
        },
      ],
    };
    if (TEST_CODE) body.test_event_code = TEST_CODE;
    const res = await fetch(`${API}/${PIXEL_ID}/events?access_token=${encodeURIComponent(TOKEN!)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[meta] ${ev.name} rejected: ${res.status} ${(await res.text()).slice(0, 300)}`);
  } catch (e) {
    console.error(`[meta] ${ev.name} failed:`, e);
  }
}

/** The id the browser pixel also uses for a sign-up, so Meta counts it once. */
export const registrationEventId = (userId: string) => `reg-${userId}`;
