// Destira Crown, server side (shared/crown.ts has the prices and rules).
//
// Flow: a verified member applies (/crown) -> the team approves in the
// console (which holds a seat for CROWN_APPROVAL_HOLD_DAYS) -> the member pays
// through the normal payment rails (tier "crown") -> activateCrown() runs
// inside the payment's own transaction. Revoking (console) ends it at once.
//
// Who is Crown right now is read through a small cache (activeCrownIds), so
// the badge can be shown on every screen; every change calls
// forgetCrownCache(), so a revoked crown disappears on the next refresh.
import type { Express, Request } from "express";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "./db";
import { appSettings, crownMembers, profiles, userPhotos } from "@shared/schema";
import {
  CROWN_APPROVAL_HOLD_DAYS,
  CROWN_CITY,
  CROWN_DEFAULT_SEAT_CAP,
  CROWN_PERIOD_DAYS,
  CROWN_PRICE_CENTS,
  type CrownPeriod,
  type CrownStatus,
} from "@shared/crown";

const DAY_MS = 86_400_000;
const SETTINGS_KEY = "crown";
const REAPPLY_AFTER_DAYS = 30;

// ── settings and seats ────────────────────────────────────────────

export interface CrownSettings {
  seatCap: number;
  /** Applications open. Closing them keeps current members as they are. */
  open: boolean;
}

export async function crownSettings(): Promise<CrownSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY));
  const v = (row?.value ?? {}) as Partial<CrownSettings>;
  return {
    seatCap: typeof v.seatCap === "number" && v.seatCap >= 0 ? Math.floor(v.seatCap) : CROWN_DEFAULT_SEAT_CAP,
    open: v.open !== false,
  };
}

export async function setCrownSettings(patch: Partial<CrownSettings>, adminUserId: string): Promise<CrownSettings> {
  const cur = await crownSettings();
  const next: CrownSettings = {
    seatCap: typeof patch.seatCap === "number" && patch.seatCap >= 0 ? Math.min(10_000, Math.floor(patch.seatCap)) : cur.seatCap,
    open: typeof patch.open === "boolean" ? patch.open : cur.open,
  };
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: next, updatedBy: adminUserId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedBy: adminUserId, updatedAt: new Date() } });
  return next;
}

/** Seats in use: paid-up members, plus approvals still inside their hold. */
export async function seatsTaken(now = new Date()): Promise<number> {
  const holdFrom = new Date(now.getTime() - CROWN_APPROVAL_HOLD_DAYS * DAY_MS);
  const [r] = await db
    .select({ n: count() })
    .from(crownMembers)
    .where(
      sql`(${crownMembers.status} = 'active' and ${crownMembers.activeUntil} > ${now})
       or (${crownMembers.status} = 'approved' and ${crownMembers.decidedAt} > ${holdFrom})`,
    );
  return Number(r?.n ?? 0);
}

export function isActiveRow(row: { status: string; activeUntil: Date | null } | undefined, now = new Date()): boolean {
  return !!row && row.status === "active" && !!row.activeUntil && row.activeUntil > now;
}

// ── who is Crown (cached) ─────────────────────────────────────────

let cache: { ids: Set<string>; at: number } | null = null;
const CACHE_MS = 60_000;

export function forgetCrownCache(): void {
  cache = null;
}

export async function activeCrownIds(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ids;
  const rows = await db
    .select({ userId: crownMembers.userId })
    .from(crownMembers)
    .where(and(eq(crownMembers.status, "active"), gt(crownMembers.activeUntil, new Date())));
  cache = { ids: new Set(rows.map((r) => r.userId)), at: Date.now() };
  return cache.ids;
}

export async function isCrown(userId: string): Promise<boolean> {
  return (await activeCrownIds()).has(userId);
}

// ── a member's own state ──────────────────────────────────────────

async function memberBasics(userId: string) {
  const [p] = await db
    .select({ isVerified: profiles.isVerified, moderationStatus: profiles.moderationStatus })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const [ph] = await db.select({ n: count() }).from(userPhotos).where(eq(userPhotos.userId, userId));
  return {
    hasProfile: !!p,
    verified: !!p?.isVerified,
    inGoodStanding: (p?.moderationStatus ?? "active") === "active",
    hasPhoto: Number(ph?.n ?? 0) > 0,
  };
}

export type CrownState = {
  status: CrownStatus | null;
  active: boolean;
  activeUntil: string | null;
  reason: string | null;
  verified: boolean;
  hasPhoto: boolean;
  seatCap: number;
  seatsLeft: number;
  open: boolean;
  /** Why they can't apply right now, or null if they can. */
  applyBlock: string | null;
  /** Why they can't pay right now, or null if they can. */
  payBlock: string | null;
  prices: Record<CrownPeriod, number>;
  city: string;
};

export async function crownState(userId: string, now = new Date()): Promise<CrownState> {
  const [[row], basics, settings, taken] = await Promise.all([
    db.select().from(crownMembers).where(eq(crownMembers.userId, userId)),
    memberBasics(userId),
    crownSettings(),
    seatsTaken(now),
  ]);
  const status = (row?.status ?? null) as CrownStatus | null;
  const active = isActiveRow(row, now);
  const holdsSeat = active || (status === "approved" && !!row?.decidedAt && row.decidedAt.getTime() > now.getTime() - CROWN_APPROVAL_HOLD_DAYS * DAY_MS);
  const seatsLeft = Math.max(0, settings.seatCap - taken);

  let applyBlock: string | null = null;
  if (!basics.hasProfile) applyBlock = "Finish your profile first.";
  else if (!basics.inGoodStanding) applyBlock = "Your account is under review.";
  else if (!basics.verified) applyBlock = "Verify your profile with a selfie first. Every Crown member is verified.";
  else if (!basics.hasPhoto) applyBlock = "Add at least one photo first.";
  else if (status === "applied") applyBlock = "Your application is with the team.";
  else if (status === "approved" || active) applyBlock = "You're already in.";
  else if (status === "active") applyBlock = "Your crown has lapsed. Renew below to get it back.";
  else if (status === "revoked") applyBlock = "Your crown was removed. Write to support@destira.date if you think that's wrong.";
  else if (status === "declined" && row?.decidedAt && now.getTime() - row.decidedAt.getTime() < REAPPLY_AFTER_DAYS * DAY_MS) {
    applyBlock = `You can apply again from ${new Date(row.decidedAt.getTime() + REAPPLY_AFTER_DAYS * DAY_MS).toDateString()}.`;
  } else if (!settings.open) applyBlock = "Applications are closed for now.";

  let payBlock: string | null = null;
  if (!basics.verified) payBlock = "Crown is for verified members only.";
  else if (!basics.inGoodStanding) payBlock = "Your account is under review.";
  else if (status === "active" && !active && seatsLeft <= 0) payBlock = "Every seat is taken right now. We'll tell you when one opens.";
  else if (status === "approved" && !holdsSeat) payBlock = "Your approval has lapsed. Apply again and the team will look at it quickly.";
  else if (status !== "approved" && status !== "active") payBlock = "Apply first; the team approves every Crown member.";

  return {
    status,
    active,
    activeUntil: row?.activeUntil ? row.activeUntil.toISOString() : null,
    reason: status === "declined" || status === "revoked" ? row?.reason ?? null : null,
    verified: basics.verified,
    hasPhoto: basics.hasPhoto,
    seatCap: settings.seatCap,
    seatsLeft,
    open: settings.open,
    applyBlock,
    payBlock,
    prices: CROWN_PRICE_CENTS,
    city: CROWN_CITY,
  };
}

/** The payment route's check before starting a Crown payment. */
export async function canPayCrown(userId: string): Promise<string | null> {
  return (await crownState(userId)).payBlock;
}

/** Inside activateFromPayment's transaction: switch the crown on (or extend
 *  it). Time is added on top of what's left, like every other plan. */
export async function activateCrown(tx: any, userId: string, period: CrownPeriod, now = new Date()): Promise<Date> {
  const [row] = await tx.select().from(crownMembers).where(eq(crownMembers.userId, userId)).for("update");
  const base = row?.activeUntil && row.activeUntil > now ? row.activeUntil : now;
  const until = new Date(base.getTime() + CROWN_PERIOD_DAYS[period] * DAY_MS);
  if (row) {
    await tx.update(crownMembers).set({ status: "active", activeUntil: until, updatedAt: now }).where(eq(crownMembers.userId, userId));
  } else {
    // Only reachable if a payment was started while approved and the row was
    // since removed; the money is in, so honour it.
    await tx.insert(crownMembers).values({ userId, status: "active", activeUntil: until, appliedAt: now, decidedAt: now });
  }
  forgetCrownCache();
  return until;
}

// ── member routes ─────────────────────────────────────────────────

export function registerCrownRoutes(app: Express, getUserId: (req: Request) => string | null) {
  app.get("/api/crown", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await crownState(userId));
    } catch (e) {
      console.error("[crown] state failed:", e);
      res.status(500).json({ message: "Couldn't load Crown" });
    }
  });

  // Who wears the crown, for the badge on every screen. Ids only.
  app.get("/api/crown/members", async (req, res) => {
    if (!getUserId(req)) return res.sendStatus(401);
    try {
      res.set("Cache-Control", "private, max-age=60");
      res.json({ ids: Array.from(await activeCrownIds()) });
    } catch (e) {
      console.error("[crown] members failed:", e);
      res.status(500).json({ message: "Couldn't load" });
    }
  });

  app.post("/api/crown/apply", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const state = await crownState(userId);
      if (state.applyBlock) return res.status(409).json({ message: state.applyBlock });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 600) : "";
      if (note.length < 20) return res.status(400).json({ message: "Tell us a little about yourself and what you're looking for (a couple of sentences)." });
      const now = new Date();
      await db
        .insert(crownMembers)
        .values({ userId, status: "applied", note, city: CROWN_CITY, appliedAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: crownMembers.userId,
          set: { status: "applied", note, appliedAt: now, decidedAt: null, decidedBy: null, reason: null, updatedAt: now },
        });
      res.json(await crownState(userId));
    } catch (e) {
      console.error("[crown] apply failed:", e);
      res.status(500).json({ message: "Couldn't send your application" });
    }
  });
}
