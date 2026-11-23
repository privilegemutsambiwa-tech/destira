// Events, the rest of Part J (docs/destira-3-upgrade-prompt.md).
//   GET  /api/events/:id/calendar.ics   a calendar file, with reminders the day before and 2 hours before
//   GET  /api/events/:id/about          the host (events hosted, stars), a partner offer, and rating state
//   POST /api/events/:id/rating         { stars: 1-5, note? } from someone who was there, after it ends
//   GET  /api/hosts/:userId             a host's page: their stars and what's coming up
//   GET  /api/admin/places?q=           (admin console) places, partners first
//   PATCH /api/admin/places/:id/partner (admin console) { offer: string | null }
// People rate the event, never each other. Stars show publicly from 3 ratings.
import type { Express, Request } from "express";
import { and, asc, desc, eq, gt, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import { eventAttendees, eventRatings, events, places, profiles, type Event } from "@shared/schema";
import {
  PARTNER_OFFER_MAX, RATING_NOTE_MAX, RATING_OPEN_MS, RATINGS_SHOWN_FROM,
  type AdminPlace, type EventAbout, type HostPage, type HostSummary, type RatingState,
} from "@shared/event-extras";
import { eventEnd } from "@shared/event-door";
import { fold, icsStamp, icsText } from "@shared/date-plan";
import { storage } from "./storage";
import { wasThere } from "./event-door";
import { publicOrigin } from "./group-invite";
import { adminRoute } from "./admin/auth";
import { auditAdmin } from "./admin/audit";

type Fail = { error: number; message: string };
const firstName = (n: string | null | undefined) => (n || "Someone").trim().split(/\s+/)[0] || "Someone";
const whereOf = (e: Pick<Event, "venueName" | "suburb" | "city">) => [e.venueName, e.suburb, e.city].filter(Boolean).join(", ");

async function eventOf(id: number): Promise<Event | null> {
  if (!Number.isFinite(id)) return null;
  const [e] = await db.select().from(events).where(eq(events.id, id));
  return e ?? null;
}

/** Published and either public, or you're going or hosting. */
async function canSee(e: Event, userId: string): Promise<boolean> {
  if (e.hostUserId === userId) return true;
  if (e.status !== "published") return false;
  if (e.visibility === "public") return true;
  const [a] = await db.select({ id: eventAttendees.id }).from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, e.id), eq(eventAttendees.userId, userId)));
  return !!a;
}

// ── calendar ───────────────────────────────────────────────────────────

export function buildEventIcs(e: Event, origin: string, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Destira//Event//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:destira-event-${e.id}@destira.date`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(e.startsAt)}`,
    `DTEND:${icsStamp(eventEnd(e))}`,
    `SUMMARY:${icsText(e.title)}`,
    `LOCATION:${icsText(whereOf(e))}`,
    `DESCRIPTION:${icsText(`Destira event. Details and your door pass: ${origin}/events/${e.id}`)}`,
    `URL:${origin}/events/${e.id}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-P1D", `DESCRIPTION:${icsText(`${e.title} is tomorrow`)}`, "END:VALARM",
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT2H", `DESCRIPTION:${icsText(`${e.title} in 2 hours`)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ── hosts and ratings ──────────────────────────────────────────────────

export async function hostSummary(hostId: string, now = new Date()): Promise<HostSummary> {
  const [p] = await db.select({ displayName: profiles.displayName, isPublic: profiles.isPublic, coverPhotoUrl: profiles.coverPhotoUrl })
    .from(profiles).where(eq(profiles.userId, hostId));
  const photos = p ? await storage.resolveProfilePhotos([{ userId: hostId, isPublic: p.isPublic, coverPhotoUrl: p.coverPhotoUrl ?? null, profileImageUrl: null }]) : new Map();
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(events)
    .where(and(eq(events.hostUserId, hostId), eq(events.status, "published"), lt(events.startsAt, now)));
  const [r] = await db.select({ avg: sql<number>`avg(${eventRatings.stars})`, count: sql<number>`count(*)` })
    .from(eventRatings).innerJoin(events, eq(events.id, eventRatings.eventId)).where(eq(events.hostUserId, hostId));
  const count = Number(r?.count ?? 0);
  return {
    userId: hostId,
    name: firstName(p?.displayName),
    photoUrl: photos.get(hostId) ?? p?.coverPhotoUrl ?? null,
    hosted: Number(n),
    rating: count >= RATINGS_SHOWN_FROM ? { avg: Math.round(Number(r.avg) * 10) / 10, count } : null,
  };
}

function ratingOpen(e: Event, now: Date): boolean {
  const end = eventEnd(e);
  return e.status === "published" && now >= end && now.getTime() <= end.getTime() + RATING_OPEN_MS;
}

export async function ratingState(e: Event, userId: string, now = new Date()): Promise<RatingState> {
  if (e.hostUserId === userId) {
    const rows = await db.select().from(eventRatings).where(eq(eventRatings.eventId, e.id)).orderBy(desc(eventRatings.updatedAt));
    return {
      canRate: false, mine: null,
      forHost: {
        avg: rows.length ? Math.round((rows.reduce((s, r) => s + r.stars, 0) / rows.length) * 10) / 10 : null,
        count: rows.length,
        notes: rows.filter((r) => r.note).map((r) => ({ stars: r.stars, note: r.note!, at: r.updatedAt.toISOString() })),
      },
    };
  }
  const [mine] = await db.select().from(eventRatings).where(and(eq(eventRatings.eventId, e.id), eq(eventRatings.userId, userId)));
  const canRate = ratingOpen(e, now) && (await wasThere(e)).has(userId);
  return { canRate, mine: mine ? { stars: mine.stars, note: mine.note } : null, forHost: null };
}

export async function rate(e: Event, userId: string, body: { stars?: unknown; note?: unknown }, now = new Date()): Promise<RatingState | Fail> {
  if (e.hostUserId === userId) return { error: 403, message: "Hosts don't rate their own events." };
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: 400, message: "1 to 5 stars." };
  const note = typeof body.note === "string" ? body.note.trim().replace(/\s+/g, " ").slice(0, RATING_NOTE_MAX) || null : null;
  if (!ratingOpen(e, now)) return { error: 409, message: "Ratings open when the event ends and close two weeks later." };
  if (!(await wasThere(e)).has(userId)) return { error: 403, message: "Ratings are from people who were there." };
  await db.insert(eventRatings).values({ eventId: e.id, userId, stars, note })
    .onConflictDoUpdate({ target: [eventRatings.eventId, eventRatings.userId], set: { stars, note, updatedAt: now } });
  return ratingState(e, userId, now);
}

export async function hostPage(hostId: string, now = new Date()): Promise<HostPage> {
  const upcoming = await db.select().from(events)
    .where(and(eq(events.hostUserId, hostId), eq(events.status, "published"), eq(events.visibility, "public"), gt(events.startsAt, now)))
    .orderBy(asc(events.startsAt)).limit(10);
  return {
    host: await hostSummary(hostId, now),
    upcoming: upcoming.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt.toISOString(), where: whereOf(e) })),
  };
}

// ── venue partners ─────────────────────────────────────────────────────

export async function partnerOfferFor(placeId: number | null): Promise<string | null> {
  if (!placeId) return null;
  const [p] = await db.select({ offer: places.partnerOffer }).from(places).where(eq(places.id, placeId));
  return p?.offer ?? null;
}

const adminPlace = (p: typeof places.$inferSelect): AdminPlace => ({
  id: p.id, name: p.name, suburb: p.suburb, city: p.city, placeType: p.placeType,
  partnerOffer: p.partnerOffer, partnerSince: p.partnerSince?.toISOString() ?? null,
});

export function registerEventExtraRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  const wrap = (fn: (req: Request, res: any, userId: string, e: Event) => Promise<unknown>) => async (req: Request, res: any) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const e = await eventOf(Number(req.params.id));
      if (!e || !(await canSee(e, userId))) return res.status(404).json({ message: "No such event." });
      await fn(req, res, userId, e);
    } catch (err) { console.error("[event-extras]", err); if (!res.headersSent) res.status(500).json({ message: "Something went wrong" }); }
  };

  app.get("/api/events/:id/calendar.ics", wrap(async (req, res, _userId, e) => {
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="destira-event-${e.id}.ics"`);
    res.send(buildEventIcs(e, publicOrigin(req)));
  }));
  app.get("/api/events/:id/about", wrap(async (_req, res, userId, e) => {
    const out: EventAbout = { host: await hostSummary(e.hostUserId), partnerOffer: await partnerOfferFor(e.placeId), rating: await ratingState(e, userId) };
    res.json(out);
  }));
  app.post("/api/events/:id/rating", wrap(async (req, res, userId, e) => {
    const out = await rate(e, userId, req.body ?? {});
    if ("error" in out) return res.status(out.error).json({ message: out.message });
    res.json(out);
  }));
  app.get("/api/hosts/:userId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const hostId = String(req.params.userId);
      if ((await storage.isBlocked(userId, hostId)) || (await storage.isBlocked(hostId, userId))) return res.status(404).json({ message: "Not found." });
      res.json(await hostPage(hostId));
    } catch (err) { console.error("[event-extras]", err); res.status(500).json({ message: "Something went wrong" }); }
  });

  // The admin console: who's a venue partner, and what members get there.
  adminRoute(app, "get", "/api/admin/places", "support", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    const rows = await db.select().from(places)
      .where(q ? or(ilike(places.name, `%${q}%`), ilike(places.suburb, `%${q}%`)) : undefined)
      .orderBy(sql`${places.partnerOffer} is null`, asc(places.name)).limit(60);
    res.json(rows.map(adminPlace));
  });
  adminRoute(app, "patch", "/api/admin/places/:id/partner", "admin", async (req, res) => {
    const id = Number(req.params.id);
    const raw = req.body?.offer;
    const offer = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (offer.length > PARTNER_OFFER_MAX) return res.status(400).json({ message: `Keep the offer under ${PARTNER_OFFER_MAX} characters.` });
    const [before] = await db.select().from(places).where(eq(places.id, id));
    if (!before) return res.status(404).json({ message: "No such place." });
    const [p] = await db.update(places).set(offer
      ? { partnerOffer: offer, partnerSince: before.partnerSince ?? new Date() }
      : { partnerOffer: null, partnerSince: null }).where(eq(places.id, id)).returning();
    await auditAdmin(req, (req as any).admin.userId, offer ? "place.partner_set" : "place.partner_clear", { targetType: "place", targetId: id, details: { offer: offer || null } });
    res.json(adminPlace(p));
  });
}

/** For "Let's meet": partner offers by place name. */
export async function partnerOffersByName(names: string[]): Promise<Map<string, string>> {
  if (!names.length) return new Map();
  const rows = await db.select({ name: places.name, offer: places.partnerOffer }).from(places)
    .where(and(inArray(places.name, names), sql`${places.partnerOffer} is not null`));
  return new Map(rows.map((r) => [r.name, r.offer!]));
}
