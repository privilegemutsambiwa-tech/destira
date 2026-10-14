// Signup attribution and share logging — the raw data behind the console's
// Growth page. Nothing here affects matching or what anyone sees.
//
// The client stamps two first-touch cookies on a signed-out visitor
// (client/src/lib/attribution.ts): vf_ref (a referral code from ?ref=) and
// vf_src ("source|detail"). attributeNewSignup reads both once, when an
// account is created — by email/password or Google — then clears them.
import type { Request, Response } from "express";
import { db } from "./db";
import { signupSources, shareEvents } from "@shared/schema";
import * as referrals from "./referrals";

export const SIGNUP_SOURCES = [
  "referral",
  "share_card",
  "event",
  "group",
  "campaign",
  "search",
  "social",
  "other_site",
  "direct",
] as const;
export type SignupSource = (typeof SIGNUP_SOURCES)[number];

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

function parseSourceCookie(raw: string | null): { source: SignupSource; detail: string | null } | null {
  if (!raw) return null;
  const [source, ...rest] = raw.split("|");
  if (!(SIGNUP_SOURCES as readonly string[]).includes(source)) return null;
  const detail = rest.join("|").trim().slice(0, 80) || null;
  return { source: source as SignupSource, detail };
}

/** Call once, right after a NEW account is created. Attaches a referral
 *  code if there is one, records where the member came from, and clears
 *  both cookies on `res`. Never throws — attribution must not break signup. */
export async function attributeNewSignup(userId: string, req: Request, res: Response): Promise<void> {
  const refCode = readCookie(req, "vf_ref");
  const src = parseSourceCookie(readCookie(req, "vf_src"));
  if (refCode || src) {
    res.append("Set-Cookie", "vf_ref=; Path=/; Max-Age=0; SameSite=Lax");
    res.append("Set-Cookie", "vf_src=; Path=/; Max-Age=0; SameSite=Lax");
  }

  let referred = false;
  if (refCode) {
    try {
      const r = await referrals.attachReferral(userId, refCode);
      referred = r.ok;
      if (r.ok) referrals.checkQualification(userId).catch(() => {});
    } catch (err) {
      console.error("[growth] referral attach failed:", err);
    }
  }

  // A friend's code is the strongest signal, whatever page they landed on;
  // the landing page still says how they got there (e.g. a Status card).
  const source: SignupSource = referred ? "referral" : src?.source ?? "direct";
  const detail = referred ? (src && src.source !== "referral" ? src.source : null) : src?.detail ?? null;
  try {
    await db.insert(signupSources).values({ userId, source, detail }).onConflictDoNothing();
  } catch (err) {
    console.error("[growth] signup source insert failed:", err);
  }
}

export async function recordShare(
  userId: string,
  kind: "event" | "invite",
  format: "status_card" | "link" | "destira_story",
  targetId: string | null,
): Promise<void> {
  await db.insert(shareEvents).values({ userId, kind, format, targetId });
}
