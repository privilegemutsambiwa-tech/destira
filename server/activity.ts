// The bell and the "new since you last looked" markers (Part I).
//   GET  /api/activity            every notification of the last 60 days, newest first
//   POST /api/activity/read-all   mark them all read
//   GET  /api/activity/new        { discover, lounge, events }: is there something new?
//   POST /api/activity/seen/:surface
import type { Express, Request } from "express";
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { events, groupMembers, groupMessages, profiles, surfaceSeen, twinNotifications } from "@shared/schema";
import { fallbackUrl } from "@shared/notify";
import { genderMatchesSeeking } from "./storage";

export const SURFACES = ["discover", "lounge", "events"] as const;
export type Surface = (typeof SURFACES)[number];

export interface ActivityItem {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string;
  read: boolean;
  createdAt: string;
}

export async function activityFor(userId: string): Promise<ActivityItem[]> {
  const rows = await db.select().from(twinNotifications)
    .where(and(eq(twinNotifications.userId, userId), sql`${twinNotifications.createdAt} > now() - interval '60 days'`))
    .orderBy(desc(twinNotifications.createdAt), desc(twinNotifications.id))
    .limit(150);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    url: r.url || fallbackUrl(r.type),
    read: !!r.read,
    createdAt: (r.createdAt ?? new Date()).toISOString(),
  }));
}

/**
 * Something new since the member last opened each surface. A first visit
 * sets the mark and shows nothing, so a new member isn't greeted with dots.
 *   discover: someone new joined who they'd want to see
 *   lounge:   a new message from someone else in a room they're in (not muted)
 *   events:   a new public event coming up
 */
export async function newSince(userId: string): Promise<Record<Surface, boolean>> {
  const seen = new Map((await db.select().from(surfaceSeen).where(eq(surfaceSeen.userId, userId))).map((r) => [r.surface, r.seenAt]));
  const out: Record<Surface, boolean> = { discover: false, lounge: false, events: false };

  const d = seen.get("discover");
  if (d) {
    const [me] = await db.select({ seeking: profiles.seekingGenders }).from(profiles).where(eq(profiles.userId, userId));
    const seeking = (me?.seeking ?? []) as string[];
    const fresh = await db.select({ gender: profiles.gender }).from(profiles).where(and(
      ne(profiles.userId, userId), eq(profiles.isPublic, true), eq(profiles.onboardingCompleted, true), gt(profiles.createdAt, d),
    )).orderBy(desc(profiles.createdAt)).limit(40);
    out.discover = fresh.some((p) => seeking.includes("everyone") || genderMatchesSeeking(p.gender, seeking));
  }

  const l = seen.get("lounge");
  if (l) {
    const [hit] = await db.select({ id: groupMessages.id }).from(groupMessages)
      .innerJoin(groupMembers, and(eq(groupMembers.groupId, groupMessages.groupId), eq(groupMembers.userId, userId)))
      .where(and(
        ne(groupMessages.userId, userId), gt(groupMessages.createdAt, l),
        sql`coalesce(${groupMembers.isMuted}, false) = false`,
        sql`coalesce(${groupMessages.deletedForEveryone}, false) = false`,
        sql`coalesce(${groupMessages.isDeletedByAdmin}, false) = false`,
      )).limit(1);
    out.lounge = !!hit;
  }

  const e = seen.get("events");
  if (e) {
    const [hit] = await db.select({ id: events.id }).from(events).where(and(
      eq(events.status, "published"), eq(events.visibility, "public"),
      gt(events.createdAt, e), sql`${events.startsAt} > now()`,
    )).limit(1);
    out.events = !!hit;
  }
  return out;
}

export async function markSeen(userId: string, surface: Surface): Promise<void> {
  await db.insert(surfaceSeen).values({ userId, surface, seenAt: sql`now()` as any })
    .onConflictDoUpdate({ target: [surfaceSeen.userId, surfaceSeen.surface], set: { seenAt: sql`now()` } });
}

export function registerActivityRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  app.get("/api/activity", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await activityFor(userId));
    } catch (e) {
      console.error("[activity] list failed:", e);
      res.status(500).json({ message: "Couldn't load your activity" });
    }
  });

  app.post("/api/activity/read-all", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    await db.update(twinNotifications).set({ read: true }).where(and(eq(twinNotifications.userId, userId), eq(twinNotifications.read, false)));
    res.json({ ok: true });
  });

  app.get("/api/activity/new", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await newSince(userId));
    } catch (e) {
      console.error("[activity] new-since failed:", e);
      res.json({ discover: false, lounge: false, events: false });
    }
  });

  app.post("/api/activity/seen/:surface", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const surface = req.params.surface as Surface;
    if (!SURFACES.includes(surface)) return res.status(400).json({ message: "Unknown surface" });
    await markSeen(userId, surface);
    res.json({ ok: true });
  });
}
