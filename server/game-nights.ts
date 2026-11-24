// Scheduled game nights in Lounge rooms (docs/destira-3-upgrade-prompt.md Part J).
//   GET    /api/groups/:id/game-nights      what's coming up (and one that's on now)
//   POST   /api/groups/:id/game-nights      { kind, setup, startsAt, note } owners and admins
//   POST   /api/game-nights/:id/rsvp        { going } members
//   DELETE /api/game-nights/:id             the host or a room admin calls it off
// A sweep every minute sends the reminder 30 minutes before (to members who
// haven't muted the room, and everyone who said "I'm in"), then at the start
// opens the game with everyone who said yes already in it.
import type { Express, Request } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { gameNightRsvps, gameNights, groupMembers, groups, type GameNight, type GroupGameKind } from "@shared/schema";
import {
  GAME_NIGHT_MAX_AHEAD_MS, GAME_NIGHT_MIN_LEAD_MS, GAME_NIGHT_NOTE_MAX, GAME_NIGHT_ON_MS, GAME_NIGHT_REMIND_MS,
  GAME_NIGHT_UPCOMING_MAX, type GameNightView, type GameNightsForRoom,
} from "@shared/lounge";
import * as groupGames from "./group-games";
import { notify } from "./push";

const isMod = (role: string | null | undefined) => role === "owner" || role === "admin";
const nightKinds = () => groupGames.listGameKinds().filter((k) => !k.needsSetup).map((k) => ({ kind: k.kind as string, label: k.label }));
const labelOf = (kind: string) => groupGames.listGameKinds().find((k) => k.kind === kind)?.label ?? "Game";
/** Members read times in Harare time. */
const when = (d: Date) =>
  d.toLocaleString("en-GB", { timeZone: "Africa/Harare", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

async function memberOf(groupId: number, userId: string) {
  const [m] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  return m;
}

export async function gameNightsFor(groupId: number, viewerId: string): Promise<GameNightsForRoom | null> {
  const me = await memberOf(groupId, viewerId);
  if (!me) return null;
  const rows = await db.select().from(gameNights)
    .where(and(eq(gameNights.groupId, groupId), inArray(gameNights.status, ["scheduled", "starting", "started"])));
  const now = Date.now();
  const shown = rows
    .filter((n) => n.status !== "started" || new Date(n.startsAt).getTime() > now - GAME_NIGHT_ON_MS)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const ids = shown.map((n) => n.id);
  const rsvps = ids.length ? await db.select().from(gameNightRsvps).where(inArray(gameNightRsvps.gameNightId, ids)) : [];
  const hostIds = Array.from(new Set(shown.map((n) => n.hostId)));
  const hosts = hostIds.length
    ? await db.select({ userId: groupMembers.userId, nickname: groupMembers.nickname }).from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), inArray(groupMembers.userId, hostIds)))
    : [];
  const nights: GameNightView[] = shown.map((n) => {
    const going = rsvps.filter((r) => r.gameNightId === n.id);
    return {
      id: n.id,
      kind: n.kind,
      label: labelOf(n.kind),
      note: n.note,
      startsAt: new Date(n.startsAt).toISOString(),
      status: n.status as GameNightView["status"],
      gameId: n.gameId,
      hostName: hosts.find((h) => h.userId === n.hostId)?.nickname || "A host",
      going: going.length,
      imIn: going.some((r) => r.userId === viewerId),
      canCancel: n.status === "scheduled" && (n.hostId === viewerId || isMod(me.role)),
    };
  });
  return { nights, canSchedule: isMod(me.role), kinds: nightKinds() };
}

type Fail = { error: number; message: string };

export async function scheduleGameNight(groupId: number, userId: string, body: any): Promise<GameNight | Fail> {
  const me = await memberOf(groupId, userId);
  if (!me || !isMod(me.role)) return { error: 403, message: "Only the room's admins can schedule a game night" };
  const kind = String(body?.kind ?? "");
  if (!nightKinds().some((k) => k.kind === kind)) return { error: 400, message: "Pick one of the games that needs no setup" };
  const startsAt = new Date(body?.startsAt);
  const t = startsAt.getTime();
  if (!Number.isFinite(t)) return { error: 400, message: "Pick a day and time" };
  if (t < Date.now() + GAME_NIGHT_MIN_LEAD_MS) return { error: 400, message: "Give people at least 10 minutes' notice" };
  if (t > Date.now() + GAME_NIGHT_MAX_AHEAD_MS) return { error: 400, message: "Up to 30 days ahead" };
  const upcoming = await db.select({ id: gameNights.id }).from(gameNights)
    .where(and(eq(gameNights.groupId, groupId), eq(gameNights.status, "scheduled")));
  if (upcoming.length >= GAME_NIGHT_UPCOMING_MAX) return { error: 409, message: `A room can have ${GAME_NIGHT_UPCOMING_MAX} game nights coming up at a time` };
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, GAME_NIGHT_NOTE_MAX) || null : null;
  const setup = body?.setup && typeof body.setup === "object" ? body.setup : {};
  const [night] = await db.insert(gameNights).values({ groupId, hostId: userId, kind, setup, note, startsAt }).returning();
  await db.insert(gameNightRsvps).values({ gameNightId: night.id, userId }).onConflictDoNothing();
  return night;
}

async function nightFor(id: number) {
  const [n] = await db.select().from(gameNights).where(eq(gameNights.id, id));
  return n;
}

// ── the sweep ──────────────────────────────────────────────────────────

async function remind(n: GameNight): Promise<void> {
  const claimed = await db.update(gameNights).set({ remindedAt: new Date() })
    .where(and(eq(gameNights.id, n.id), eq(gameNights.status, "scheduled"))).returning({ id: gameNights.id });
  if (!claimed.length) return;
  const [room] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, n.groupId));
  const members = await db.select({ userId: groupMembers.userId, isMuted: groupMembers.isMuted }).from(groupMembers).where(eq(groupMembers.groupId, n.groupId));
  const going = new Set((await db.select({ userId: gameNightRsvps.userId }).from(gameNightRsvps).where(eq(gameNightRsvps.gameNightId, n.id))).map((r) => r.userId));
  const who = members.filter((m) => going.has(m.userId) || !m.isMuted);
  await Promise.all(who.map((m) =>
    notify(m.userId, "lounge", {
      type: "game_night_soon",
      title: `${labelOf(n.kind)} in ${room?.name ?? "your room"} at ${when(new Date(n.startsAt)).split(" ").pop()}`,
      body: going.has(m.userId) ? "You're in. The game opens at the start." : "Tap “I'm in” to be in the game from the start.",
      url: `/lounge/group/${n.groupId}`,
      tag: `game-night-${n.id}`,
    }).catch(() => {}),
  ));
}

async function start(n: GameNight): Promise<void> {
  // Claimed first, so two servers never open the same night twice.
  const claimed = await db.update(gameNights).set({ status: "starting" })
    .where(and(eq(gameNights.id, n.id), eq(gameNights.status, "scheduled"))).returning({ id: gameNights.id });
  if (!claimed.length) return;
  const going = (await db.select({ userId: gameNightRsvps.userId }).from(gameNightRsvps).where(eq(gameNightRsvps.gameNightId, n.id))).map((r) => r.userId);
  let gameId: number;
  try {
    const game = await groupGames.createGame(n.groupId, n.hostId, n.kind as GroupGameKind, n.setup ?? {});
    gameId = game.id;
  } catch (e) {
    console.error(`[game-nights] couldn't open night ${n.id}:`, e);
    await db.update(gameNights).set({ status: "cancelled" }).where(eq(gameNights.id, n.id));
    notify(n.hostId, "lounge", {
      type: "game_night_failed",
      title: `${labelOf(n.kind)} couldn't start`,
      body: "Start it yourself from the room's games, if you're still around.",
      url: `/lounge/group/${n.groupId}/games`,
      tag: `game-night-${n.id}`,
    }).catch(() => {});
    return;
  }
  // The room fills at the start: everyone who said yes and is still in the room.
  for (const userId of going) await groupGames.joinGame(gameId, userId).catch(() => {});
  await db.update(gameNights).set({ status: "started", gameId }).where(eq(gameNights.id, n.id));
  await Promise.all(going.filter((u) => u !== n.hostId).map((userId) =>
    notify(userId, "lounge", {
      type: "game_night_on",
      title: `${labelOf(n.kind)} is on`,
      body: "You're already in. Tap to play.",
      url: `/lounge/group/${n.groupId}/games/${gameId}`,
      tag: `game-night-${n.id}`,
    }).catch(() => {}),
  ));
}

export async function runGameNightSweep(): Promise<{ reminded: number; started: number; dropped: number }> {
  const rows = await db.select().from(gameNights).where(eq(gameNights.status, "scheduled"));
  const now = Date.now();
  let reminded = 0, started = 0, dropped = 0;
  for (const n of rows) {
    const at = new Date(n.startsAt).getTime();
    if (at < now - GAME_NIGHT_ON_MS) {
      // The server was down through it: don't open a game hours late.
      await db.update(gameNights).set({ status: "cancelled" }).where(eq(gameNights.id, n.id));
      dropped++;
    } else if (at <= now) {
      await start(n);
      started++;
    } else if (!n.remindedAt && at - now <= GAME_NIGHT_REMIND_MS) {
      await remind(n);
      reminded++;
    }
  }
  return { reminded, started, dropped };
}

let timer: NodeJS.Timeout | null = null;
export function startGameNightSweep(): void {
  if (timer) return;
  const tick = () => runGameNightSweep().catch((e) => console.error("[game-nights] sweep failed:", e));
  setTimeout(tick, 20_000);
  timer = setInterval(tick, 60_000);
}

export function registerGameNightRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  const num = (v: string) => Number.parseInt(v, 10);

  app.get("/api/groups/:id/game-nights", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const out = await gameNightsFor(num(req.params.id), userId);
    if (!out) return res.sendStatus(404);
    res.json(out);
  });

  app.post("/api/groups/:id/game-nights", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const r = await scheduleGameNight(num(req.params.id), userId, req.body);
    if ("error" in r) return res.status(r.error).json({ message: r.message });
    res.status(201).json(r);
  });

  app.post("/api/game-nights/:id/rsvp", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const n = await nightFor(num(req.params.id));
    if (!n || !(await memberOf(n.groupId, userId))) return res.sendStatus(404);
    if (n.status !== "scheduled") return res.status(409).json({ message: n.status === "started" ? "It's already on. Jump in from the room." : "This game night was called off" });
    if (req.body?.going === false) {
      if (n.hostId === userId) return res.status(400).json({ message: "You're hosting. Call it off instead." });
      await db.delete(gameNightRsvps).where(and(eq(gameNightRsvps.gameNightId, n.id), eq(gameNightRsvps.userId, userId)));
    } else {
      await db.insert(gameNightRsvps).values({ gameNightId: n.id, userId }).onConflictDoNothing();
    }
    res.json({ ok: true });
  });

  app.delete("/api/game-nights/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const n = await nightFor(num(req.params.id));
    const me = n && (await memberOf(n.groupId, userId));
    if (!n || !me) return res.sendStatus(404);
    if (n.hostId !== userId && !isMod(me.role)) return res.status(403).json({ message: "Only the host or a room admin can call it off" });
    const done = await db.update(gameNights).set({ status: "cancelled" })
      .where(and(eq(gameNights.id, n.id), eq(gameNights.status, "scheduled"))).returning({ id: gameNights.id });
    if (!done.length) return res.status(409).json({ message: "It's already started or been called off" });
    const going = await db.select({ userId: gameNightRsvps.userId }).from(gameNightRsvps).where(eq(gameNightRsvps.gameNightId, n.id));
    await Promise.all(going.filter((g) => g.userId !== userId).map((g) =>
      notify(g.userId, "lounge", {
        type: "game_night_off",
        title: `${labelOf(n.kind)} on ${when(new Date(n.startsAt))} is off`,
        body: "The host called it off.",
        url: `/lounge/group/${n.groupId}`,
        tag: `game-night-${n.id}`,
      }).catch(() => {}),
    ));
    res.json({ ok: true });
  });
}
