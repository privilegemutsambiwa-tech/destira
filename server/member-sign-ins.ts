// A short log of member sign-ins for the console's member page (Part L1):
// when, how, the network (never the full address) and a plain device name.
// Best effort: a failure here never blocks signing in.
import type { Request } from "express";
import { lt } from "drizzle-orm";
import { db } from "./db";
import { memberSignIns } from "@shared/schema";

const KEEP_DAYS = 90;

export function networkOf(req: Request): string | null {
  const raw = ((req.headers["x-forwarded-for"] as string) || "").split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  const ip = raw.replace(/^::ffff:/, "");
  if (ip === "::1" || ip === "127.0.0.1") return "this computer";
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.x`;
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}::`;
  return null;
}

export function deviceOf(req: Request): string | null {
  const ua = String(req.headers["user-agent"] || "");
  if (!ua) return null;
  if (/DestiraApp|; wv\)/i.test(ua)) return "Android app";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : null;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Other";
}

export async function recordSignIn(req: Request, userId: string, method: "password" | "google" | "signup"): Promise<void> {
  try {
    await db.insert(memberSignIns).values({ userId, method, network: networkOf(req), device: deviceOf(req) });
    // Now and then, drop what's older than we keep.
    if (Math.random() < 0.02) {
      await db.delete(memberSignIns).where(lt(memberSignIns.createdAt, new Date(Date.now() - KEEP_DAYS * 86_400_000)));
    }
  } catch (e) {
    console.error("[sign-ins] could not record:", e);
  }
}
