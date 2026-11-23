// Plans board, "Who's in?" (docs/destira-3-upgrade-prompt.md Part O4).
//   GET    /api/board                         mine, the ones I asked to join, and the week's open plans
//   GET    /api/board/places?q=               public places a plan can be at
//   POST   /api/board                         { title, startsAt, placeId, seats, who }
//   DELETE /api/board/:id                     the host calls it off
//   POST   /api/board/:id/in                  ask to join
//   DELETE /api/board/:id/in                  never mind
//   POST   /api/board/:id/requests/:userId    { approve } the host decides
// Safety (Part B): only public places from `places` (never a typed address),
// the host chooses who comes, single-gender plans are only for that gender,
// blocks hide plans both ways, and reporting is two taps on the client.
import type { Express, Request } from "express";
import { and, asc, eq, gt, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { boardPlanRequests, boardPlans, groups, places, profiles, type BoardPlan } from "@shared/schema";
import {
  BOARD_DAYS, BOARD_HOSTING_MAX, BOARD_MIN_LEAD_MIN, BOARD_PLACE_TYPES, BOARD_SEATS_MAX, BOARD_TITLE_MAX, BOARD_WHO_VALUES,
  type BoardMe, type BoardPerson, type BoardPlace, type BoardPlanView, type BoardRequestStatus, type BoardWho,
} from "@shared/board";
import { ageFromDob } from "@shared/essentials";
import { storage } from "../storage";
import { notify } from "../push";

type Fail = { error: number; message: string };
const fail = (error: number, message: string): Fail => ({ error, message });

// ── places ─────────────────────────────────────────────────────────────

/** Seeded or admin-verified public places only: never a member's "I'm at…". */
const publicPlace = and(
  inArray(places.placeType, [...BOARD_PLACE_TYPES]),
  or(isNull(places.createdByUserId), isNotNull(places.verifiedAt)),
);
const placeView = (p: { id: number; name: string; suburb: string; city: string }): BoardPlace => ({
  id: p.id, name: p.name,
  detail: p.suburb === "CBD" ? `${p.city} CBD` : p.suburb.trim().toLowerCase() === p.city.trim().toLowerCase() ? p.city : `${p.suburb}, ${p.city}`,
});

/** Matching public places, the member's own suburb and city first. */
export async function searchPlaces(q: string, userId: string): Promise<BoardPlace[]> {
  const like = `%${q.trim()}%`;
  const me = await storage.getProfile(userId);
  const parts = (me?.location || me?.locationName || "").split(",").map((x) => x.trim()).filter(Boolean);
  const area = parts[0] ?? "";
  const city = parts.length > 1 ? parts[parts.length - 1] : area;
  const rows = await db.select().from(places)
    .where(q.trim() ? and(publicPlace, or(ilike(places.name, like), ilike(places.suburb, like))) : publicPlace)
    .orderBy(
      sql`case when lower(${places.suburb}) = lower(${area}) then 0 when lower(${places.city}) = lower(${city}) then 1 else 2 end`,
      asc(places.name),
    ).limit(12);
  return rows.map(placeView);
}

// ── reading ────────────────────────────────────────────────────────────

async function people(ids: string[]): Promise<Map<string, BoardPerson>> {
  const uniq = Array.from(new Set(ids));
  if (!uniq.length) return new Map();
  const ps = await db.select({
    userId: profiles.userId, displayName: profiles.displayName, age: profiles.age, dateOfBirth: profiles.dateOfBirth,
    isPublic: profiles.isPublic, coverPhotoUrl: profiles.coverPhotoUrl, isVerified: profiles.isVerified,
  }).from(profiles).where(inArray(profiles.userId, uniq));
  const photos = await storage.resolveProfilePhotos(ps.map((p) => ({ userId: p.userId, isPublic: p.isPublic, coverPhotoUrl: p.coverPhotoUrl ?? null, profileImageUrl: null })));
  return new Map(ps.map((p) => [p.userId, {
    userId: p.userId,
    name: (p.displayName || "Someone").split(/\s+/)[0],
    age: (p.dateOfBirth ? ageFromDob(p.dateOfBirth) : null) ?? p.age ?? null,
    photoUrl: photos.get(p.userId) ?? p.coverPhotoUrl ?? null,
    isVerified: !!p.isVerified,
  }]));
}
const personOr = (m: Map<string, BoardPerson>, id: string): BoardPerson =>
  m.get(id) ?? { userId: id, name: "Someone", age: null, photoUrl: null, isVerified: false };

async function views(plans: BoardPlan[], viewerId: string): Promise<BoardPlanView[]> {
  if (!plans.length) return [];
  const ids = plans.map((p) => p.id);
  const [reqs, pls] = await Promise.all([
    db.select().from(boardPlanRequests).where(inArray(boardPlanRequests.planId, ids)),
    db.select().from(places).where(inArray(places.id, Array.from(new Set(plans.map((p) => p.placeId))))),
  ]);
  const ppl = await people([...plans.map((p) => p.hostId), ...reqs.map((r) => r.userId)]);
  return plans.map((p) => {
    const mine = reqs.filter((r) => r.planId === p.id);
    const approved = mine.filter((r) => r.status === "approved");
    const me = mine.find((r) => r.userId === viewerId);
    const isMine = p.hostId === viewerId;
    const inside = isMine || me?.status === "approved";
    const place = pls.find((x) => x.id === p.placeId);
    return {
      id: p.id,
      title: p.title,
      startsAt: p.startsAt.toISOString(),
      place: place ? placeView(place) : { id: p.placeId, name: "A public place", detail: "" },
      seats: p.seats,
      taken: approved.length,
      who: p.who as BoardWho,
      host: personOr(ppl, p.hostId),
      isMine,
      myStatus: (me?.status as BoardRequestStatus) ?? null,
      chatGroupId: inside ? p.chatGroupId : null,
      // Who's coming is for the people coming (and the host).
      going: inside ? approved.map((r) => personOr(ppl, r.userId)) : [],
      requests: isMine ? mine.map((r) => ({ person: personOr(ppl, r.userId), status: r.status as BoardRequestStatus })) : [],
    };
  });
}

/** Can this viewer see (and ask to join) this plan? */
async function visibleTo(p: BoardPlan, viewer: { userId: string; gender: string | null }): Promise<boolean> {
  if (p.hostId === viewer.userId) return true;
  if (p.who === "women" && viewer.gender !== "woman") return false;
  if (p.who === "men" && viewer.gender !== "man") return false;
  return !(await storage.isBlocked(viewer.userId, p.hostId)) && !(await storage.isBlocked(p.hostId, viewer.userId));
}

const upcoming = () => and(isNull(boardPlans.cancelledAt), gt(boardPlans.startsAt, new Date()));

export async function boardMe(userId: string): Promise<BoardMe> {
  const me = await storage.getProfile(userId);
  const viewer = { userId, gender: me?.gender ?? null };
  const mine = await db.select().from(boardPlans).where(and(eq(boardPlans.hostId, userId), upcoming())).orderBy(asc(boardPlans.startsAt));
  const askedIds = (await db.select({ planId: boardPlanRequests.planId }).from(boardPlanRequests).where(eq(boardPlanRequests.userId, userId))).map((r) => r.planId);
  const asked = askedIds.length
    ? await db.select().from(boardPlans).where(and(inArray(boardPlans.id, askedIds), upcoming())).orderBy(asc(boardPlans.startsAt))
    : [];
  const weekOut = new Date(Date.now() + BOARD_DAYS * 86_400_000);
  const all = await db.select({ p: boardPlans }).from(boardPlans)
    .innerJoin(profiles, eq(profiles.userId, boardPlans.hostId))
    .where(and(upcoming(), lt(boardPlans.startsAt, weekOut), sql`${boardPlans.hostId} <> ${userId}`, eq(profiles.moderationStatus, "active")))
    .orderBy(asc(boardPlans.startsAt)).limit(120);
  const open: BoardPlan[] = [];
  for (const { p } of all) {
    if (askedIds.includes(p.id)) continue;
    if (await visibleTo(p, viewer)) open.push(p);
  }
  // Plans near you first within each day.
  const myArea = ((me?.locationName || me?.location || "").split(",")[0] || "").trim().toLowerCase();
  const pv = await views(open, userId);
  if (myArea) {
    const day = (iso: string) => new Date(new Date(iso).getTime() + 2 * 3600_000).toISOString().slice(0, 10);
    pv.sort((a, b) => day(a.startsAt).localeCompare(day(b.startsAt))
      || Number(!a.place.detail.toLowerCase().startsWith(myArea)) - Number(!b.place.detail.toLowerCase().startsWith(myArea))
      || a.startsAt.localeCompare(b.startsAt));
  }
  return { mine: await views(mine, userId), asked: await views(asked, userId), open: pv, canHost: mine.length < BOARD_HOSTING_MAX };
}

// ── changing ───────────────────────────────────────────────────────────

async function firstName(userId: string) {
  return (await people([userId])).get(userId)?.name ?? "Someone";
}
const when = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Harare" });

export async function postPlan(userId: string, body: Record<string, unknown>): Promise<BoardPlan | Fail> {
  const me = await storage.getProfile(userId);
  if (!me?.onboardingCompleted) return fail(403, "Finish your profile first.");
  if (me.moderationStatus !== "active") return fail(403, "Your account can't post plans right now.");
  const title = typeof body.title === "string" ? body.title.trim().replace(/\s+/g, " ").slice(0, BOARD_TITLE_MAX) : "";
  if (title.length < 3) return fail(400, "Say what the plan is.");
  const startsAt = new Date(String(body.startsAt ?? ""));
  if (Number.isNaN(startsAt.getTime())) return fail(400, "When is it?");
  if (startsAt.getTime() < Date.now() + BOARD_MIN_LEAD_MIN * 60_000) return fail(400, `At least ${BOARD_MIN_LEAD_MIN} minutes from now, so people can ask.`);
  if (startsAt.getTime() > Date.now() + BOARD_DAYS * 86_400_000) return fail(400, "The board is for the next 7 days.");
  const seats = Math.floor(Number(body.seats));
  if (!(seats >= 1 && seats <= BOARD_SEATS_MAX)) return fail(400, `Between 1 and ${BOARD_SEATS_MAX} seats.`);
  const who = String(body.who ?? "anyone");
  if (!BOARD_WHO_VALUES.includes(who)) return fail(400, "Anyone, women only or men only.");
  if (who === "women" && me.gender !== "woman") return fail(400, "Women-only plans are for women to post.");
  if (who === "men" && me.gender !== "man") return fail(400, "Men-only plans are for men to post.");
  const [place] = await db.select().from(places).where(and(eq(places.id, Number(body.placeId)), publicPlace));
  if (!place) return fail(400, "Pick a public place from the list.");
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(boardPlans).where(and(eq(boardPlans.hostId, userId), upcoming()));
  if (Number(n) >= BOARD_HOSTING_MAX) return fail(409, `You have ${BOARD_HOSTING_MAX} plans up already. Let one happen first.`);
  const [plan] = await db.insert(boardPlans).values({ hostId: userId, title, startsAt, placeId: place.id, seats, who }).returning();
  return plan;
}

async function planFor(id: number): Promise<BoardPlan | undefined> {
  const [p] = await db.select().from(boardPlans).where(eq(boardPlans.id, id));
  return p;
}

export async function askToJoin(planId: number, userId: string): Promise<{ status: BoardRequestStatus } | Fail> {
  const p = await planFor(planId);
  const me = await storage.getProfile(userId);
  if (!p || p.cancelledAt || p.startsAt <= new Date() || !me || !(await visibleTo(p, { userId, gender: me.gender }))) return fail(404, "That plan isn't open.");
  if (p.hostId === userId) return fail(400, "It's your plan.");
  if (!me.onboardingCompleted) return fail(403, "Finish your profile first.");
  const [existing] = await db.select().from(boardPlanRequests).where(and(eq(boardPlanRequests.planId, planId), eq(boardPlanRequests.userId, userId)));
  if (existing) return { status: existing.status as BoardRequestStatus };
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(boardPlanRequests).where(and(eq(boardPlanRequests.planId, planId), eq(boardPlanRequests.status, "approved")));
  if (Number(n) >= p.seats) return fail(409, "That plan is full.");
  await db.insert(boardPlanRequests).values({ planId, userId, status: "pending" }).onConflictDoNothing();
  notify(p.hostId, "board", {
    type: "board", title: `${await firstName(userId)} is in for "${p.title}"`, body: "Say yes or no on the plans board.",
    url: "/plans-board", tag: `board-${p.id}`,
  }).catch(() => {});
  return { status: "pending" };
}

export async function withdraw(planId: number, userId: string) {
  const p = await planFor(planId);
  if (!p) return;
  await db.delete(boardPlanRequests).where(and(eq(boardPlanRequests.planId, planId), eq(boardPlanRequests.userId, userId)));
  if (p.chatGroupId) await storage.removeGroupMember(p.chatGroupId, userId).catch(() => {});
}

async function ensureChat(p: BoardPlan, placeName: string): Promise<number> {
  if (p.chatGroupId) return p.chatGroupId;
  const group = await storage.createGroupFull({
    name: `${p.title}`.slice(0, 60),
    description: `${placeName}, ${when(p.startsAt)}. A plan from the plans board.`,
    type: "plan", ownerId: p.hostId, privacyMode: "invite-only", isEventChat: true, inviteDirectJoinEnabled: false,
  });
  await db.update(groups).set({ canMembersAddOthers: false, maxMembers: p.seats + 1 }).where(eq(groups.id, group.id));
  const host = await storage.getProfile(p.hostId);
  await storage.joinGroup(group.id, p.hostId, host?.groupNickname || (host?.displayName || "Host").split(/\s+/)[0]);
  await db.update(boardPlans).set({ chatGroupId: group.id }).where(eq(boardPlans.id, p.id));
  return group.id;
}

export async function decide(planId: number, hostId: string, userId: string, approve: boolean): Promise<BoardPlanView | Fail> {
  const p = await planFor(planId);
  if (!p || p.hostId !== hostId) return fail(404, "No such plan.");
  if (p.cancelledAt || p.startsAt <= new Date()) return fail(409, "That plan has passed.");
  const [r] = await db.select().from(boardPlanRequests).where(and(eq(boardPlanRequests.planId, planId), eq(boardPlanRequests.userId, userId)));
  if (!r) return fail(404, "They're not asking any more.");
  const [place] = await db.select().from(places).where(eq(places.id, p.placeId));
  if (approve && r.status !== "approved") {
    // Claim a seat atomically: the update only happens while seats remain.
    const claimed = await db.update(boardPlanRequests).set({ status: "approved", decidedAt: new Date() })
      .where(and(eq(boardPlanRequests.id, r.id),
        sql`(select count(*) from board_plan_requests x where x.plan_id = ${planId} and x.status = 'approved') < ${p.seats}`))
      .returning({ id: boardPlanRequests.id });
    if (!claimed.length) return fail(409, "No seats left. Add more by posting a new plan, or say no.");
    const groupId = await ensureChat(p, place?.name ?? "");
    if (!(await storage.isGroupMember(groupId, userId))) {
      const prof = await storage.getProfile(userId);
      await storage.joinGroup(groupId, userId, prof?.groupNickname || (prof?.displayName || "Guest").split(/\s+/)[0]);
    }
    notify(userId, "board", {
      type: "board", title: `You're in: ${p.title}`, body: `${place?.name ?? "A public place"}, ${when(p.startsAt)}. The plan's chat is open.`,
      url: "/plans-board", tag: `board-${p.id}`,
    }).catch(() => {});
  } else if (!approve) {
    await db.update(boardPlanRequests).set({ status: "declined", decidedAt: new Date() }).where(eq(boardPlanRequests.id, r.id));
    if (p.chatGroupId) await storage.removeGroupMember(p.chatGroupId, userId).catch(() => {});
    // A no is quiet: no push, it just shows on the board.
  }
  const [v] = await views([(await planFor(planId))!], hostId);
  return v;
}

export async function cancelPlan(planId: number, hostId: string): Promise<boolean> {
  const p = await planFor(planId);
  if (!p || p.hostId !== hostId || p.cancelledAt) return false;
  await db.update(boardPlans).set({ cancelledAt: new Date() }).where(eq(boardPlans.id, planId));
  const reqs = await db.select().from(boardPlanRequests).where(and(eq(boardPlanRequests.planId, planId), inArray(boardPlanRequests.status, ["pending", "approved"])));
  for (const r of reqs) {
    notify(r.userId, "board", {
      type: "board", title: `Called off: ${p.title}`, body: "The host can't make it any more.", url: "/plans-board", tag: `board-${p.id}`,
    }).catch(() => {});
  }
  return true;
}

// ── routes ─────────────────────────────────────────────────────────────

export function registerBoardRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  const wrap = (fn: (req: Request, res: any, userId: string) => Promise<unknown>) => async (req: Request, res: any) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try { await fn(req, res, userId); } catch (e) { console.error("[board]", e); if (!res.headersSent) res.status(500).json({ message: "Something went wrong" }); }
  };
  const send = (res: any, out: any, ok = 200) => ("error" in out ? res.status(out.error).json({ message: out.message }) : res.status(ok).json(out));

  app.get("/api/board", wrap(async (_req, res, userId) => res.json(await boardMe(userId))));
  app.get("/api/board/places", wrap(async (req, res, userId) => res.json(await searchPlaces(typeof req.query.q === "string" ? req.query.q : "", userId))));
  app.post("/api/board", wrap(async (req, res, userId) => {
    const out = await postPlan(userId, req.body ?? {});
    if ("error" in out) return send(res, out);
    res.status(201).json((await views([out], userId))[0]);
  }));
  app.delete("/api/board/:id", wrap(async (req, res, userId) => {
    if (!(await cancelPlan(Number(req.params.id), userId))) return res.status(404).json({ message: "No such plan." });
    res.json({ ok: true });
  }));
  app.post("/api/board/:id/in", wrap(async (req, res, userId) => send(res, await askToJoin(Number(req.params.id), userId))));
  app.delete("/api/board/:id/in", wrap(async (req, res, userId) => { await withdraw(Number(req.params.id), userId); res.json({ ok: true }); }));
  app.post("/api/board/:id/requests/:userId", wrap(async (req, res, userId) =>
    send(res, await decide(Number(req.params.id), userId, String(req.params.userId), req.body?.approve === true))));
}
