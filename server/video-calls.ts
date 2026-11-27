// Video dates between two matched members. The caller pays: starting a call
// needs a paid plan and spends the caller's daily minutes (shared/entitlements
// videoMinutesPerDay); answering is free on every plan.
//
// The media goes phone-to-LiveKit-to-phone (LIVEKIT_URL / LIVEKIT_API_KEY /
// LIVEKIT_API_SECRET, set on Render) and is never recorded. This server only
// decides who may call whom, rings the other phone, hands each side a
// short-lived room ticket, and keeps the call's record in video_calls.
//
// Ringing: a push to the callee (tapping it opens /call/:id) plus the app's
// own check for incoming calls every few seconds while it's open
// (client/src/components/incoming-call.tsx).
import type { Express, Request } from "express";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import { videoCalls, profiles, type VideoCall } from "@shared/schema";
import { storage } from "./storage";
import * as gate from "./gate";
import { sendCategorizedPush } from "./push";

/** How long a call rings before it counts as missed. */
const RING_MS = 40_000;
/** A call neither phone has checked in on for this long is closed. */
const STALE_MS = 60_000;

const LIVE_STATUSES = ["ringing", "active"];

export function videoConfigured(): boolean {
  return !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}

/** Creates the table on first boot, so going live needs no manual migration.
 *  Matches the videoCalls definition in shared/schema.ts. */
export async function ensureVideoCallsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS video_calls (
      id serial PRIMARY KEY,
      match_id integer NOT NULL,
      caller_id varchar NOT NULL,
      callee_id varchar NOT NULL,
      status text NOT NULL DEFAULT 'ringing',
      created_at timestamp NOT NULL DEFAULT now(),
      answered_at timestamp,
      ended_at timestamp,
      last_seen_at timestamp,
      ended_by varchar
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS video_calls_callee_status_idx ON video_calls (callee_id, status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS video_calls_caller_created_idx ON video_calls (caller_id, created_at)`);
}

function roomName(callId: number) {
  return `destira-call-${callId}`;
}

function roomService(): RoomServiceClient | null {
  if (!videoConfigured()) return null;
  const host = process.env.LIVEKIT_URL!.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
}

/** Closes the LiveKit room so both phones drop at once. Best-effort. */
async function closeRoom(callId: number) {
  await roomService()?.deleteRoom(roomName(callId)).catch(() => {});
}

// Hangs the call up when the caller's minutes run out, even if the phone's
// own timer doesn't (it's switched off, or the app was killed mid-call).
const limitTimers = new Map<number, NodeJS.Timeout>();
function scheduleLimit(callId: number, ms: number) {
  if (limitTimers.has(callId)) return;
  const t = setTimeout(() => {
    limitTimers.delete(callId);
    void finish(callId, "ended", null);
  }, Math.max(0, ms) + 5_000);
  t.unref?.();
  limitTimers.set(callId, t);
}

/** Moves a live call to a final state (once) and closes its room. */
async function finish(callId: number, status: "ended" | "declined" | "cancelled" | "missed", by: string | null) {
  const [row] = await db
    .update(videoCalls)
    .set({ status, endedAt: new Date(), endedBy: by })
    .where(and(eq(videoCalls.id, callId), inArray(videoCalls.status, LIVE_STATUSES)))
    .returning();
  const t = limitTimers.get(callId);
  if (t) {
    clearTimeout(t);
    limitTimers.delete(callId);
  }
  if (row) await closeRoom(callId);
  return row;
}

/** Rings that ran out become missed; calls nobody's checking in on end.
 *  Run before reading call state, and from the sweep. */
export async function sweepVideoCalls(now = new Date()) {
  const missed = await db
    .update(videoCalls)
    .set({ status: "missed", endedAt: now })
    .where(and(eq(videoCalls.status, "ringing"), lt(videoCalls.createdAt, new Date(now.getTime() - RING_MS))))
    .returning({ id: videoCalls.id });
  const stale = await db
    .select({ id: videoCalls.id })
    .from(videoCalls)
    .where(and(eq(videoCalls.status, "active"), lt(videoCalls.lastSeenAt, new Date(now.getTime() - STALE_MS))));
  for (const s of stale) await finish(s.id, "ended", null);
  return { missed: missed.length, stale: stale.length };
}

async function liveCallFor(userId: string): Promise<VideoCall | undefined> {
  const [row] = await db
    .select()
    .from(videoCalls)
    .where(and(or(eq(videoCalls.callerId, userId), eq(videoCalls.calleeId, userId)), inArray(videoCalls.status, LIVE_STATUSES)))
    .orderBy(desc(videoCalls.createdAt))
    .limit(1);
  return row;
}

async function personCard(userId: string) {
  const [p] = await db
    .select({ displayName: profiles.displayName, photoUrl: profiles.coverPhotoUrl })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return { userId, name: p?.displayName || "Your match", photoUrl: p?.photoUrl ?? null };
}

/** What either phone sees about a call. */
async function view(call: VideoCall, me: string) {
  const otherId = call.callerId === me ? call.calleeId : call.callerId;
  const elapsedMs = call.answeredAt ? (call.endedAt ?? new Date()).getTime() - call.answeredAt.getTime() : 0;
  return {
    id: call.id,
    matchId: call.matchId,
    status: call.status,
    role: call.callerId === me ? "caller" : "callee",
    other: await personCard(otherId),
    createdAt: call.createdAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    seconds: Math.max(0, Math.round(elapsedMs / 1000)),
    endedBy: call.endedBy === me ? "me" : call.endedBy ? "them" : null,
  };
}

/** Seconds of video the caller has left today; null = no limit. */
async function callerSecondsLeft(callerId: string): Promise<number | null> {
  const g = await gate.checkGate(callerId, "video_call");
  if (g.limit == null) return null;
  const usedMs = await gate.videoMsUsedToday(callerId);
  return Math.max(0, Math.floor((g.limit * 60_000 - usedMs) / 1000));
}

export function registerVideoCallRoutes(app: Express, getUserId: (req: Request) => string | null) {
  // Whether this member can start a call right now, for the chat's video button.
  app.get("/api/calls/config", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const g = await gate.checkGate(userId, "video_call");
      res.json({
        enabled: videoConfigured(),
        canStart: g.ok,
        tier: g.tier,
        minutesPerDay: g.limit,
        minutesUsed: g.used ?? null,
      });
    } catch (e) {
      console.error("[video] config error:", e);
      res.status(500).json({ message: "Couldn't check video calls" });
    }
  });

  // Ring a match.
  app.post("/api/calls", async (req, res) => {
    const callerId = getUserId(req);
    if (!callerId) return res.sendStatus(401);
    const matchId = Number(req.body?.matchId);
    if (!Number.isInteger(matchId)) return res.status(400).json({ message: "Which match?" });
    try {
      if (!videoConfigured()) return res.status(503).json({ message: "Video dates aren't switched on yet." });
      const match = await storage.getMatch(matchId);
      if (!match || (match.user1Id !== callerId && match.user2Id !== callerId)) return res.status(404).json({ message: "Match not found" });
      if (match.status !== "matched") return res.status(400).json({ message: "You can video call once you've both matched." });
      const calleeId = match.user1Id === callerId ? match.user2Id : match.user1Id;
      if ((await storage.isBlocked(callerId, calleeId)) || (await storage.isBlocked(calleeId, callerId))) {
        return res.status(403).json({ message: "You can't call this person." });
      }
      if (await gate.denyIfGated(res, callerId, "video_call")) return;

      await sweepVideoCalls();
      const mine = await liveCallFor(callerId);
      if (mine) {
        // Tapping call twice (or reopening the app mid-ring) returns the same call.
        if (mine.matchId === matchId && mine.callerId === callerId) return res.status(200).json({ id: mine.id });
        return res.status(409).json({ message: "You're already in a call." });
      }
      if (await liveCallFor(calleeId)) return res.status(409).json({ message: "They're on another call. Try again in a bit." });

      // Times always from this server's clock (not the database's now()),
      // so ring timeouts compare like with like.
      const [call] = await db.insert(videoCalls).values({ matchId, callerId, calleeId, status: "ringing", createdAt: new Date() }).returning();
      res.status(201).json({ id: call.id });

      const caller = await personCard(callerId);
      sendCategorizedPush(calleeId, "messages", {
        title: `${caller.name} is video calling you`,
        body: "Tap to answer",
        url: `/call/${call.id}`,
        tag: `call-${call.id}`,
      }).catch(() => {});
    } catch (e) {
      console.error("[video] start error:", e);
      res.status(500).json({ message: "Couldn't start the call" });
    }
  });

  // The app checks this every few seconds while it's open.
  app.get("/api/calls/incoming", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const [call] = await db
        .select()
        .from(videoCalls)
        .where(and(
          eq(videoCalls.calleeId, userId),
          eq(videoCalls.status, "ringing"),
          gt(videoCalls.createdAt, new Date(Date.now() - RING_MS)),
        ))
        .orderBy(desc(videoCalls.createdAt))
        .limit(1);
      res.json({ call: call ? await view(call, userId) : null });
    } catch (e) {
      res.status(500).json({ message: "Couldn't check for calls" });
    }
  });

  async function loadOwn(req: Request, res: any): Promise<{ call: VideoCall; userId: string } | null> {
    const userId = getUserId(req);
    if (!userId) {
      res.sendStatus(401);
      return null;
    }
    const id = Number(req.params.id);
    const [call] = Number.isInteger(id) ? await db.select().from(videoCalls).where(eq(videoCalls.id, id)) : [];
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
      res.status(404).json({ message: "Call not found" });
      return null;
    }
    return { call, userId };
  }

  app.get("/api/calls/:id", async (req, res) => {
    try {
      await sweepVideoCalls();
      const own = await loadOwn(req, res);
      if (!own) return;
      res.json(await view(own.call, own.userId));
    } catch (e) {
      res.status(500).json({ message: "Couldn't load the call" });
    }
  });

  app.post("/api/calls/:id/accept", async (req, res) => {
    try {
      await sweepVideoCalls();
      const own = await loadOwn(req, res);
      if (!own) return;
      const { call, userId } = own;
      if (call.calleeId !== userId) return res.status(403).json({ message: "Only the person being called can answer." });
      const now = new Date();
      const [row] = await db
        .update(videoCalls)
        .set({ status: "active", answeredAt: now, lastSeenAt: now })
        .where(and(eq(videoCalls.id, call.id), eq(videoCalls.status, "ringing")))
        .returning();
      if (!row) return res.status(409).json({ message: "This call has already ended." });
      res.json(await view(row, userId));
    } catch (e) {
      console.error("[video] accept error:", e);
      res.status(500).json({ message: "Couldn't answer the call" });
    }
  });

  // Decline (callee, while ringing), cancel (caller, while ringing) or hang up.
  app.post("/api/calls/:id/end", async (req, res) => {
    try {
      const own = await loadOwn(req, res);
      if (!own) return;
      const { call, userId } = own;
      const status = call.status === "ringing" ? (call.calleeId === userId ? "declined" : "cancelled") : "ended";
      const row = (await finish(call.id, status, userId)) ?? call;
      res.json(await view(row, userId));
    } catch (e) {
      console.error("[video] end error:", e);
      res.status(500).json({ message: "Couldn't end the call" });
    }
  });

  // "Still here", every few seconds during a call.
  app.post("/api/calls/:id/alive", async (req, res) => {
    try {
      const own = await loadOwn(req, res);
      if (!own) return;
      const { call, userId } = own;
      if (call.status === "active") {
        await db.update(videoCalls).set({ lastSeenAt: new Date() }).where(eq(videoCalls.id, call.id));
      }
      res.json(await view(call, userId));
    } catch (e) {
      res.status(500).json({ message: "Couldn't update the call" });
    }
  });

  // The ticket into the call's room, once it's been answered.
  app.post("/api/calls/:id/token", async (req, res) => {
    try {
      const own = await loadOwn(req, res);
      if (!own) return;
      const { call, userId } = own;
      if (call.status !== "active") return res.status(409).json({ message: "This call isn't connected." });
      if (!videoConfigured()) return res.status(503).json({ message: "Video dates aren't switched on yet." });

      const left = await callerSecondsLeft(call.callerId);
      if (left !== null && left <= 0) {
        await finish(call.id, "ended", null);
        return res.status(403).json({ message: "The video minutes for today have run out." });
      }
      if (left !== null && call.answeredAt) scheduleLimit(call.id, left * 1000);

      const me = await personCard(userId);
      const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
        identity: userId,
        name: me.name,
        // Long enough to join and rejoin after a dropped connection; the
        // call itself is limited by the caller's minutes, above.
        ttl: "2h",
      });
      at.addGrant({ room: roomName(call.id), roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
      res.json({
        url: process.env.LIVEKIT_URL,
        token: await at.toJwt(),
        // The caller's remaining time, so both phones can show and enforce it.
        secondsLeft: left,
      });
    } catch (e) {
      console.error("[video] token error:", e);
      res.status(500).json({ message: "Couldn't connect the call" });
    }
  });
}
