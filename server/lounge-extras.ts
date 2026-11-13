// Lounge rooms list extras (docs/destira-upgrade-prompt.md §7.13): who's in a
// room (a few faces for the avatar stack) and whether a game is live right
// now. Two batched queries for the whole list, never one per room.
//
// Faces follow the same rule as an event's "who's going": only members with
// a public profile and a photo, never anyone the viewer blocked or who
// blocked the viewer.
import { db } from "./db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { blockedUsers, groupGameParticipants, groupGames, groupMembers, profiles } from "@shared/schema";

export interface RoomFace {
  id: string;
  name: string;
  avatarUrl: string;
}

export interface LiveGame {
  id: number;
  kind: string;
  playing: number;
}

export async function withRoomExtras<T extends { id: number }>(
  viewerId: string,
  rooms: T[],
): Promise<Array<T & { faces: RoomFace[]; liveGame: LiveGame | null }>> {
  if (rooms.length === 0) return [];
  const ids = rooms.map((r) => r.id);

  const [faceRows, blockedByViewer, blockedOfViewer, gameRows] = await Promise.all([
    db
      .select({ groupId: groupMembers.groupId, userId: groupMembers.userId, name: profiles.displayName, photo: profiles.coverPhotoUrl })
      .from(groupMembers)
      .innerJoin(profiles, eq(profiles.userId, groupMembers.userId))
      .where(and(inArray(groupMembers.groupId, ids), eq(profiles.isPublic, true), isNotNull(profiles.coverPhotoUrl))),
    db.select({ id: blockedUsers.blockedId }).from(blockedUsers).where(eq(blockedUsers.blockerId, viewerId)),
    db.select({ id: blockedUsers.blockerId }).from(blockedUsers).where(eq(blockedUsers.blockedId, viewerId)),
    db
      .select({ id: groupGames.id, groupId: groupGames.groupId, kind: groupGames.kind })
      .from(groupGames)
      .where(and(inArray(groupGames.groupId, ids), eq(groupGames.status, "active"))),
  ]);

  const hidden = new Set([...blockedByViewer, ...blockedOfViewer].map((r) => r.id));
  const faces = new Map<number, RoomFace[]>();
  for (const r of faceRows) {
    if (r.userId === viewerId || hidden.has(r.userId) || !r.photo) continue;
    const list = faces.get(r.groupId) ?? [];
    if (list.length < 4) list.push({ id: r.userId, name: r.name || "Someone", avatarUrl: r.photo });
    faces.set(r.groupId, list);
  }

  const playing = new Map<number, number>();
  if (gameRows.length > 0) {
    const parts = await db
      .select({ gameId: groupGameParticipants.gameId })
      .from(groupGameParticipants)
      .where(inArray(groupGameParticipants.gameId, gameRows.map((g) => g.id)));
    for (const p of parts) playing.set(p.gameId, (playing.get(p.gameId) ?? 0) + 1);
  }
  // The newest active game per room is the one to show.
  const live = new Map<number, LiveGame>();
  for (const g of [...gameRows].sort((a, b) => a.id - b.id)) {
    live.set(g.groupId, { id: g.id, kind: g.kind, playing: playing.get(g.id) ?? 0 });
  }

  return rooms.map((r) => ({ ...r, faces: faces.get(r.id) ?? [], liveGame: live.get(r.id) ?? null }));
}
