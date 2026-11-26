// Console: the Crown matchmaker (shared/matchmaker.ts, server/crown-matchmaker.ts).
//   GET  /api/admin/matchmaker                       Crown members, who looks after each, this month's count, chats asked for, recent introductions
//   POST /api/admin/matchmaker/:userId/assign        { mine } take this member on (or let them go)
//   GET  /api/admin/matchmaker/:userId/candidates    people who fit them both ways
//   POST /api/admin/matchmaker/:userId/propose       { candidateId, note } (only the member's own matchmaker)
//   POST /api/admin/matchmaker/chats/:id/reply       { reply } the member sees it
//   POST /api/admin/matchmaker/chats/:id/done
// Any console admin from "support" up can work the queue. Every action is audited.
import type { Express } from "express";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { adminUsers, crownMembers, matchmakerChats, matchmakerIntros, profiles } from "@shared/schema";
import { MATCHMAKER_MONTHLY, matchmakerMonthStart, matchmakerNoteProblem } from "@shared/matchmaker";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import { activeCrownIds } from "../crown";
import {
  FIT_COLUMNS, type FitRow, ageOf, areaOf, blockedWith, effectiveStatus, introducedWith, introsThisMonth,
  loveMatchedWith, pairProblem, privateCrownIds, profilesFit,
} from "../crown-matchmaker";
import { notify } from "../push";

const DAY_MS = 24 * 3600e3;
const CANDIDATES_MAX = 30;
const adminId = (req: any): string => req.admin.userId;
const nameOf = (n: string | null | undefined) => (n || "").trim() || "No name";

async function names(ids: string[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return new Map();
  const ps = await db.select({ userId: profiles.userId, displayName: profiles.displayName }).from(profiles).where(inArray(profiles.userId, uniq));
  return new Map(ps.map((p) => [p.userId, nameOf(p.displayName)]));
}

export async function openMatchmakerChats(): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(matchmakerChats).where(ne(matchmakerChats.status, "done"));
  return Number(n);
}

export function registerAdminMatchmakerRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/matchmaker", "support", async (req, res) => {
    try {
      const me = adminId(req);
      const crownIds = Array.from(await activeCrownIds());
      const rows = crownIds.length
        ? await db.select({ userId: crownMembers.userId, matchmakerId: crownMembers.matchmakerId, activeUntil: crownMembers.activeUntil, privateMode: crownMembers.privateMode })
          .from(crownMembers).where(inArray(crownMembers.userId, crownIds))
        : [];
      const ps = crownIds.length ? ((await db.select(FIT_COLUMNS).from(profiles).where(inArray(profiles.userId, crownIds))) as FitRow[]) : [];
      const monthStart = matchmakerMonthStart();
      const counts = crownIds.length
        ? await db.select({ userId: matchmakerIntros.crownUserId, n: sql<number>`count(*)` }).from(matchmakerIntros)
          .where(and(inArray(matchmakerIntros.crownUserId, crownIds), gte(matchmakerIntros.createdAt, monthStart)))
          .groupBy(matchmakerIntros.crownUserId)
        : [];
      const admins = await db.select({ userId: adminUsers.userId }).from(adminUsers);
      const chats = await db.select().from(matchmakerChats).where(ne(matchmakerChats.status, "done")).orderBy(matchmakerChats.requestedAt);
      const recent = await db.select().from(matchmakerIntros)
        .where(gte(matchmakerIntros.createdAt, new Date(Date.now() - 60 * DAY_MS))).orderBy(desc(matchmakerIntros.createdAt)).limit(100);
      const nm = await names([
        ...admins.map((a) => a.userId), ...chats.map((c) => c.crownUserId), ...chats.map((c) => c.handledBy ?? ""),
        ...recent.flatMap((r) => [r.crownUserId, r.candidateId, r.proposedBy]),
      ]);
      const members = rows.map((r) => {
        const p = ps.find((x) => x.userId === r.userId);
        return {
          userId: r.userId,
          name: nameOf(p?.displayName),
          age: p ? ageOf(p) : null,
          area: p ? areaOf(p) : null,
          gender: p?.gender ?? null,
          seeking: p?.seekingGenders ?? [],
          ageRange: p ? [p.ageMin ?? 18, p.ageMax ?? 65] : null,
          intent: p?.datingIntent ?? null,
          lookingFor: p?.lookingFor ?? null,
          activeUntil: r.activeUntil?.toISOString() ?? null,
          privateMode: r.privateMode,
          matchmakerId: r.matchmakerId,
          matchmakerName: r.matchmakerId ? nm.get(r.matchmakerId) ?? "An admin" : null,
          mine: r.matchmakerId === me,
          thisMonth: Number(counts.find((c) => c.userId === r.userId)?.n ?? 0),
        };
      }).sort((a, b) => Number(b.mine) - Number(a.mine) || Number(!!a.matchmakerId) - Number(!!b.matchmakerId) || a.name.localeCompare(b.name));
      res.json({
        me,
        monthly: MATCHMAKER_MONTHLY,
        members,
        chats: chats.map((c) => ({
          id: c.id, crownUserId: c.crownUserId, name: nm.get(c.crownUserId) ?? "A member", message: c.message, status: c.status,
          reply: c.reply, handledBy: c.handledBy ? nm.get(c.handledBy) ?? "An admin" : null, requestedAt: c.requestedAt.toISOString(),
          mine: rows.find((r) => r.userId === c.crownUserId)?.matchmakerId === me,
        })),
        intros: recent.map((r) => ({
          id: r.id, crownUserId: r.crownUserId, crownName: nm.get(r.crownUserId) ?? "A member", candidateName: nm.get(r.candidateId) ?? "A member",
          proposedBy: nm.get(r.proposedBy) ?? "An admin", note: r.note, status: effectiveStatus(r), createdAt: r.createdAt.toISOString(),
        })),
      });
    } catch (e) {
      console.error("[admin matchmaker] list failed:", e);
      res.status(500).json({ message: "Couldn't load" });
    }
  });

  adminRoute(app, "post", "/api/admin/matchmaker/:userId/assign", "support", async (req, res) => {
    const userId = String(req.params.userId);
    const mine = req.body?.mine !== false;
    try {
      if (!(await activeCrownIds()).has(userId)) return res.status(404).json({ message: "Not a Crown member." });
      await db.update(crownMembers).set({ matchmakerId: mine ? adminId(req) : null, updatedAt: new Date() }).where(eq(crownMembers.userId, userId));
      await auditAdmin(req, adminId(req), mine ? "matchmaker.assign" : "matchmaker.unassign", { targetType: "user", targetId: userId });
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin matchmaker] assign failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });

  adminRoute(app, "get", "/api/admin/matchmaker/:userId/candidates", "support", async (req, res) => {
    const userId = String(req.params.userId);
    try {
      const [me] = (await db.select(FIT_COLUMNS).from(profiles).where(eq(profiles.userId, userId))) as FitRow[];
      if (!me || !(await activeCrownIds()).has(userId)) return res.status(404).json({ message: "Not a Crown member." });
      // A first cut in SQL (active, finished onboarding, not friends-only), the
      // careful two-way check in code.
      const pool = (await db.select(FIT_COLUMNS).from(profiles).where(and(
        eq(profiles.moderationStatus, "active"), ne(profiles.userId, userId),
        sql`coalesce(${profiles.lookingFor}, 'love') <> 'friends'`, sql`coalesce(${profiles.onboardingCompleted}, true)`,
      )).limit(2000)) as FitRow[];
      const [blocked, matched, introduced, hidden] = await Promise.all([blockedWith(userId), loveMatchedWith(userId), introducedWith(userId), privateCrownIds()]);
      const myArea = areaOf(me)?.toLowerCase() ?? null;
      const fits = pool.filter((p) => profilesFit(me, p) && !blocked.has(p.userId) && !matched.has(p.userId) && !introduced.has(p.userId) && !hidden.has(p.userId))
        .map((p) => ({
          userId: p.userId,
          name: nameOf(p.displayName),
          age: ageOf(p),
          area: areaOf(p),
          intent: p.datingIntent,
          verified: !!p.isVerified,
          sameArea: !!myArea && areaOf(p)?.toLowerCase() === myArea,
        }))
        .sort((a, b) => Number(b.sameArea) - Number(a.sameArea) || Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name))
        .slice(0, CANDIDATES_MAX);
      const bios = fits.length
        ? await db.select({ userId: profiles.userId, bio: profiles.bio, aboutMe: profiles.aboutMe }).from(profiles).where(inArray(profiles.userId, fits.map((f) => f.userId)))
        : [];
      res.json({
        candidates: fits.map((f) => {
          const b = bios.find((x) => x.userId === f.userId);
          return { ...f, bio: (b?.aboutMe || b?.bio || "").slice(0, 280) || null };
        }),
      });
    } catch (e) {
      console.error("[admin matchmaker] candidates failed:", e);
      res.status(500).json({ message: "Couldn't load" });
    }
  });

  adminRoute(app, "post", "/api/admin/matchmaker/:userId/propose", "support", async (req, res) => {
    const userId = String(req.params.userId);
    const candidateId = typeof req.body?.candidateId === "string" ? req.body.candidateId : "";
    const noteProblem = matchmakerNoteProblem(req.body?.note);
    if (!candidateId) return res.status(400).json({ message: "Pick someone." });
    if (noteProblem) return res.status(400).json({ message: noteProblem });
    const note = String(req.body.note).trim().replace(/\s+/g, " ");
    try {
      const [cm] = await db.select({ matchmakerId: crownMembers.matchmakerId }).from(crownMembers).where(eq(crownMembers.userId, userId));
      if (!cm || !(await activeCrownIds()).has(userId)) return res.status(404).json({ message: "Not a Crown member." });
      if (cm.matchmakerId !== adminId(req)) return res.status(403).json({ message: "Take this member on first: only their own matchmaker proposes." });
      if ((await introsThisMonth(userId)) >= MATCHMAKER_MONTHLY) return res.status(409).json({ message: `${MATCHMAKER_MONTHLY} introductions this month already.` });
      if ((await introducedWith(userId)).has(candidateId)) return res.status(409).json({ message: "They've been introduced before." });
      const problem = await pairProblem(userId, candidateId);
      if (problem) return res.status(409).json({ message: problem });
      const [row] = await db.insert(matchmakerIntros).values({ crownUserId: userId, candidateId, proposedBy: adminId(req), note, createdAt: new Date() })
        .returning({ id: matchmakerIntros.id });
      await auditAdmin(req, adminId(req), "matchmaker.propose", { targetType: "user", targetId: userId, details: { introId: row.id, candidateId } });
      notify(userId, "matches", {
        type: "matchmaker_intro",
        title: "Your matchmaker has someone for you",
        body: "Read why they think you'd get on, then choose. Names are shared only if you both say yes.",
        url: "/introductions",
        tag: `matchmaker-${row.id}`,
      }).catch(() => {});
      res.status(201).json({ id: row.id });
    } catch (e: any) {
      if (String(e?.message ?? "").includes("matchmaker_intros_pair_idx") || e?.code === "23505") return res.status(409).json({ message: "They've been introduced before." });
      console.error("[admin matchmaker] propose failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });

  adminRoute(app, "post", "/api/admin/matchmaker/chats/:id/reply", "support", async (req, res) => {
    const id = Number(req.params.id);
    const reply = typeof req.body?.reply === "string" ? req.body.reply.trim() : "";
    if (reply.length < 5 || reply.length > 600) return res.status(400).json({ message: "Write a short reply: a time, and how you'll call." });
    try {
      const [c] = await db.update(matchmakerChats).set({ reply, status: "scheduled", handledBy: adminId(req), repliedAt: new Date() })
        .where(and(eq(matchmakerChats.id, id), ne(matchmakerChats.status, "done"))).returning();
      if (!c) return res.status(404).json({ message: "Not found" });
      await auditAdmin(req, adminId(req), "matchmaker.chat_reply", { targetType: "user", targetId: c.crownUserId, details: { chatId: id } });
      notify(c.crownUserId, "account", { type: "matchmaker_chat", title: "Your matchmaker replied", body: reply.slice(0, 140), url: "/introductions", tag: `matchmaker-chat-${id}` }).catch(() => {});
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin matchmaker] reply failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });

  adminRoute(app, "post", "/api/admin/matchmaker/chats/:id/done", "support", async (req, res) => {
    const id = Number(req.params.id);
    try {
      const [c] = await db.update(matchmakerChats).set({ status: "done", doneAt: new Date(), handledBy: adminId(req) })
        .where(eq(matchmakerChats.id, id)).returning();
      if (!c) return res.status(404).json({ message: "Not found" });
      await auditAdmin(req, adminId(req), "matchmaker.chat_done", { targetType: "user", targetId: c.crownUserId, details: { chatId: id } });
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin matchmaker] done failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });
}
