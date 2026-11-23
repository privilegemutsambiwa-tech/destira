// Friend circles (docs/destira-3-upgrade-prompt.md Part O3).
//   GET    /api/circles                    my circles and invites waiting for me
//   POST   /api/circles                    { name, inviteIds?, fromTableId? }
//   GET    /api/circles/candidates         people I could invite (?circleId=)
//   GET    /api/circles/:id                members, plans, album
//   POST   /api/circles/:id/invite         { userIds }
//   POST   /api/circles/:id/leave
//   POST   /api/circles/invites/:id        { accept }
//   POST   /api/circles/:id/plans          { title, startsAt, place }
//   DELETE /api/circles/plans/:planId      the author calls it off
//   POST   /api/circles/plans/:planId/in   { in }
// A circle's chat, polls and photos are its hidden invite-only `groups` row,
// opened at /lounge/group/:groupId. Invitations only go to people the
// inviter has actually met through Destira: a match (love or friends), a
// shared Sunday Table, or the same event.
import type { Express, Request } from "express";
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  circleInvites, circlePlanIns, circlePlans, circles, eventAttendees, events, groupMembers, groupMessages, groups,
  matches, profiles, sundayTables, tableSignups, type Circle,
} from "@shared/schema";
import {
  CIRCLE_MAX, CIRCLE_NAME_MAX, CIRCLES_PER_MEMBER, PLAN_PLACE_MAX, PLAN_TITLE_MAX,
  type CircleDetail, type CirclePerson, type CirclesMe,
} from "@shared/circles";
import { storage } from "../storage";
import { notify } from "../push";

// ── people ─────────────────────────────────────────────────────────────

async function people(ids: string[]): Promise<Map<string, CirclePerson>> {
  const uniq = Array.from(new Set(ids));
  if (!uniq.length) return new Map();
  const ps = await db.select({
    userId: profiles.userId, displayName: profiles.displayName, isPublic: profiles.isPublic, coverPhotoUrl: profiles.coverPhotoUrl,
  }).from(profiles).where(inArray(profiles.userId, uniq));
  const photos = await storage.resolveProfilePhotos(ps.map((p) => ({ userId: p.userId, isPublic: p.isPublic, coverPhotoUrl: p.coverPhotoUrl ?? null, profileImageUrl: null })));
  return new Map(ps.map((p) => [p.userId, {
    userId: p.userId,
    name: (p.displayName || "Someone").split(/\s+/)[0],
    photoUrl: photos.get(p.userId) ?? p.coverPhotoUrl ?? null,
  }]));
}
const personOr = (m: Map<string, CirclePerson>, id: string): CirclePerson => m.get(id) ?? { userId: id, name: "Someone", photoUrl: null };

/** Everyone this member has really met through Destira, minus blocks. */
export async function connections(userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const ms = await db.select({ a: matches.user1Id, b: matches.user2Id }).from(matches)
    .where(and(eq(matches.status, "matched"), or(eq(matches.user1Id, userId), eq(matches.user2Id, userId))));
  for (const m of ms) out.add(m.a === userId ? m.b : m.a);

  const myTables = await db.select({ tableId: tableSignups.tableId }).from(tableSignups)
    .where(and(eq(tableSignups.userId, userId), eq(tableSignups.status, "seated")));
  const tids = myTables.map((t) => t.tableId!).filter(Boolean);
  if (tids.length) {
    // Only tables whose lunch has started: you've met by then.
    const met = await db.select({ id: sundayTables.id }).from(sundayTables).where(and(inArray(sundayTables.id, tids), sql`${sundayTables.startsAt} <= now()`));
    if (met.length) {
      const mates = await db.select({ userId: tableSignups.userId }).from(tableSignups).where(inArray(tableSignups.tableId, met.map((t) => t.id)));
      for (const r of mates) out.add(r.userId);
    }
  }

  const myEvents = await db.select({ eventId: eventAttendees.eventId }).from(eventAttendees)
    .where(and(eq(eventAttendees.userId, userId), eq(eventAttendees.status, "going")));
  const hosted = await db.select({ id: events.id }).from(events).where(eq(events.hostUserId, userId));
  const eids = Array.from(new Set([...myEvents.map((e) => e.eventId), ...hosted.map((e) => e.id)]));
  if (eids.length) {
    const past = await db.select({ id: events.id, host: events.hostUserId }).from(events).where(and(inArray(events.id, eids), sql`${events.startsAt} <= now()`));
    if (past.length) {
      for (const e of past) out.add(e.host);
      const goers = await db.select({ userId: eventAttendees.userId }).from(eventAttendees)
        .where(and(inArray(eventAttendees.eventId, past.map((e) => e.id)), eq(eventAttendees.status, "going")));
      for (const r of goers) out.add(r.userId);
    }
  }
  out.delete(userId);
  for (const id of Array.from(out)) {
    if ((await storage.isBlocked(userId, id)) || (await storage.isBlocked(id, userId))) out.delete(id);
  }
  return out;
}

// ── reading ────────────────────────────────────────────────────────────

async function circleOf(id: number): Promise<Circle | undefined> {
  const [c] = await db.select().from(circles).where(eq(circles.id, id));
  return c;
}
async function memberIds(c: Circle): Promise<string[]> {
  return (await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, c.groupId))).map((r) => r.userId);
}
async function pendingIds(circleId: number): Promise<string[]> {
  return (await db.select({ toId: circleInvites.toId }).from(circleInvites)
    .where(and(eq(circleInvites.circleId, circleId), eq(circleInvites.status, "pending")))).map((r) => r.toId);
}
async function myCircleCount(userId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(groupMembers)
    .innerJoin(circles, eq(circles.groupId, groupMembers.groupId)).where(eq(groupMembers.userId, userId));
  return Number(r?.n ?? 0);
}

export async function circlesMe(userId: string): Promise<CirclesMe> {
  const mine = await db.select({ c: circles }).from(circles)
    .innerJoin(groupMembers, and(eq(groupMembers.groupId, circles.groupId), eq(groupMembers.userId, userId)))
    .orderBy(desc(circles.createdAt));
  const ids = mine.map((r) => r.c.id);
  const members = mine.length
    ? await db.select({ groupId: groupMembers.groupId, userId: groupMembers.userId }).from(groupMembers).where(inArray(groupMembers.groupId, mine.map((r) => r.c.groupId)))
    : [];
  const plans = ids.length
    ? await db.select().from(circlePlans).where(and(inArray(circlePlans.circleId, ids), isNull(circlePlans.cancelledAt), gt(circlePlans.startsAt, new Date()))).orderBy(asc(circlePlans.startsAt))
    : [];
  const invites = await db.select({ i: circleInvites, c: circles }).from(circleInvites)
    .innerJoin(circles, eq(circles.id, circleInvites.circleId))
    .where(and(eq(circleInvites.toId, userId), eq(circleInvites.status, "pending")))
    .orderBy(desc(circleInvites.createdAt));
  const inviteGroupSizes = invites.length
    ? await db.select({ groupId: groupMembers.groupId, n: sql<number>`count(*)` }).from(groupMembers).where(inArray(groupMembers.groupId, invites.map((r) => r.c.groupId))).groupBy(groupMembers.groupId)
    : [];
  const ppl = await people([...members.map((m) => m.userId), ...invites.map((r) => r.i.fromId)]);
  return {
    circles: mine.map(({ c }) => {
      const next = plans.find((p) => p.circleId === c.id);
      return {
        id: c.id,
        groupId: c.groupId,
        name: c.name,
        members: members.filter((m) => m.groupId === c.groupId).map((m) => personOr(ppl, m.userId)),
        nextPlan: next ? { title: next.title, startsAt: next.startsAt.toISOString() } : null,
      };
    }),
    invites: invites.map(({ i, c }) => ({
      id: i.id,
      circleId: c.id,
      circleName: c.name,
      from: personOr(ppl, i.fromId),
      members: Number(inviteGroupSizes.find((g) => g.groupId === c.groupId)?.n ?? 0),
    })),
  };
}

export async function circleDetail(c: Circle, viewerId: string): Promise<CircleDetail> {
  const ids = await memberIds(c);
  const pending = await pendingIds(c.id);
  const plans = await db.select().from(circlePlans)
    .where(and(eq(circlePlans.circleId, c.id), isNull(circlePlans.cancelledAt), gt(circlePlans.startsAt, sql`now() - interval '1 day'`)))
    .orderBy(asc(circlePlans.startsAt));
  const ins = plans.length ? await db.select().from(circlePlanIns).where(inArray(circlePlanIns.planId, plans.map((p) => p.id))) : [];
  const photos = await db.select({ id: groupMessages.id, url: groupMessages.mediaUrl, at: groupMessages.createdAt, by: groupMessages.userId })
    .from(groupMessages)
    .where(and(eq(groupMessages.groupId, c.groupId), eq(groupMessages.contentType, "image"), sql`${groupMessages.mediaUrl} is not null`,
      sql`coalesce(${groupMessages.deletedForEveryone}, false) = false`, sql`coalesce(${groupMessages.isDeletedByAdmin}, false) = false`))
    .orderBy(desc(groupMessages.createdAt)).limit(60);
  const ppl = await people([...ids, ...pending, ...plans.map((p) => p.authorId), ...photos.map((p) => p.by)]);
  return {
    id: c.id,
    groupId: c.groupId,
    name: c.name,
    source: c.source,
    members: ids.map((id) => personOr(ppl, id)),
    pending: pending.map((id) => personOr(ppl, id)),
    plans: plans.map((p) => {
      const these = ins.filter((x) => x.planId === p.id).map((x) => x.userId);
      return {
        id: p.id, title: p.title, startsAt: p.startsAt.toISOString(), place: p.place,
        author: personOr(ppl, p.authorId),
        ins: these.map((id) => personOr(ppl, id)),
        mine: p.authorId === viewerId,
        imIn: these.includes(viewerId),
      };
    }),
    album: photos.map((p) => ({ id: p.id, url: p.url!, at: (p.at ?? new Date()).toISOString(), by: personOr(ppl, p.by).name })),
    spaceLeft: Math.max(0, CIRCLE_MAX - ids.length - pending.length),
  };
}

// ── changing ───────────────────────────────────────────────────────────

type Fail = { error: number; message: string };
const fail = (error: number, message: string): Fail => ({ error, message });

async function nicknameFor(userId: string): Promise<string> {
  const p = await storage.getProfile(userId);
  return p?.groupNickname || (p?.displayName || "Friend").split(/\s+/)[0];
}

async function sendInvites(c: Circle, fromId: string, toIds: string[]): Promise<{ sent: string[] } | Fail> {
  const want = Array.from(new Set(toIds.filter((id) => id && id !== fromId)));
  if (!want.length) return { sent: [] };
  const known = await connections(fromId);
  const strangers = want.filter((id) => !known.has(id));
  if (strangers.length) return fail(403, "You can only invite people you've met through Destira: a match, your Sunday Table or an event.");
  const inNow = new Set(await memberIds(c));
  const already = new Set(await pendingIds(c.id));
  const fresh = want.filter((id) => !inNow.has(id) && !already.has(id));
  if (inNow.size + already.size + fresh.length > CIRCLE_MAX) return fail(409, `A circle holds ${CIRCLE_MAX} people, invitations included.`);
  const fromName = (await people([fromId])).get(fromId)?.name ?? "A friend";
  const sent: string[] = [];
  for (const toId of fresh) {
    const [row] = await db.insert(circleInvites).values({ circleId: c.id, fromId, toId, status: "pending" })
      .onConflictDoUpdate({ target: [circleInvites.circleId, circleInvites.toId], set: { status: "pending", fromId, createdAt: new Date() } })
      .returning({ id: circleInvites.id });
    if (!row) continue;
    sent.push(toId);
    notify(toId, "circles", {
      type: "circle", title: `${fromName} invited you to ${c.name}`, body: "A small circle of friends, with its own chat and plans.",
      url: "/circles", tag: `circle-${c.id}`,
    }).catch(() => {});
  }
  return { sent };
}

export async function createCircle(userId: string, body: { name?: unknown; inviteIds?: unknown; fromTableId?: unknown }): Promise<Circle | Fail> {
  const me = await storage.getProfile(userId);
  if (!me?.onboardingCompleted) return fail(403, "Finish your profile first.");
  if ((await myCircleCount(userId)) >= CIRCLES_PER_MEMBER) return fail(409, `You're in ${CIRCLES_PER_MEMBER} circles already. Leave one to start another.`);
  let inviteIds = Array.isArray(body.inviteIds) ? body.inviteIds.map(String) : [];
  let source = "invite";
  let sourceId: number | null = null;
  let name = typeof body.name === "string" ? body.name.trim().slice(0, CIRCLE_NAME_MAX) : "";

  if (body.fromTableId != null) {
    const tableId = Number(body.fromTableId);
    const [t] = await db.select().from(sundayTables).where(eq(sundayTables.id, tableId));
    const seats = t ? await db.select({ userId: tableSignups.userId }).from(tableSignups).where(eq(tableSignups.tableId, tableId)) : [];
    if (!t || !seats.some((s) => s.userId === userId)) return fail(403, "That isn't your table.");
    if (t.startsAt > new Date()) return fail(409, "After lunch: you'll want to have met first.");
    const [existing] = await db.select().from(circles).where(and(eq(circles.source, "table"), eq(circles.sourceId, tableId)));
    if (existing) return fail(409, "Your table already has a circle. Ask someone in it to invite you.");
    inviteIds = seats.map((s) => s.userId).filter((id) => id !== userId);
    source = "table";
    sourceId = tableId;
    if (!name) name = `Sunday Table · ${t.placeName}`.slice(0, CIRCLE_NAME_MAX);
  }
  if (!name) return fail(400, "Give your circle a name.");
  if (inviteIds.length + 1 > CIRCLE_MAX) return fail(409, `A circle holds ${CIRCLE_MAX} people.`);
  const known = await connections(userId);
  if (inviteIds.some((id) => !known.has(id))) return fail(403, "You can only invite people you've met through Destira: a match, your Sunday Table or an event.");

  const group = await storage.createGroupFull({
    name, description: "A friend circle on Destira.", type: "circle", ownerId: userId,
    privacyMode: "invite-only", isEventChat: true, inviteDirectJoinEnabled: false,
  });
  // Nobody adds people straight in: invitations only, and never past 8.
  await db.update(groups).set({ canMembersAddOthers: false, maxMembers: CIRCLE_MAX }).where(eq(groups.id, group.id));
  await storage.joinGroup(group.id, userId, await nicknameFor(userId));
  const [c] = await db.insert(circles).values({ groupId: group.id, name, createdBy: userId, source, sourceId }).returning();
  const sent = await sendInvites(c, userId, inviteIds);
  if ("error" in sent) return sent;
  return c;
}

export async function answerInvite(userId: string, inviteId: number, accept: boolean): Promise<{ circleId: number } | Fail> {
  const [inv] = await db.select().from(circleInvites).where(and(eq(circleInvites.id, inviteId), eq(circleInvites.toId, userId)));
  if (!inv || inv.status !== "pending") return fail(404, "That invitation has gone.");
  const c = await circleOf(inv.circleId);
  if (!c) return fail(404, "That circle has gone.");
  if (!accept) {
    await db.update(circleInvites).set({ status: "declined" }).where(eq(circleInvites.id, inviteId));
    return { circleId: c.id };
  }
  if ((await myCircleCount(userId)) >= CIRCLES_PER_MEMBER) return fail(409, `You're in ${CIRCLES_PER_MEMBER} circles already. Leave one to join this.`);
  // Read everything outside the transaction: nothing inside may use `db`.
  const nickname = await nicknameFor(userId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"circle:" + c.id}))`);
    const ids = (await tx.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, c.groupId))).map((r) => r.userId);
    if (!ids.includes(userId)) {
      if (ids.length >= CIRCLE_MAX) return fail(409, "That circle is full.");
      await tx.insert(groupMembers).values({ groupId: c.groupId, userId, nickname });
    }
    await tx.update(circleInvites).set({ status: "accepted" }).where(eq(circleInvites.id, inviteId));
    return { circleId: c.id };
  });
}

export async function leaveCircle(c: Circle, userId: string): Promise<void> {
  await storage.removeGroupMember(c.groupId, userId);
  await db.delete(circlePlanIns).where(and(eq(circlePlanIns.userId, userId),
    inArray(circlePlanIns.planId, db.select({ id: circlePlans.id }).from(circlePlans).where(eq(circlePlans.circleId, c.id)))));
}

export async function addPlan(c: Circle, userId: string, body: { title?: unknown; startsAt?: unknown; place?: unknown }) {
  const title = typeof body.title === "string" ? body.title.trim().slice(0, PLAN_TITLE_MAX) : "";
  const place = typeof body.place === "string" ? body.place.trim().slice(0, PLAN_PLACE_MAX) || null : null;
  const startsAt = new Date(String(body.startsAt ?? ""));
  if (!title) return fail(400, "What's the plan?");
  if (Number.isNaN(startsAt.getTime())) return fail(400, "When is it?");
  if (startsAt.getTime() < Date.now() - 5 * 60_000) return fail(400, "Plans are for the future.");
  if (startsAt.getTime() > Date.now() + 60 * 86_400_000) return fail(400, "Up to two months ahead.");
  const [plan] = await db.insert(circlePlans).values({ circleId: c.id, authorId: userId, title, startsAt, place }).returning();
  await db.insert(circlePlanIns).values({ planId: plan.id, userId }).onConflictDoNothing();
  const name = (await people([userId])).get(userId)?.name ?? "Someone";
  const when = startsAt.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Harare" });
  for (const id of await memberIds(c)) {
    if (id === userId) continue;
    notify(id, "circles", {
      type: "circle", title: `${c.name}: ${title}`, body: `${name} suggested ${when}${place ? ` at ${place}` : ""}. Are you in?`,
      url: `/circles/${c.id}`, tag: `circle-plan-${plan.id}`,
    }).catch(() => {});
  }
  return plan;
}

// ── routes ─────────────────────────────────────────────────────────────

export function registerCircleRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  const guard = async (req: Request, res: any): Promise<{ userId: string; c: Circle } | null> => {
    const userId = getUserId(req);
    if (!userId) { res.sendStatus(401); return null; }
    const c = await circleOf(Number(req.params.id));
    if (!c || !(await storage.isGroupMember(c.groupId, userId))) { res.status(404).json({ message: "No such circle." }); return null; }
    return { userId, c };
  };
  const send = (res: any, out: any, status = 200) => ("error" in out ? res.status(out.error).json({ message: out.message }) : res.status(status).json(out));
  const wrap = (fn: (req: Request, res: any) => Promise<unknown>) => async (req: Request, res: any) => {
    try { await fn(req, res); } catch (e) { console.error("[circles]", e); if (!res.headersSent) res.status(500).json({ message: "Something went wrong" }); }
  };

  app.get("/api/circles", wrap(async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    res.json(await circlesMe(userId));
  }));

  app.post("/api/circles", wrap(async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const out = await createCircle(userId, req.body ?? {});
    if ("error" in out) return send(res, out);
    res.status(201).json(await circleDetail(out, userId));
  }));

  app.get("/api/circles/candidates", wrap(async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const ids = Array.from(await connections(userId));
    let skip = new Set<string>();
    if (req.query.circleId) {
      const c = await circleOf(Number(req.query.circleId));
      if (c && (await storage.isGroupMember(c.groupId, userId))) skip = new Set([...(await memberIds(c)), ...(await pendingIds(c.id))]);
    }
    const ppl = await people(ids.filter((id) => !skip.has(id)));
    res.json(Array.from(ppl.values()).sort((a, b) => a.name.localeCompare(b.name)));
  }));

  app.post("/api/circles/invites/:inviteId", wrap(async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    send(res, await answerInvite(userId, Number(req.params.inviteId), req.body?.accept === true));
  }));

  app.post("/api/circles/plans/:planId/in", wrap(async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const [plan] = await db.select().from(circlePlans).where(eq(circlePlans.id, Number(req.params.planId)));
    const c = plan ? await circleOf(plan.circleId) : undefined;
    if (!plan || !c || plan.cancelledAt || !(await storage.isGroupMember(c.groupId, userId))) return res.status(404).json({ message: "No such plan." });
    if (req.body?.in === false) await db.delete(circlePlanIns).where(and(eq(circlePlanIns.planId, plan.id), eq(circlePlanIns.userId, userId)));
    else await db.insert(circlePlanIns).values({ planId: plan.id, userId }).onConflictDoNothing();
    res.json(await circleDetail(c, userId));
  }));

  app.delete("/api/circles/plans/:planId", wrap(async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const [plan] = await db.select().from(circlePlans).where(eq(circlePlans.id, Number(req.params.planId)));
    if (!plan || plan.authorId !== userId) return res.status(404).json({ message: "No such plan." });
    await db.update(circlePlans).set({ cancelledAt: new Date() }).where(eq(circlePlans.id, plan.id));
    res.json(await circleDetail((await circleOf(plan.circleId))!, userId));
  }));

  app.get("/api/circles/:id", wrap(async (req, res) => {
    const g = await guard(req, res);
    if (g) res.json(await circleDetail(g.c, g.userId));
  }));

  app.post("/api/circles/:id/invite", wrap(async (req, res) => {
    const g = await guard(req, res);
    if (!g) return;
    const out = await sendInvites(g.c, g.userId, Array.isArray(req.body?.userIds) ? req.body.userIds.map(String) : []);
    if ("error" in out) return send(res, out);
    res.json(await circleDetail(g.c, g.userId));
  }));

  app.post("/api/circles/:id/leave", wrap(async (req, res) => {
    const g = await guard(req, res);
    if (!g) return;
    await leaveCircle(g.c, g.userId);
    res.json({ ok: true });
  }));

  app.post("/api/circles/:id/plans", wrap(async (req, res) => {
    const g = await guard(req, res);
    if (!g) return;
    const out = await addPlan(g.c, g.userId, req.body ?? {});
    if ("error" in out) return send(res, out);
    res.status(201).json(await circleDetail(g.c, g.userId));
  }));
}
