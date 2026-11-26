// Crown matchmaker, the member side (shared/matchmaker.ts; console side in
// server/admin/matchmaker.ts).
//   GET  /api/matchmaker/me                 your introductions (as a Crown member or as the person picked), your chat
//   POST /api/matchmaker/intros/:id/answer  { yes } nameless until both say yes; no is never told
//   POST /api/matchmaker/chat               { message } ask for this month's chat (Crown only)
import type { Express, Request } from "express";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import { blockedUsers, crownMembers, matchmakerChats, matchmakerIntros, matches, profiles, type MatchmakerIntro } from "@shared/schema";
import { ageFromDob, DATING_INTENT_OPTIONS } from "@shared/essentials";
import { wantsLove } from "@shared/friends";
import {
  MATCHMAKER_ANSWER_DAYS, MATCHMAKER_CHAT_MAX, MATCHMAKER_MATCH_NOTE, MATCHMAKER_MONTHLY, matchmakerMonthStart,
  type MatchmakerCard, type MatchmakerIntroStatus, type MatchmakerIntroView, type MatchmakerMe,
} from "@shared/matchmaker";
import { isCrown } from "./crown";
import { genderMatchesSeeking, storage } from "./storage";
import { notify } from "./push";

type Fail = { error: number; message: string };
const DAY_MS = 24 * 3600e3;
const firstName = (n: string | null | undefined) => (n || "").trim().split(/\s+/)[0] || null;

// ── who fits whom ─────────────────────────────────────────────────

export const FIT_COLUMNS = {
  userId: profiles.userId, displayName: profiles.displayName, gender: profiles.gender, seekingGenders: profiles.seekingGenders,
  lookingFor: profiles.lookingFor, moderationStatus: profiles.moderationStatus, onboardingCompleted: profiles.onboardingCompleted,
  age: profiles.age, dateOfBirth: profiles.dateOfBirth, ageMin: profiles.ageMinPreference, ageMax: profiles.ageMaxPreference,
  locationName: profiles.locationName, location: profiles.location, datingIntent: profiles.datingIntent, isVerified: profiles.isVerified,
};
export type FitRow = {
  userId: string; displayName: string | null; gender: string | null; seekingGenders: string[] | null; lookingFor: string | null;
  moderationStatus: string; onboardingCompleted: boolean | null; age: number | null; dateOfBirth: string | null;
  ageMin: number | null; ageMax: number | null; locationName: string | null; location: string | null;
  datingIntent: string | null; isVerified: boolean | null;
};

export const ageOf = (p: Pick<FitRow, "age" | "dateOfBirth">) => (p.dateOfBirth ? ageFromDob(p.dateOfBirth) : null) ?? p.age ?? null;
export const areaOf = (p: Pick<FitRow, "locationName" | "location">) => (p.locationName || p.location || "").split(",")[0].trim() || null;

/** One way: does `a` want to meet someone like `b`? (type and age range) */
function wants(a: FitRow, b: FitRow): boolean {
  const seeks = (a.seekingGenders ?? []).includes("everyone") || genderMatchesSeeking(b.gender, a.seekingGenders ?? []);
  const age = ageOf(b);
  return seeks && age != null && age >= (a.ageMin ?? 18) && age <= (a.ageMax ?? 99);
}

/** Both here for Love, active, each the other's type and age range. */
export function profilesFit(a: FitRow, b: FitRow): boolean {
  const ok = (p: FitRow) => p.moderationStatus === "active" && p.onboardingCompleted !== false && wantsLove(p.lookingFor);
  return a.userId !== b.userId && ok(a) && ok(b) && wants(a, b) && wants(b, a);
}

export async function blockedWith(userId: string): Promise<Set<string>> {
  const rows = await db.select({ a: blockedUsers.blockerId, b: blockedUsers.blockedId }).from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId)));
  return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
}

/** Everyone this member already has a love match with. */
export async function loveMatchedWith(userId: string): Promise<Set<string>> {
  const rows = await db.select({ a: matches.user1Id, b: matches.user2Id }).from(matches)
    .where(and(eq(matches.status, "matched"), eq(matches.kind, "love"), or(eq(matches.user1Id, userId), eq(matches.user2Id, userId))));
  return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
}

/** Everyone ever proposed with this member, either way round. */
export async function introducedWith(userId: string): Promise<Set<string>> {
  const rows = await db.select({ a: matchmakerIntros.crownUserId, b: matchmakerIntros.candidateId }).from(matchmakerIntros)
    .where(or(eq(matchmakerIntros.crownUserId, userId), eq(matchmakerIntros.candidateId, userId)));
  return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
}

/** Crown members in private mode are out of everyone's suggestions. */
export async function privateCrownIds(): Promise<Set<string>> {
  const rows = await db.select({ userId: crownMembers.userId }).from(crownMembers).where(eq(crownMembers.privateMode, true));
  return new Set(rows.map((r) => r.userId));
}

/** Why these two can't be introduced right now, or null if they can. */
export async function pairProblem(crownUserId: string, candidateId: string): Promise<string | null> {
  const ps = (await db.select(FIT_COLUMNS).from(profiles).where(inArray(profiles.userId, [crownUserId, candidateId]))) as FitRow[];
  const a = ps.find((p) => p.userId === crownUserId);
  const b = ps.find((p) => p.userId === candidateId);
  if (!a || !b) return "One of them has no profile.";
  if (!profilesFit(a, b)) return "They don't fit each other's type, age range or what they're here for.";
  if ((await blockedWith(crownUserId)).has(candidateId)) return "One of them has blocked the other.";
  if ((await loveMatchedWith(crownUserId)).has(candidateId)) return "They're already matched.";
  if ((await privateCrownIds()).has(candidateId)) return "That member is in private mode.";
  return null;
}

// ── the nameless card, and what each side sees ───────────────────

const INTENT_LABEL = new Map<string, string>(DATING_INTENT_OPTIONS.map((o) => [o.value, o.label]));

async function cardsFor(ids: string[]): Promise<Map<string, MatchmakerCard & { name: string | null }>> {
  const uniq = Array.from(new Set(ids));
  if (!uniq.length) return new Map();
  const ps = (await db.select(FIT_COLUMNS).from(profiles).where(inArray(profiles.userId, uniq))) as FitRow[];
  return new Map(ps.map((p) => [p.userId, {
    age: ageOf(p),
    area: areaOf(p),
    intent: p.datingIntent ? INTENT_LABEL.get(p.datingIntent) ?? null : null,
    verified: !!p.isVerified,
    name: firstName(p.displayName),
  }]));
}

/** Lapsed if nobody answered at the current step in time. */
export function effectiveStatus(r: Pick<MatchmakerIntro, "status" | "createdAt" | "crownAnsweredAt">, now = Date.now()): MatchmakerIntroStatus {
  const limit = MATCHMAKER_ANSWER_DAYS * DAY_MS;
  if (r.status === "proposed" && now - r.createdAt.getTime() > limit) return "expired";
  if (r.status === "crown_accepted" && r.crownAnsweredAt && now - r.crownAnsweredAt.getTime() > limit) return "expired";
  return r.status as MatchmakerIntroStatus;
}

function answerBy(r: MatchmakerIntro): string | null {
  const from = r.status === "proposed" ? r.createdAt : r.status === "crown_accepted" ? r.crownAnsweredAt : null;
  return from ? new Date(from.getTime() + MATCHMAKER_ANSWER_DAYS * DAY_MS).toISOString() : null;
}

export async function introsThisMonth(crownUserId: string): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(matchmakerIntros)
    .where(and(eq(matchmakerIntros.crownUserId, crownUserId), gte(matchmakerIntros.createdAt, matchmakerMonthStart())));
  return Number(n);
}

async function matchmakerMe(userId: string): Promise<MatchmakerMe> {
  const crown = await isCrown(userId);
  const [cm] = await db.select({ matchmakerId: crownMembers.matchmakerId }).from(crownMembers).where(eq(crownMembers.userId, userId));
  let matchmakerName: string | null = null;
  if (crown && cm?.matchmakerId) {
    const [mp] = await db.select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.userId, cm.matchmakerId));
    matchmakerName = firstName(mp?.displayName) ?? "the Destira team";
  }

  // As the Crown member: everything since you joined (while you're Crown).
  // As the person picked: only once the Crown member has said yes.
  const rows = await db.select().from(matchmakerIntros).where(or(
    crown ? eq(matchmakerIntros.crownUserId, userId) : sql`false`,
    and(eq(matchmakerIntros.candidateId, userId), inArray(matchmakerIntros.status, ["crown_accepted", "matched", "passed"])),
  )).orderBy(desc(matchmakerIntros.createdAt)).limit(40);
  const blocked = await blockedWith(userId);
  const live = rows.filter((r) => !blocked.has(r.crownUserId === userId ? r.candidateId : r.crownUserId));
  const cards = await cardsFor(live.map((r) => (r.crownUserId === userId ? r.candidateId : r.crownUserId)));
  const photos = new Map<string, string | null>();
  const matchedOthers = live.filter((r) => r.status === "matched").map((r) => (r.crownUserId === userId ? r.candidateId : r.crownUserId));
  if (matchedOthers.length) {
    const ps = await db.select({ userId: profiles.userId, isPublic: profiles.isPublic, coverPhotoUrl: profiles.coverPhotoUrl })
      .from(profiles).where(inArray(profiles.userId, matchedOthers));
    const got = await storage.resolveProfilePhotos(ps.map((p) => ({ userId: p.userId, isPublic: p.isPublic, coverPhotoUrl: p.coverPhotoUrl ?? null, profileImageUrl: null })));
    for (const p of ps) photos.set(p.userId, got.get(p.userId) ?? p.coverPhotoUrl ?? null);
  }

  const intros: MatchmakerIntroView[] = [];
  for (const r of live) {
    const role = r.crownUserId === userId ? "crown" : "candidate";
    const other = role === "crown" ? r.candidateId : r.crownUserId;
    const st = effectiveStatus(r);
    // The person picked never sees one they let lapse or passed on.
    if (role === "candidate" && (st === "expired" || st === "passed")) continue;
    const stage: MatchmakerIntroView["stage"] =
      st === "matched" ? "matched"
      : st === "proposed" ? "yours"
      : st === "crown_accepted" ? (role === "candidate" ? "yours" : "theirs")
      : "over";
    const c = cards.get(other);
    intros.push({
      id: r.id,
      role,
      stage,
      card: { age: c?.age ?? null, area: c?.area ?? null, intent: c?.intent ?? null, verified: !!c?.verified },
      note: r.note,
      name: stage === "matched" ? c?.name ?? "Someone" : null,
      photoUrl: stage === "matched" ? photos.get(other) ?? null : null,
      matchId: stage === "matched" ? r.matchId : null,
      createdAt: r.createdAt.toISOString(),
      answerBy: stage === "yours" || stage === "theirs" ? answerBy(r) : null,
    });
  }

  let chat: MatchmakerMe["chat"] = null;
  let canAskChat = false;
  if (crown) {
    const [c] = await db.select().from(matchmakerChats).where(eq(matchmakerChats.crownUserId, userId)).orderBy(desc(matchmakerChats.requestedAt)).limit(1);
    if (c) chat = { id: c.id, message: c.message, status: c.status as any, reply: c.reply, requestedAt: c.requestedAt.toISOString() };
    canAskChat = !c || c.requestedAt < matchmakerMonthStart();
  }
  return { crown, matchmakerName, introsThisMonth: crown ? await introsThisMonth(userId) : 0, monthly: MATCHMAKER_MONTHLY, intros, chat, canAskChat };
}

// ── answering ─────────────────────────────────────────────────────

async function makeLoveMatch(a: string, b: string): Promise<{ id: number; fresh: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${[a, b].sort().join(":")}))`);
    const [existing] = await tx.select({ id: matches.id, status: matches.status, kind: matches.kind }).from(matches)
      .where(or(and(eq(matches.user1Id, a), eq(matches.user2Id, b)), and(eq(matches.user1Id, b), eq(matches.user2Id, a))));
    if (existing?.status === "matched" && existing.kind === "love") return { id: existing.id, fresh: false };
    if (existing) {
      await tx.update(matches).set({ status: "matched", kind: "love", originNote: MATCHMAKER_MATCH_NOTE }).where(eq(matches.id, existing.id));
      return { id: existing.id, fresh: true };
    }
    const [m] = await tx.insert(matches).values({ user1Id: a, user2Id: b, status: "matched", kind: "love", originNote: MATCHMAKER_MATCH_NOTE }).returning({ id: matches.id });
    return { id: m.id, fresh: true };
  });
}

async function answer(userId: string, id: number, yes: boolean): Promise<{ status: MatchmakerIntroStatus; matchId?: number } | Fail> {
  const [r] = await db.select().from(matchmakerIntros).where(eq(matchmakerIntros.id, id));
  if (!r || (r.crownUserId !== userId && r.candidateId !== userId)) return { error: 404, message: "Not found" };
  const role = r.crownUserId === userId ? "crown" : "candidate";
  const st = effectiveStatus(r);
  if (st === "expired") {
    await db.update(matchmakerIntros).set({ status: "expired" }).where(eq(matchmakerIntros.id, id));
    return { error: 409, message: "This introduction has lapsed." };
  }
  const myTurn = (role === "crown" && st === "proposed") || (role === "candidate" && st === "crown_accepted");
  if (!myTurn) return { error: 409, message: "This one isn't waiting on you." };
  if (role === "crown" && !(await isCrown(userId))) return { error: 403, message: "Introductions from a matchmaker are a Crown perk." };
  const now = new Date();

  if (!yes) {
    const status = role === "crown" ? "declined" : "passed";
    await db.update(matchmakerIntros).set(role === "crown" ? { status, crownAnsweredAt: now } : { status, candidateAnsweredAt: now })
      .where(and(eq(matchmakerIntros.id, id), eq(matchmakerIntros.status, r.status)));
    return { status };
  }
  // Still fine for each other? (Someone may have blocked, matched or changed their mind since.)
  const problem = await pairProblem(r.crownUserId, r.candidateId);
  if (problem) {
    await db.update(matchmakerIntros).set({ status: "expired" }).where(eq(matchmakerIntros.id, id));
    return { error: 409, message: "This introduction can't go ahead any more." };
  }

  if (role === "crown") {
    const [moved] = await db.update(matchmakerIntros).set({ status: "crown_accepted", crownAnsweredAt: now })
      .where(and(eq(matchmakerIntros.id, id), eq(matchmakerIntros.status, "proposed"))).returning({ id: matchmakerIntros.id });
    if (!moved) return { error: 409, message: "Already answered." };
    const c = (await cardsFor([r.crownUserId])).get(r.crownUserId);
    notify(r.candidateId, "matches", {
      type: "matchmaker_intro",
      title: "A Destira matchmaker thinks you'd get on with someone",
      body: `A Crown member${c?.age ? `, ${c.age}` : ""}${c?.area ? `, ${c.area}` : ""}, said yes to meeting you. See why, then choose.`,
      url: "/introductions",
      tag: `matchmaker-${id}`,
    }).catch(() => {});
    return { status: "crown_accepted" };
  }

  const [moved] = await db.update(matchmakerIntros).set({ status: "matched", candidateAnsweredAt: now })
    .where(and(eq(matchmakerIntros.id, id), eq(matchmakerIntros.status, "crown_accepted"))).returning({ id: matchmakerIntros.id });
  if (!moved) return { error: 409, message: "Already answered." };
  const made = await makeLoveMatch(r.crownUserId, r.candidateId);
  await db.update(matchmakerIntros).set({ matchId: made.id }).where(eq(matchmakerIntros.id, id));
  const names = await cardsFor([r.crownUserId, r.candidateId]);
  for (const [to, other] of [[r.crownUserId, r.candidateId], [r.candidateId, r.crownUserId]] as const) {
    notify(to, "matches", {
      type: "match",
      title: `You and ${names.get(other)?.name ?? "someone"} both said yes`,
      body: `${MATCHMAKER_MATCH_NOTE}. Say hi.`,
      url: `/chat/${made.id}`,
      tag: `matchmaker-${id}`,
    }).catch(() => {});
  }
  return { status: "matched", matchId: made.id };
}

// ── routes ────────────────────────────────────────────────────────

export function registerMatchmakerRoutes(app: Express, getUserId: (req: Request) => string | null) {
  app.get("/api/matchmaker/me", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await matchmakerMe(userId));
    } catch (e) {
      console.error("[matchmaker] me failed:", e);
      res.status(500).json({ message: "Couldn't load" });
    }
  });

  app.post("/api/matchmaker/intros/:id/answer", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (typeof req.body?.yes !== "boolean") return res.status(400).json({ message: "yes must be true or false" });
    try {
      const out = await answer(userId, Number(req.params.id), req.body.yes);
      if ("error" in out) return res.status(out.error).json({ message: out.message });
      res.json(out);
    } catch (e) {
      console.error("[matchmaker] answer failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });

  app.post("/api/matchmaker/chat", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (message.length < 10) return res.status(400).json({ message: "Tell your matchmaker a little: what you're looking for, and when suits you." });
    if (message.length > MATCHMAKER_CHAT_MAX) return res.status(400).json({ message: `Keep it under ${MATCHMAKER_CHAT_MAX} characters.` });
    try {
      if (!(await isCrown(userId))) return res.status(403).json({ message: "A chat with a matchmaker is a Crown perk." });
      const [last] = await db.select({ requestedAt: matchmakerChats.requestedAt }).from(matchmakerChats)
        .where(eq(matchmakerChats.crownUserId, userId)).orderBy(desc(matchmakerChats.requestedAt)).limit(1);
      if (last && last.requestedAt >= matchmakerMonthStart()) return res.status(409).json({ message: "You've asked for this month's chat already." });
      const [c] = await db.insert(matchmakerChats).values({ crownUserId: userId, message, requestedAt: new Date() }).returning({ id: matchmakerChats.id });
      res.status(201).json({ id: c.id });
    } catch (e) {
      console.error("[matchmaker] chat failed:", e);
      res.status(500).json({ message: "Couldn't send" });
    }
  });
}
