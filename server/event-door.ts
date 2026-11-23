// Events, the in-person side (docs/destira-3-upgrade-prompt.md Part J).
//   GET  /api/events/:id/door/pass        your door pass: a QR the host scans
//   GET  /api/events/:id/door             the host's door list
//   POST /api/events/:id/door/checkin     { a, t } from a scanned pass, { code }, or { a } by hand (host only)
//   GET  /api/events/:id/clicks           "Who did you click with?"
//   POST /api/events/:id/clicks/:userId   { kind: "love" | "friends" | null }, private
// Check-in marks attendance once. Once a host has checked anyone in, only
// people checked in (and the host) can pick or be picked. A mutual pick
// becomes one chat, with "You both met at …" on it.
import crypto from "crypto";
import type { Express, Request } from "express";
import QRCode from "qrcode";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import { blockedUsers, eventAttendees, eventClicks, events, matches, profiles, type Event } from "@shared/schema";
import { ageFromDob } from "@shared/essentials";
import { wantsFriends, wantsLove } from "@shared/friends";
import {
  clicksWindow, doorWindow, eventEnd,
  type CheckInResult, type ClickKind, type DoorList, type DoorPass, type DoorPerson, type EventClicks,
} from "@shared/event-door";
import { genderMatchesSeeking, storage } from "./storage";
import { notify } from "./push";
import { publicOrigin } from "./group-invite";

type Fail = { error: number; message: string };
const secret = () => process.env.SESSION_SECRET || "local-dev-insecure-secret";

/** A pass can't be guessed from an attendee id. */
export function passToken(attendeeId: number): string {
  return crypto.createHmac("sha256", secret()).update(`door:${attendeeId}`).digest("base64url").slice(0, 22);
}
const passCode = (attendeeId: number) => passToken(attendeeId).replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
const sameToken = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const firstName = (n: string | null | undefined) => (n || "Someone").trim().split(/\s+/)[0] || "Someone";

async function eventOf(id: number): Promise<Event | null> {
  if (!Number.isFinite(id)) return null;
  const [e] = await db.select().from(events).where(eq(events.id, id));
  return e ?? null;
}

async function cards(ids: string[]) {
  const uniq = Array.from(new Set(ids));
  if (!uniq.length) return new Map<string, { name: string; photoUrl: string | null; age: number | null }>();
  const ps = await db.select({
    userId: profiles.userId, displayName: profiles.displayName, age: profiles.age, dateOfBirth: profiles.dateOfBirth,
    isPublic: profiles.isPublic, coverPhotoUrl: profiles.coverPhotoUrl,
  }).from(profiles).where(inArray(profiles.userId, uniq));
  const photos = await storage.resolveProfilePhotos(ps.map((p) => ({ userId: p.userId, isPublic: p.isPublic, coverPhotoUrl: p.coverPhotoUrl ?? null, profileImageUrl: null })));
  return new Map(ps.map((p) => [p.userId, {
    name: firstName(p.displayName),
    photoUrl: photos.get(p.userId) ?? p.coverPhotoUrl ?? null,
    age: (p.dateOfBirth ? ageFromDob(p.dateOfBirth) : null) ?? p.age ?? null,
  }]));
}

// ── the door ───────────────────────────────────────────────────────────

const isOpen = (e: Event, now = new Date()) => {
  const w = doorWindow(e);
  return e.status === "published" && now >= w.opensAt && now <= w.closesAt;
};

export async function doorPass(e: Event, userId: string, origin: string, now = new Date()): Promise<DoorPass | Fail> {
  const [a] = await db.select().from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, e.id), eq(eventAttendees.userId, userId), eq(eventAttendees.status, "going")));
  if (!a) return { error: 404, message: "You don't have a seat at this event." };
  const open = isOpen(e, now);
  const show = open && !a.checkedInAt;
  const link = `${origin}/events/${e.id}/door?a=${a.id}&t=${passToken(a.id)}`;
  return {
    open,
    opensAt: doorWindow(e).opensAt.toISOString(),
    checkedInAt: a.checkedInAt?.toISOString() ?? null,
    qr: show ? await QRCode.toDataURL(link, { margin: 1, width: 320 }) : null,
    link: show ? link : null,
    code: show ? passCode(a.id) : null,
  };
}

async function doorPeople(eventId: number): Promise<DoorPerson[]> {
  const rows = await db.select().from(eventAttendees).where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.status, "going")));
  const ppl = await cards(rows.map((r) => r.userId));
  return rows.map((r) => ({
    attendeeId: r.id, userId: r.userId, name: ppl.get(r.userId)?.name ?? "Someone", photoUrl: ppl.get(r.userId)?.photoUrl ?? null,
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
  })).sort((x, y) => Number(!!x.checkedInAt) - Number(!!y.checkedInAt) || x.name.localeCompare(y.name));
}

export async function doorList(e: Event, now = new Date()): Promise<DoorList> {
  const people = await doorPeople(e.id);
  return {
    eventId: e.id, title: e.title, startsAt: e.startsAt.toISOString(),
    open: isOpen(e, now), opensAt: doorWindow(e).opensAt.toISOString(),
    people, inCount: people.filter((p) => p.checkedInAt).length,
  };
}

export async function checkIn(e: Event, hostId: string, body: { a?: unknown; t?: unknown; code?: unknown }, now = new Date()): Promise<CheckInResult | Fail> {
  if (e.hostUserId !== hostId) return { error: 403, message: "Only the host checks people in. Show this to them at the door." };
  if (!isOpen(e, now)) return { error: 409, message: "The door opens 3 hours before the start and closes 6 hours after the end." };
  const going = await db.select().from(eventAttendees).where(and(eq(eventAttendees.eventId, e.id), eq(eventAttendees.status, "going")));
  let row: typeof going[number] | undefined;
  if (typeof body.code === "string" && body.code.trim()) {
    const code = body.code.trim().toUpperCase();
    row = going.find((g) => passCode(g.id) === code);
    if (!row) return { error: 404, message: "That code isn't on this event's list." };
  } else {
    row = going.find((g) => g.id === Number(body.a));
    if (!row) return { error: 404, message: "That pass isn't for this event, or the seat was given up." };
    if (body.t !== undefined && !sameToken(String(body.t), passToken(row.id))) return { error: 403, message: "That pass doesn't check out." };
  }
  // Once: the first scan wins, a second one just says so.
  const [set] = await db.update(eventAttendees).set({ checkedInAt: now, checkedInBy: hostId })
    .where(and(eq(eventAttendees.id, row.id), isNull(eventAttendees.checkedInAt))).returning();
  const person = (await doorPeople(e.id)).find((p) => p.attendeeId === row!.id)!;
  return set ? { status: "checked_in", person } : { status: "already", person };
}

// ── who did you click with ─────────────────────────────────────────────

/** Who was there: checked in (once the host used check-in at all) or going, and the host. */
async function wasThere(e: Event): Promise<Set<string>> {
  const rows = await db.select({ userId: eventAttendees.userId, at: eventAttendees.checkedInAt }).from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, e.id), eq(eventAttendees.status, "going")));
  const usedDoor = rows.some((r) => r.at);
  const out = new Set(rows.filter((r) => !usedDoor || r.at).map((r) => r.userId));
  out.add(e.hostUserId);
  return out;
}

async function blockedWith(userId: string): Promise<Set<string>> {
  const rows = await db.select({ a: blockedUsers.blockerId, b: blockedUsers.blockedId }).from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId)));
  return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
}

function clickState(e: Event, now: Date): EventClicks["state"] {
  const w = clicksWindow(e);
  if (now < w.opensAt) return "before";
  return now > w.closesAt ? "closed" : "open";
}

export async function eventClicksFor(e: Event, userId: string, now = new Date()): Promise<EventClicks> {
  const w = clicksWindow(e);
  const base = { opensAt: w.opensAt.toISOString(), closesAt: w.closesAt.toISOString(), title: e.title, people: [] };
  if (e.status !== "published") return { ...base, state: "not_there" };
  const there = await wasThere(e);
  if (!there.has(userId)) return { ...base, state: "not_there" };
  const state = clickState(e, now);
  if (state === "before") return { ...base, state };

  const blocked = await blockedWith(userId);
  const ids = Array.from(there).filter((id) => id !== userId && !blocked.has(id));
  const ps = await db.select({
    userId: profiles.userId, lookingFor: profiles.lookingFor, gender: profiles.gender, seekingGenders: profiles.seekingGenders, moderationStatus: profiles.moderationStatus,
  }).from(profiles).where(inArray(profiles.userId, [userId, ...ids]));
  const me = ps.find((p) => p.userId === userId);
  const seeks = (a: typeof ps[number], b: typeof ps[number]) =>
    (a.seekingGenders ?? []).includes("everyone") || genderMatchesSeeking(b.gender, a.seekingGenders ?? []);
  const mine = await db.select({ toId: eventClicks.toId, kind: eventClicks.kind }).from(eventClicks)
    .where(and(eq(eventClicks.eventId, e.id), eq(eventClicks.fromId, userId)));
  const back = await db.select({ fromId: eventClicks.fromId }).from(eventClicks)
    .where(and(eq(eventClicks.eventId, e.id), eq(eventClicks.toId, userId)));
  const backSet = new Set(back.map((b) => b.fromId));
  const ms = await db.select({ id: matches.id, a: matches.user1Id, b: matches.user2Id }).from(matches)
    .where(and(eq(matches.status, "matched"), or(eq(matches.user1Id, userId), eq(matches.user2Id, userId))));
  const ppl = await cards(ids);
  const people = ps.filter((p) => p.userId !== userId && p.moderationStatus === "active").map((p) => {
    const pick = mine.find((m) => m.toId === p.userId);
    const mutual = !!pick && backSet.has(p.userId);
    const m = mutual ? ms.find((x) => x.a === p.userId || x.b === p.userId) : undefined;
    return {
      userId: p.userId,
      name: ppl.get(p.userId)?.name ?? "Someone",
      age: ppl.get(p.userId)?.age ?? null,
      photoUrl: ppl.get(p.userId)?.photoUrl ?? null,
      canLove: !!me && wantsLove(me.lookingFor) && wantsLove(p.lookingFor) && seeks(me, p) && seeks(p, me),
      canFriends: !!me && wantsFriends(me.lookingFor) && wantsFriends(p.lookingFor),
      myPick: (pick?.kind as ClickKind) ?? null,
      matchId: m?.id ?? null,
    };
  }).filter((p) => p.canLove || p.canFriends)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ...base, state, people };
}

const dayName = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "Africa/Harare" });

export async function pickClick(e: Event, fromId: string, toId: string, kind: ClickKind | null, now = new Date()) {
  const view = await eventClicksFor(e, fromId, now);
  if (view.state === "not_there") return { error: 403, message: "Picks are for people who were there." } as Fail;
  if (view.state !== "open") return { error: 409, message: "Picks open when the event ends and close a week later." } as Fail;
  const them = view.people.find((p) => p.userId === toId);
  if (!them) return { error: 403, message: "You can pick people who were there." } as Fail;
  if (kind === "love" && !them.canLove) return { error: 403, message: "Love is only for two people who are both here for it." } as Fail;
  if (kind === "friends" && !them.canFriends) return { error: 403, message: "Friends is only for two people both here for friends." } as Fail;

  if (!kind) {
    await db.delete(eventClicks).where(and(eq(eventClicks.eventId, e.id), eq(eventClicks.fromId, fromId), eq(eventClicks.toId, toId)));
    return { status: "removed" as const };
  }
  await db.insert(eventClicks).values({ eventId: e.id, fromId, toId, kind })
    .onConflictDoUpdate({ target: [eventClicks.eventId, eventClicks.fromId, eventClicks.toId], set: { kind } });
  const [back] = await db.select().from(eventClicks)
    .where(and(eq(eventClicks.eventId, e.id), eq(eventClicks.fromId, toId), eq(eventClicks.toId, fromId)));
  if (!back) return { status: "picked" as const };

  // Love only when both said love; otherwise friends, if both are here for it.
  const both: ClickKind = kind === "love" && back.kind === "love" ? "love" : "friends";
  if (both === "friends" && !them.canFriends) return { status: "picked" as const };
  const note = `You both met at ${dayName(e.startsAt)}'s ${e.title}`;
  const made = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${[fromId, toId].sort().join(":")}))`);
    const [existing] = await tx.select({ id: matches.id, status: matches.status, kind: matches.kind }).from(matches).where(
      or(and(eq(matches.user1Id, fromId), eq(matches.user2Id, toId)), and(eq(matches.user1Id, toId), eq(matches.user2Id, fromId))),
    );
    if (existing?.status === "matched") {
      // Friends already, and now both said more: the same chat becomes a match.
      if (existing.kind === "friends" && both === "love") {
        await tx.update(matches).set({ kind: "love", originNote: note }).where(eq(matches.id, existing.id));
        return { id: existing.id, fresh: true };
      }
      return { id: existing.id, fresh: false };
    }
    if (existing) {
      await tx.update(matches).set({ status: "matched", kind: both, originNote: note }).where(eq(matches.id, existing.id));
      return { id: existing.id, fresh: true };
    }
    const [m] = await tx.insert(matches).values({ user1Id: toId, user2Id: fromId, status: "matched", kind: both, originNote: note }).returning({ id: matches.id });
    return { id: m.id, fresh: true };
  });
  if (made.fresh) {
    const ppl = await cards([fromId, toId]);
    for (const [to, other] of [[fromId, toId], [toId, fromId]] as const) {
      notify(to, "events", {
        type: both === "love" ? "match" : "friend",
        title: both === "love" ? `You and ${ppl.get(other)?.name ?? "someone"} clicked` : `You and ${ppl.get(other)?.name ?? "someone"} want to meet again`,
        body: `${note}. Say hi.`,
        url: `/chat/${made.id}`,
        tag: `event-click-${e.id}`,
      }).catch(() => {});
    }
  }
  return { status: "mutual" as const, kind: both, matchId: made.id };
}

/** Hourly: once an event ends, ask the people who were there. */
export async function runClicksSweep(now = new Date()): Promise<number> {
  const due = await db.select().from(events).where(and(
    eq(events.status, "published"), isNull(events.clicksAskedAt),
    sql`${events.startsAt} <= ${now}`, sql`${events.startsAt} >= ${new Date(now.getTime() - 3 * 24 * 3600e3)}`,
  ));
  let asked = 0;
  for (const e of due) {
    if (eventEnd(e) > now) continue;
    const [claimed] = await db.update(events).set({ clicksAskedAt: now })
      .where(and(eq(events.id, e.id), isNull(events.clicksAskedAt))).returning({ id: events.id });
    if (!claimed) continue;
    const there = Array.from(await wasThere(e));
    if (there.length < 2) continue;
    for (const userId of there) {
      notify(userId, "events", {
        type: "event_clicks",
        title: "Who did you click with?",
        body: `From ${e.title}. Pick privately: if they pick you too, you'll get a chat.`,
        url: `/events/${e.id}#clicks`,
        tag: `event-clicks-${e.id}`,
      }).catch(() => {});
      asked++;
    }
  }
  return asked;
}

let sweepTimer: NodeJS.Timeout | null = null;
export function startClicksSweep(): void {
  if (sweepTimer) return;
  const run = () => runClicksSweep().catch((e) => console.error("[event-clicks]", e));
  setTimeout(run, 30_000);
  sweepTimer = setInterval(run, 60 * 60 * 1000);
}

export function registerEventDoorRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  const wrap = (fn: (req: Request, res: any, userId: string, e: Event) => Promise<unknown>) => async (req: Request, res: any) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const e = await eventOf(Number(req.params.id));
      if (!e) return res.status(404).json({ message: "No such event." });
      await fn(req, res, userId, e);
    } catch (err) { console.error("[event-door]", err); if (!res.headersSent) res.status(500).json({ message: "Something went wrong" }); }
  };
  const send = (res: any, out: any) => ("error" in out ? res.status(out.error).json({ message: out.message }) : res.json(out));

  app.get("/api/events/:id/door/pass", wrap(async (req, res, userId, e) => send(res, await doorPass(e, userId, publicOrigin(req)))));
  app.get("/api/events/:id/door", wrap(async (_req, res, userId, e) => {
    if (e.hostUserId !== userId) return res.status(403).json({ message: "The door list is the host's." });
    res.json(await doorList(e));
  }));
  app.post("/api/events/:id/door/checkin", wrap(async (req, res, userId, e) => send(res, await checkIn(e, userId, req.body ?? {}))));
  app.get("/api/events/:id/clicks", wrap(async (_req, res, userId, e) => res.json(await eventClicksFor(e, userId))));
  app.post("/api/events/:id/clicks/:userId", wrap(async (req, res, userId, e) => {
    const k = req.body?.kind;
    const kind = k === "love" || k === "friends" ? k : null;
    send(res, await pickClick(e, userId, String(req.params.userId), kind));
  }));
}

