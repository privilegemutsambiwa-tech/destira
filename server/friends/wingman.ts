// Wingman (docs/destira-3-upgrade-prompt.md Part O6).
//   GET  /api/wingman/me                  suggestions friends sent you
//   GET  /api/wingman/for/:candidateId    on a profile: who suggested them to you, and who you could suggest them to
//   POST /api/wingman                     { toId, candidateId, note } suggest someone to a circle friend
//   POST /api/wingman/:id/dismiss         "Not for me", quietly
// Only between people in the same friend circle, only someone the friend
// could meet on the dating side (here for Love, each the other's type, no
// blocks, not already matched). The person suggested is never told.
import type { Express, Request } from "express";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { blockedUsers, circles, groupMembers, matches, profiles, wingmanSuggestions } from "@shared/schema";
import { ageFromDob } from "@shared/essentials";
import { wantsLove } from "@shared/friends";
import {
  WINGMAN_DAILY, wingmanNoteProblem,
  type WingmanCandidate, type WingmanForProfile, type WingmanMe, type WingmanPerson, type WingmanStatus,
} from "@shared/wingman";
import { genderMatchesSeeking, storage } from "../storage";
import { notify } from "../push";

type Fail = { error: number; message: string };
const DAY_MS = 24 * 3600e3;

const firstName = (n: string | null | undefined) => (n || "Someone").trim().split(/\s+/)[0] || "Someone";

async function cards(ids: string[]): Promise<Map<string, WingmanCandidate>> {
  const uniq = Array.from(new Set(ids));
  if (!uniq.length) return new Map();
  const ps = await db.select({
    userId: profiles.userId, displayName: profiles.displayName, age: profiles.age, dateOfBirth: profiles.dateOfBirth,
    locationName: profiles.locationName, location: profiles.location, isPublic: profiles.isPublic, coverPhotoUrl: profiles.coverPhotoUrl,
  }).from(profiles).where(inArray(profiles.userId, uniq));
  const photos = await storage.resolveProfilePhotos(ps.map((p) => ({ userId: p.userId, isPublic: p.isPublic, coverPhotoUrl: p.coverPhotoUrl ?? null, profileImageUrl: null })));
  return new Map(ps.map((p) => [p.userId, {
    userId: p.userId,
    name: firstName(p.displayName),
    photoUrl: photos.get(p.userId) ?? p.coverPhotoUrl ?? null,
    age: (p.dateOfBirth ? ageFromDob(p.dateOfBirth) : null) ?? p.age ?? null,
    area: (p.locationName || p.location || "").split(",")[0].trim() || null,
  }]));
}
const personOf = (m: Map<string, WingmanCandidate>, id: string): WingmanPerson => {
  const c = m.get(id);
  return { userId: id, name: c?.name ?? "Someone", photoUrl: c?.photoUrl ?? null };
};

/** Everyone in a friend circle with this member, with the circle's name. */
export async function circleFriends(userId: string): Promise<Map<string, string>> {
  const mine = await db.select({ groupId: circles.groupId, name: circles.name }).from(circles)
    .innerJoin(groupMembers, and(eq(groupMembers.groupId, circles.groupId), eq(groupMembers.userId, userId)));
  const out = new Map<string, string>();
  if (!mine.length) return out;
  const rows = await db.select({ userId: groupMembers.userId, groupId: groupMembers.groupId }).from(groupMembers)
    .where(inArray(groupMembers.groupId, mine.map((c) => c.groupId)));
  for (const r of rows) {
    if (r.userId !== userId && !out.has(r.userId)) out.set(r.userId, mine.find((c) => c.groupId === r.groupId)!.name);
  }
  return out;
}

async function blockedWith(userId: string): Promise<Set<string>> {
  const rows = await db.select({ a: blockedUsers.blockerId, b: blockedUsers.blockedId }).from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId)));
  return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
}

/**
 * Of these friends, the ones `candidateId` could be suggested to: both here
 * for Love and each the other's type, active, no blocks, not already matched.
 */
async function canReceive(friendIds: string[], candidateId: string): Promise<Set<string>> {
  const ids = friendIds.filter((f) => f !== candidateId);
  if (!ids.length) return new Set();
  const ps = await db.select({
    userId: profiles.userId, lookingFor: profiles.lookingFor, gender: profiles.gender,
    seekingGenders: profiles.seekingGenders, moderationStatus: profiles.moderationStatus,
  }).from(profiles).where(inArray(profiles.userId, [candidateId, ...ids]));
  const cand = ps.find((p) => p.userId === candidateId);
  if (!cand || cand.moderationStatus !== "active" || !wantsLove(cand.lookingFor)) return new Set();
  const seeks = (a: typeof ps[number], b: typeof ps[number]) =>
    (a.seekingGenders ?? []).includes("everyone") || genderMatchesSeeking(b.gender, a.seekingGenders ?? []);
  const blocked = await blockedWith(candidateId);
  const matched = await db.select({ a: matches.user1Id, b: matches.user2Id }).from(matches)
    .where(and(eq(matches.status, "matched"), eq(matches.kind, "love"),
      or(eq(matches.user1Id, candidateId), eq(matches.user2Id, candidateId))));
  const withCand = new Set(matched.map((m) => (m.a === candidateId ? m.b : m.a)));
  return new Set(ps.filter((f) =>
    f.userId !== candidateId && f.moderationStatus === "active" && wantsLove(f.lookingFor) &&
    seeks(f, cand) && seeks(cand, f) && !blocked.has(f.userId) && !withCand.has(f.userId),
  ).map((f) => f.userId));
}

async function sentToday(fromId: string): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(wingmanSuggestions)
    .where(and(eq(wingmanSuggestions.fromId, fromId), gte(wingmanSuggestions.createdAt, new Date(Date.now() - DAY_MS))));
  return Number(n);
}

export async function wingmanMe(userId: string): Promise<WingmanMe> {
  const rows = await db.select().from(wingmanSuggestions)
    .where(and(eq(wingmanSuggestions.toId, userId), inArray(wingmanSuggestions.status, ["pending", "seen"])))
    .orderBy(desc(wingmanSuggestions.createdAt)).limit(30);
  // Drop anyone who's since been blocked, left the dating side or matched with you.
  const ok = new Set<number>();
  for (const cid of Array.from(new Set(rows.map((r) => r.candidateId)))) {
    if ((await canReceive([userId], cid)).has(userId)) rows.filter((r) => r.candidateId === cid).forEach((r) => ok.add(r.id));
  }
  const blocked = await blockedWith(userId);
  const live = rows.filter((r) => ok.has(r.id) && !blocked.has(r.fromId));
  const ppl = await cards([...live.map((r) => r.fromId), ...live.map((r) => r.candidateId)]);
  return {
    received: live.map((r) => ({
      id: r.id,
      from: personOf(ppl, r.fromId),
      circleName: r.circleName,
      candidate: ppl.get(r.candidateId) ?? { userId: r.candidateId, name: "Someone", photoUrl: null, age: null, area: null },
      note: r.note,
      status: r.status as WingmanStatus,
      createdAt: r.createdAt.toISOString(),
    })),
    sentToday: await sentToday(userId),
  };
}

export async function forProfile(viewerId: string, candidateId: string): Promise<WingmanForProfile> {
  const empty: WingmanForProfile = { suggestedBy: [], friends: [], sentToday: 0 };
  if (viewerId === candidateId) return empty;
  if ((await blockedWith(viewerId)).has(candidateId)) return empty;

  const toMe = await db.select().from(wingmanSuggestions)
    .where(and(eq(wingmanSuggestions.toId, viewerId), eq(wingmanSuggestions.candidateId, candidateId), inArray(wingmanSuggestions.status, ["pending", "seen"])))
    .orderBy(desc(wingmanSuggestions.createdAt));
  if (toMe.some((r) => r.status === "pending")) {
    await db.update(wingmanSuggestions).set({ status: "seen" })
      .where(and(eq(wingmanSuggestions.toId, viewerId), eq(wingmanSuggestions.candidateId, candidateId), eq(wingmanSuggestions.status, "pending")));
  }

  const friends = await circleFriends(viewerId);
  const myBlocks = await blockedWith(viewerId);
  const fids = Array.from(friends.keys()).filter((f) => !myBlocks.has(f));
  const eligible = await canReceive(fids, candidateId);
  const sent = await db.select({ toId: wingmanSuggestions.toId }).from(wingmanSuggestions)
    .where(and(eq(wingmanSuggestions.fromId, viewerId), eq(wingmanSuggestions.candidateId, candidateId)));
  const sentTo = new Set(sent.map((s) => s.toId));
  const ppl = await cards([...toMe.map((r) => r.fromId), ...Array.from(eligible)]);
  return {
    suggestedBy: toMe.filter((r) => !myBlocks.has(r.fromId)).map((r) => ({ id: r.id, from: personOf(ppl, r.fromId), note: r.note, circleName: r.circleName })),
    friends: Array.from(eligible).map((id) => ({ person: personOf(ppl, id), circleName: friends.get(id)!, sent: sentTo.has(id) }))
      .sort((a, b) => a.person.name.localeCompare(b.person.name)),
    sentToday: await sentToday(viewerId),
  };
}

export async function suggest(fromId: string, toId: string, candidateId: string, raw: unknown): Promise<{ id: number } | Fail> {
  const note = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  const problem = wingmanNoteProblem(note);
  if (problem) return { error: 400, message: problem };
  if (!toId || !candidateId || fromId === toId || fromId === candidateId) return { error: 400, message: "Pick a friend and someone to suggest." };
  const circleName = (await circleFriends(fromId)).get(toId);
  if (!circleName) return { error: 403, message: "You can suggest people to friends in your circles." };
  const myBlocks = await blockedWith(fromId);
  if (myBlocks.has(toId) || myBlocks.has(candidateId) || !(await canReceive([toId], candidateId)).has(toId)) {
    return { error: 403, message: "That suggestion isn't possible." };
  }
  const [dup] = await db.select({ id: wingmanSuggestions.id }).from(wingmanSuggestions)
    .where(and(eq(wingmanSuggestions.fromId, fromId), eq(wingmanSuggestions.toId, toId), eq(wingmanSuggestions.candidateId, candidateId)));
  if (dup) return { error: 409, message: "You've already suggested them." };
  if ((await sentToday(fromId)) >= WINGMAN_DAILY) return { error: 429, message: `Up to ${WINGMAN_DAILY} suggestions a day. Try again tomorrow.` };

  const [row] = await db.insert(wingmanSuggestions).values({ fromId, toId, candidateId, circleName, note, status: "pending" }).returning();
  const ppl = await cards([fromId]);
  notify(toId, "wingman", {
    type: "wingman",
    title: `${ppl.get(fromId)?.name ?? "A friend"} thinks you'd like someone`,
    body: `“${note}”`,
    url: "/wingman",
    tag: `wingman-${row.id}`,
  }).catch(() => {});
  return { id: row.id };
}

export function registerWingmanRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  const wrap = (fn: (req: Request, res: any, userId: string) => Promise<unknown>) => async (req: Request, res: any) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try { await fn(req, res, userId); } catch (e) { console.error("[wingman]", e); if (!res.headersSent) res.status(500).json({ message: "Something went wrong" }); }
  };

  app.get("/api/wingman/me", wrap(async (_req, res, userId) => res.json(await wingmanMe(userId))));
  app.get("/api/wingman/for/:candidateId", wrap(async (req, res, userId) => res.json(await forProfile(userId, String(req.params.candidateId)))));
  app.post("/api/wingman", wrap(async (req, res, userId) => {
    const out = await suggest(userId, String(req.body?.toId ?? ""), String(req.body?.candidateId ?? ""), req.body?.note);
    if ("error" in out) return res.status(out.error).json({ message: out.message });
    res.status(201).json(out);
  }));
  app.post("/api/wingman/:id/dismiss", wrap(async (req, res, userId) => {
    await db.update(wingmanSuggestions).set({ status: "dismissed" })
      .where(and(eq(wingmanSuggestions.id, Number(req.params.id)), eq(wingmanSuggestions.toId, userId)));
    res.json({ ok: true });
  }));
}
