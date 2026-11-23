// Lounge discovery and mentions (docs/destira-3-upgrade-prompt.md Part J).
//   GET /api/lounge/discover   trending this week (real message counts), rooms
//                              your matches are in, each room's topics, your area
//   notifyRoomMessage()        after a room message: tell the people it
//                              @mentions and the person it replies to, unless
//                              they muted the room or there's a block
import type { Express, Request } from "express";
import { and, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "./db";
import { blockedUsers, groupMembers, groupMessages, groups, matches, profiles } from "@shared/schema";
import {
  MENTION_NOTIFY_MAX, TRENDING_DAYS, TRENDING_MIN, mentionHandle, mentionedHandles, roomTopics,
  type LoungeDiscover, type LoungeMatchRoom, type LoungeTopic,
} from "@shared/lounge";
import { notify } from "./push";

const firstName = (n: string | null | undefined) => (n || "Someone").trim().split(/\s+/)[0] || "Someone";
const hiddenRoom = (privacyMode: string | null) => privacyMode === "invite-only" || privacyMode === "private";

async function blockedWith(userId: string): Promise<Set<string>> {
  const rows = await db.select({ a: blockedUsers.blockerId, b: blockedUsers.blockedId }).from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId)));
  return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
}

export async function loungeDiscover(viewerId: string): Promise<LoungeDiscover> {
  const rooms = await db.select({
    id: groups.id, name: groups.name, description: groups.description, categoryTags: groups.categoryTags, privacyMode: groups.privacyMode,
  }).from(groups).where(sql`coalesce(${groups.isEventChat}, false) = false`);
  const mine = new Set((await db.select({ g: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, viewerId))).map((r) => r.g));
  const visible = rooms.filter((r) => !hiddenRoom(r.privacyMode) || mine.has(r.id));
  const visibleIds = new Set(visible.map((r) => r.id));

  const topics: Record<number, LoungeTopic[]> = {};
  for (const r of visible) {
    const t = roomTopics(r);
    if (t.length) topics[r.id] = t;
  }

  // Trending: messages people actually sent this week (not deleted, not system lines).
  const since = new Date(Date.now() - TRENDING_DAYS * 24 * 3600e3);
  const counts = await db.select({ groupId: groupMessages.groupId, n: sql<number>`count(*)::int` })
    .from(groupMessages)
    .where(and(
      gte(groupMessages.createdAt, since),
      ne(groupMessages.contentType, "system"),
      sql`coalesce(${groupMessages.isDeletedByAdmin}, false) = false`,
      sql`coalesce(${groupMessages.deletedForEveryone}, false) = false`,
    ))
    .groupBy(groupMessages.groupId);
  const trending = counts
    .filter((c) => visibleIds.has(c.groupId) && Number(c.n) >= TRENDING_MIN)
    .map((c) => ({ groupId: c.groupId, messages: Number(c.n) }))
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 6);

  // Rooms the people you've matched with (love or friends) are in.
  const ms = await db.select({ u1: matches.user1Id, u2: matches.user2Id }).from(matches)
    .where(and(eq(matches.status, "matched"), or(eq(matches.user1Id, viewerId), eq(matches.user2Id, viewerId))));
  const blocked = await blockedWith(viewerId);
  const people = Array.from(new Set(ms.map((m) => (m.u1 === viewerId ? m.u2 : m.u1)))).filter((id) => !blocked.has(id));
  let matchRooms: LoungeMatchRoom[] = [];
  if (people.length) {
    const rows = await db.select({ groupId: groupMembers.groupId, userId: groupMembers.userId, name: profiles.displayName })
      .from(groupMembers)
      .innerJoin(profiles, eq(profiles.userId, groupMembers.userId))
      .where(inArray(groupMembers.userId, people));
    const by = new Map<number, LoungeMatchRoom>();
    for (const r of rows) {
      if (!visibleIds.has(r.groupId)) continue;
      const room = by.get(r.groupId) ?? { groupId: r.groupId, people: [] };
      room.people.push({ userId: r.userId, name: firstName(r.name) });
      by.set(r.groupId, room);
    }
    matchRooms = Array.from(by.values())
      .sort((a, b) => Number(mine.has(a.groupId)) - Number(mine.has(b.groupId)) || b.people.length - a.people.length)
      .slice(0, 8);
  }

  const [me] = await db.select({ locationName: profiles.locationName, location: profiles.location }).from(profiles).where(eq(profiles.userId, viewerId));
  const myArea = (me?.locationName || me?.location || "").split(",")[0].trim() || null;

  return { trending, matchRooms, topics, myArea };
}

/** Fire-and-forget after a room message is saved. */
export async function notifyRoomMessage(
  groupId: number,
  senderId: string,
  msg: { id: number; content: string | null; contentType?: string | null; replyToMessageId?: number | null },
): Promise<void> {
  const text = msg.content ?? "";
  const handles = text.includes("@") ? mentionedHandles(text) : new Set<string>();
  if (!handles.size && !msg.replyToMessageId) return;

  const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId));
  if (!group) return;
  const members = await db.select({ userId: groupMembers.userId, nickname: groupMembers.nickname, isMuted: groupMembers.isMuted })
    .from(groupMembers).where(eq(groupMembers.groupId, groupId));
  const sender = members.find((m) => m.userId === senderId);
  const senderName = sender?.nickname || "Someone";
  const blocked = await blockedWith(senderId);
  const reachable = (m: { userId: string; isMuted: boolean | null }) => m.userId !== senderId && !m.isMuted && !blocked.has(m.userId);

  const told = new Map<string, "mention" | "reply">();
  if (msg.replyToMessageId) {
    const [orig] = await db.select({ userId: groupMessages.userId }).from(groupMessages)
      .where(and(eq(groupMessages.id, msg.replyToMessageId), eq(groupMessages.groupId, groupId)));
    const m = orig && members.find((x) => x.userId === orig.userId);
    if (m && reachable(m)) told.set(m.userId, "reply");
  }
  if (handles.size) {
    for (const m of members) {
      if (told.size >= MENTION_NOTIFY_MAX) break;
      const h = mentionHandle(m.nickname).toLowerCase();
      if (h && handles.has(h) && reachable(m)) told.set(m.userId, "mention");
    }
  }

  const preview = msg.contentType && msg.contentType !== "text" ? "Sent something" : text.length > 120 ? `${text.slice(0, 117)}…` : text;
  await Promise.all(Array.from(told.entries()).map(([userId, why]) =>
    notify(userId, "lounge", {
      type: why === "mention" ? "lounge_mention" : "lounge_reply",
      title: why === "mention" ? `${senderName} mentioned you in ${group.name}` : `${senderName} replied to you in ${group.name}`,
      body: preview,
      url: `/lounge/group/${groupId}?msg=${msg.id}`,
      tag: `lounge-${groupId}`,
    }).catch((e) => console.error("[lounge] notify failed:", e)),
  ));
}

export function registerLoungeDiscoveryRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  app.get("/api/lounge/discover", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await loungeDiscover(userId));
    } catch (e) {
      console.error("[lounge] discover failed:", e);
      res.status(500).json({ message: "Couldn't load the Lounge" });
    }
  });
}
