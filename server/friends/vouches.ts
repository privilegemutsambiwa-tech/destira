// Vouches (docs/destira-3-upgrade-prompt.md Part O5).
//   GET    /api/vouches/me             what you've received and given, and who you could vouch for
//   GET    /api/vouches/for/:userId    the (at most 3) vouches someone chose to show
//   POST   /api/vouches                { toId, body } write or edit yours
//   DELETE /api/vouches/:id            the author takes it back
//   POST   /api/vouches/:id/status     { status: "shown" | "hidden" } the subject decides
// A vouch needs a real shared meeting: the same Sunday Table (after lunch),
// the same event (after it started) or the same circle. A dating match alone
// isn't meeting. Nothing shows until the subject picks it.
import type { Express, Request } from "express";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { circles, eventAttendees, events, groupMembers, profiles, sundayTables, tableSignups, vouches } from "@shared/schema";
import { VOUCHES_SHOWN_MAX, vouchProblem, type VouchPerson, type VouchPublic, type VouchStatus, type VouchView, type VouchesMe } from "@shared/vouches";
import { storage } from "../storage";
import { notify } from "../push";

async function people(ids: string[]): Promise<Map<string, VouchPerson>> {
  const uniq = Array.from(new Set(ids));
  if (!uniq.length) return new Map();
  const ps = await db.select({
    userId: profiles.userId, displayName: profiles.displayName, isPublic: profiles.isPublic, coverPhotoUrl: profiles.coverPhotoUrl,
  }).from(profiles).where(inArray(profiles.userId, uniq));
  const photos = await storage.resolveProfilePhotos(ps.map((p) => ({ userId: p.userId, isPublic: p.isPublic, coverPhotoUrl: p.coverPhotoUrl ?? null, profileImageUrl: null })));
  return new Map(ps.map((p) => [p.userId, { userId: p.userId, name: (p.displayName || "Someone").split(/\s+/)[0], photoUrl: photos.get(p.userId) ?? p.coverPhotoUrl ?? null }]));
}
const personOr = (m: Map<string, VouchPerson>, id: string): VouchPerson => m.get(id) ?? { userId: id, name: "Someone", photoUrl: null };

/**
 * Everyone this member has met in person through Destira, with how. The
 * first reason found wins: a table, then an event, then a circle.
 */
export async function metPeople(userId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const add = (id: string, label: string) => { if (id !== userId && !out.has(id)) out.set(id, label); };

  const seats = await db.select({ tableId: tableSignups.tableId }).from(tableSignups)
    .where(and(eq(tableSignups.userId, userId), eq(tableSignups.status, "seated")));
  const tids = seats.map((s) => s.tableId!).filter(Boolean);
  if (tids.length) {
    const had = await db.select({ id: sundayTables.id, place: sundayTables.placeName }).from(sundayTables)
      .where(and(inArray(sundayTables.id, tids), sql`${sundayTables.startsAt} <= now()`));
    if (had.length) {
      const mates = await db.select({ userId: tableSignups.userId, tableId: tableSignups.tableId }).from(tableSignups)
        .where(and(inArray(tableSignups.tableId, had.map((t) => t.id)), eq(tableSignups.status, "seated")));
      for (const m of mates) add(m.userId, `Met at a Sunday Table at ${had.find((t) => t.id === m.tableId)?.place ?? "lunch"}`);
    }
  }

  const going = await db.select({ eventId: eventAttendees.eventId }).from(eventAttendees)
    .where(and(eq(eventAttendees.userId, userId), eq(eventAttendees.status, "going")));
  const hosted = await db.select({ id: events.id }).from(events).where(eq(events.hostUserId, userId));
  const eids = Array.from(new Set([...going.map((g) => g.eventId), ...hosted.map((h) => h.id)]));
  if (eids.length) {
    const past = await db.select({ id: events.id, title: events.title, host: events.hostUserId }).from(events)
      .where(and(inArray(events.id, eids), sql`${events.startsAt} <= now()`));
    if (past.length) {
      const others = await db.select({ userId: eventAttendees.userId, eventId: eventAttendees.eventId }).from(eventAttendees)
        .where(and(inArray(eventAttendees.eventId, past.map((e) => e.id)), eq(eventAttendees.status, "going")));
      for (const e of past) add(e.host, `Met at ${e.title}`);
      for (const o of others) add(o.userId, `Met at ${past.find((e) => e.id === o.eventId)?.title ?? "an event"}`);
    }
  }

  const myCircles = await db.select({ groupId: circles.groupId }).from(circles)
    .innerJoin(groupMembers, and(eq(groupMembers.groupId, circles.groupId), eq(groupMembers.userId, userId)));
  if (myCircles.length) {
    const fellow = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(inArray(groupMembers.groupId, myCircles.map((c) => c.groupId)));
    for (const f of fellow) add(f.userId, "In a friend circle together");
  }

  for (const id of Array.from(out.keys())) {
    if ((await storage.isBlocked(userId, id)) || (await storage.isBlocked(id, userId))) out.delete(id);
  }
  return out;
}

const view = (v: typeof vouches.$inferSelect, person: VouchPerson): VouchView => ({
  id: v.id, person, body: v.body, metLabel: v.metLabel, status: v.status as VouchStatus, createdAt: v.createdAt.toISOString(),
});

export async function vouchesMe(userId: string): Promise<VouchesMe> {
  const [received, given, met] = await Promise.all([
    db.select().from(vouches).where(eq(vouches.toId, userId)).orderBy(desc(vouches.createdAt)),
    db.select().from(vouches).where(eq(vouches.fromId, userId)).orderBy(desc(vouches.createdAt)),
    metPeople(userId),
  ]);
  const ppl = await people([...received.map((v) => v.fromId), ...given.map((v) => v.toId), ...Array.from(met.keys())]);
  const done = new Set(given.map((v) => v.toId));
  return {
    received: received.map((v) => view(v, personOr(ppl, v.fromId))),
    given: given.map((v) => view(v, personOr(ppl, v.toId))),
    canVouch: Array.from(met.entries()).filter(([id]) => !done.has(id)).map(([id, metLabel]) => ({ person: personOr(ppl, id), metLabel }))
      .sort((a, b) => a.person.name.localeCompare(b.person.name)),
  };
}

export async function shownFor(userId: string, viewerId: string): Promise<VouchPublic[]> {
  if (viewerId !== userId && ((await storage.isBlocked(viewerId, userId)) || (await storage.isBlocked(userId, viewerId)))) return [];
  const rows = await db.select({ v: vouches }).from(vouches)
    .innerJoin(profiles, eq(profiles.userId, vouches.fromId))
    .where(and(eq(vouches.toId, userId), eq(vouches.status, "shown"), eq(profiles.moderationStatus, "active")))
    .orderBy(desc(vouches.updatedAt)).limit(VOUCHES_SHOWN_MAX);
  const ppl = await people(rows.map((r) => r.v.fromId));
  return rows.map(({ v }) => ({ id: v.id, from: personOr(ppl, v.fromId), body: v.body, metLabel: v.metLabel }));
}

type Fail = { error: number; message: string };

export async function writeVouch(fromId: string, toId: string, raw: unknown): Promise<VouchView | Fail> {
  const body = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  const problem = vouchProblem(body);
  if (problem) return { error: 400, message: problem };
  if (fromId === toId) return { error: 400, message: "You can't vouch for yourself." };
  const label = (await metPeople(fromId)).get(toId);
  if (!label) return { error: 403, message: "You can vouch for people you've met through Destira: your Sunday Table, an event or a circle." };
  const [existing] = await db.select().from(vouches).where(and(eq(vouches.fromId, fromId), eq(vouches.toId, toId)));
  let row;
  if (existing) {
    // An edit goes back to them to choose again.
    [row] = await db.update(vouches).set({ body, metLabel: label, status: existing.body === body ? existing.status : "pending", updatedAt: new Date() })
      .where(eq(vouches.id, existing.id)).returning();
  } else {
    [row] = await db.insert(vouches).values({ fromId, toId, body, metLabel: label, status: "pending" }).returning();
    const name = (await people([fromId])).get(fromId)?.name ?? "A friend";
    notify(toId, "vouches", {
      type: "vouch", title: `${name} vouched for you`, body: "Read it, and choose whether it shows on your profile.", url: "/vouches", tag: `vouch-${row.id}`,
    }).catch(() => {});
  }
  return view(row, (await people([toId])).get(toId)!);
}

export async function setStatus(userId: string, id: number, status: string): Promise<{ ok: true } | Fail> {
  if (status !== "shown" && status !== "hidden") return { error: 400, message: "Show or hide." };
  const [v] = await db.select().from(vouches).where(and(eq(vouches.id, id), eq(vouches.toId, userId)));
  if (!v) return { error: 404, message: "No such vouch." };
  if (status === "shown" && v.status !== "shown") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(vouches)
      .where(and(eq(vouches.toId, userId), eq(vouches.status, "shown"), ne(vouches.id, id)));
    if (Number(n) >= VOUCHES_SHOWN_MAX) return { error: 409, message: `Up to ${VOUCHES_SHOWN_MAX} show at a time. Hide one first.` };
  }
  await db.update(vouches).set({ status, updatedAt: new Date() }).where(eq(vouches.id, id));
  return { ok: true };
}

export function registerVouchRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  const wrap = (fn: (req: Request, res: any, userId: string) => Promise<unknown>) => async (req: Request, res: any) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try { await fn(req, res, userId); } catch (e) { console.error("[vouches]", e); if (!res.headersSent) res.status(500).json({ message: "Something went wrong" }); }
  };
  const send = (res: any, out: any, ok = 200) => ("error" in out ? res.status(out.error).json({ message: out.message }) : res.status(ok).json(out));

  app.get("/api/vouches/me", wrap(async (_req, res, userId) => res.json(await vouchesMe(userId))));
  app.get("/api/vouches/for/:userId", wrap(async (req, res, userId) => res.json(await shownFor(String(req.params.userId), userId))));
  app.post("/api/vouches", wrap(async (req, res, userId) => send(res, await writeVouch(userId, String(req.body?.toId ?? ""), req.body?.body), 201)));
  app.delete("/api/vouches/:id", wrap(async (req, res, userId) => {
    await db.delete(vouches).where(and(eq(vouches.id, Number(req.params.id)), eq(vouches.fromId, userId)));
    res.json({ ok: true });
  }));
  app.post("/api/vouches/:id/status", wrap(async (req, res, userId) => send(res, await setStatus(userId, Number(req.params.id), String(req.body?.status)))));
}
