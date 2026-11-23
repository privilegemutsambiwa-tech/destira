// Lounge moderator tools (docs/destira-3-upgrade-prompt.md Part J).
//   GET  /api/groups/:id/posting                     what the composer needs (slow mode, a pause, rules)
//   POST /api/groups/:id/rules/accept                agree to the room rules (asked before your first message)
//   PUT  /api/groups/:id/slow-mode                   { seconds } admins
//   POST /api/groups/:id/members/:userId/pause       { minutes } admins; 0 lifts it
//   POST /api/groups/:id/messages/:messageId/remove  { reason } admins; the reason shows in its place
// denyIfCantPost() runs in the message route before anything is saved.
// Owners and admins are never slowed, paused or asked about the rules.
import type { Express, Request, Response } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { groupMembers, groupMessages, groupModerationLogs, groups, type Group, type GroupMember } from "@shared/schema";
import {
  MEMBER_MUTE_OPTIONS, REMOVE_REASON_MAX, SLOW_MODE_OPTIONS, slowModeLabel, type RoomPostingState,
} from "@shared/lounge";
import { notify } from "./push";

const isMod = (role: string | null | undefined) => role === "owner" || role === "admin";
const muteLabel = (minutes: number) => MEMBER_MUTE_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `${minutes} minutes`;

async function member(groupId: number, userId: string): Promise<GroupMember | undefined> {
  const [m] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  return m;
}
async function room(groupId: number): Promise<Group | undefined> {
  const [g] = await db.select().from(groups).where(eq(groups.id, groupId));
  return g;
}

async function slowWait(group: Group, userId: string): Promise<number> {
  const s = group.slowModeSeconds ?? 0;
  if (!s) return 0;
  // Seconds since their last message, worked out by the database so the
  // server's time zone never skews it.
  const [last] = await db.select({ ago: sql<number | null>`extract(epoch from (now() - max(${groupMessages.createdAt})))::float` })
    .from(groupMessages)
    .where(and(eq(groupMessages.groupId, group.id), eq(groupMessages.userId, userId), ne(groupMessages.contentType, "system")));
  if (last?.ago == null) return 0;
  return Math.max(0, Math.ceil(s - Number(last.ago)));
}

export async function postingState(group: Group, m: GroupMember): Promise<RoomPostingState> {
  const mod = isMod(m.role);
  const paused = !mod && m.mutedUntil && new Date(m.mutedUntil) > new Date() ? new Date(m.mutedUntil).toISOString() : null;
  return {
    role: m.role,
    slowModeSeconds: group.slowModeSeconds ?? 0,
    waitSeconds: mod ? 0 : await slowWait(group, m.userId),
    mutedUntil: paused,
    rulesText: group.rulesText?.trim() || null,
    rulesAccepted: mod || !group.rulesText?.trim() || !!m.rulesAcceptedAt,
  };
}

/** In the message route: true when it answered (rules not agreed, paused, or slow mode). */
export async function denyIfCantPost(res: Response, group: Group | undefined, m: GroupMember): Promise<boolean> {
  if (!group || isMod(m.role)) return false;
  const st = await postingState(group, m);
  if (!st.rulesAccepted) {
    res.status(403).json({ code: "rules", message: "Read the room rules first." });
    return true;
  }
  if (st.mutedUntil) {
    res.status(403).json({ code: "paused", until: st.mutedUntil, message: "A moderator has paused your messages in this room for now." });
    return true;
  }
  if (st.waitSeconds > 0) {
    res.status(429).json({ code: "slow", waitSeconds: st.waitSeconds, message: `Slow mode is on. You can send again in ${st.waitSeconds}s.` });
    return true;
  }
  return false;
}

type Fail = { error: number; message: string };
async function asMod(groupId: number, userId: string): Promise<{ group: Group; me: GroupMember } | Fail> {
  const group = await room(groupId);
  if (!group) return { error: 404, message: "Room not found" };
  const me = await member(groupId, userId);
  if (!me || !isMod(me.role)) return { error: 403, message: "Only the room's admins can do that" };
  return { group, me };
}

export function registerLoungeModerationRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  const id = (v: string) => Number.parseInt(v, 10);

  app.get("/api/groups/:id/posting", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const group = await room(id(req.params.id));
    const m = group && (await member(group.id, userId));
    if (!group || !m) return res.sendStatus(404);
    res.json(await postingState(group, m));
  });

  app.post("/api/groups/:id/rules/accept", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const gid = id(req.params.id);
    const m = await member(gid, userId);
    if (!m) return res.sendStatus(404);
    await db.update(groupMembers).set({ rulesAcceptedAt: new Date() }).where(eq(groupMembers.id, m.id));
    res.json({ ok: true });
  });

  app.put("/api/groups/:id/slow-mode", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const r = await asMod(id(req.params.id), userId);
    if ("error" in r) return res.status(r.error).json({ message: r.message });
    const seconds = Number(req.body?.seconds);
    if (!SLOW_MODE_OPTIONS.some((o) => o.seconds === seconds)) return res.status(400).json({ message: "Pick one of the slow mode options" });
    await db.update(groups).set({ slowModeSeconds: seconds, updatedAt: new Date() }).where(eq(groups.id, r.group.id));
    await db.insert(groupModerationLogs).values({
      groupId: r.group.id, userId, action: seconds ? "slow_mode_on" : "slow_mode_off", reason: seconds ? slowModeLabel(seconds) : null, moderatedBy: userId,
    });
    res.json({ slowModeSeconds: seconds });
  });

  app.post("/api/groups/:id/members/:userId/pause", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const r = await asMod(id(req.params.id), userId);
    if ("error" in r) return res.status(r.error).json({ message: r.message });
    const targetId = req.params.userId;
    const minutes = Number(req.body?.minutes);
    if (minutes !== 0 && !MEMBER_MUTE_OPTIONS.some((o) => o.minutes === minutes)) return res.status(400).json({ message: "Pick 1 hour, 1 day or 1 week" });
    if (targetId === userId) return res.status(400).json({ message: "You can't pause yourself" });
    const t = await member(r.group.id, targetId);
    if (!t) return res.status(404).json({ message: "They're not in this room" });
    if (t.role === "owner") return res.status(403).json({ message: "The owner can't be paused" });
    if (t.role === "admin" && r.me.role !== "owner") return res.status(403).json({ message: "Only the owner can pause an admin" });
    const until = minutes ? new Date(Date.now() + minutes * 60_000) : null;
    await db.update(groupMembers).set({ mutedUntil: until, mutedBy: until ? userId : null }).where(eq(groupMembers.id, t.id));
    await db.insert(groupModerationLogs).values({
      groupId: r.group.id, userId: targetId, action: until ? "member_paused" : "member_unpaused", reason: until ? muteLabel(minutes) : null, moderatedBy: userId,
    });
    if (until) {
      notify(targetId, "lounge", {
        type: "lounge_paused",
        title: `Your messages in ${r.group.name} are paused for ${muteLabel(minutes)}`,
        body: r.group.rulesText?.trim() ? "A moderator did this. Have a look at the room rules before you're back." : "A moderator did this. You can still read along.",
        url: `/lounge/group/${r.group.id}`,
        tag: `lounge-${r.group.id}`,
      }).catch((e) => console.error("[lounge] pause notify failed:", e));
    }
    res.json({ mutedUntil: until?.toISOString() ?? null });
  });

  app.post("/api/groups/:id/messages/:messageId/remove", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const r = await asMod(id(req.params.id), userId);
    if ("error" in r) return res.status(r.error).json({ message: r.message });
    const reason = String(req.body?.reason ?? "").trim().slice(0, REMOVE_REASON_MAX);
    if (!reason) return res.status(400).json({ message: "Say why, in a few words" });
    const [msg] = await db.select().from(groupMessages).where(and(eq(groupMessages.id, id(req.params.messageId)), eq(groupMessages.groupId, r.group.id)));
    if (!msg) return res.status(404).json({ message: "Message not found" });
    if (msg.isDeletedByAdmin || msg.deletedForEveryone) return res.status(409).json({ message: "It's already gone" });
    const author = await member(r.group.id, msg.userId);
    if (author?.role === "owner" && r.me.role !== "owner") return res.status(403).json({ message: "Only the owner can remove the owner's messages" });
    if (author?.role === "admin" && r.me.role !== "owner" && msg.userId !== userId) return res.status(403).json({ message: "Only the owner can remove an admin's messages" });
    const [updated] = await db.update(groupMessages)
      .set({ isDeletedByAdmin: true, originalContent: msg.content, content: "[Message deleted by admin]", removedReason: reason })
      .where(eq(groupMessages.id, msg.id)).returning();
    await db.insert(groupModerationLogs).values({ groupId: r.group.id, messageId: msg.id, userId: msg.userId, action: "message_deleted", reason, moderatedBy: userId });
    if (msg.userId !== userId) {
      notify(msg.userId, "lounge", {
        type: "lounge_removed",
        title: `A moderator removed your message in ${r.group.name}`,
        body: `Reason: ${reason}`,
        url: `/lounge/group/${r.group.id}`,
        tag: `lounge-${r.group.id}`,
      }).catch((e) => console.error("[lounge] removal notify failed:", e));
    }
    res.json({ ...updated, originalContent: null });
  });
}
