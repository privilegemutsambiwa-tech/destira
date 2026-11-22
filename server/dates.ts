// Conversations that become dates (docs/destira-3-upgrade-prompt.md Part E):
// - "Let's meet": a proposal (coffee, lunch, a walk, or an upcoming Destira
//   event) at a public place near both of them, with up to 3 times. The other
//   person picks one and it becomes a confirmed card in the chat (Add to
//   calendar and Share my date are built from it on the phone).
// - The private "How did it go?" the day after a confirmed date.
// - The quiet-chat nudge: once per chat, ever.
import type { Express } from "express";
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import * as safety from "./safety";
import * as push from "./push";
import { harareDay } from "./matching";
import { dateCheckins, datePlans, directMessages, events, matches, places, profiles, type DirectMessage } from "@shared/schema";
import {
  CHECKIN_ANSWERS, DATE_KINDS, DATE_MAX_DAYS_AHEAD, DATE_MAX_TIMES,
  dateTimeLabel, planTitle, type CheckinAnswer, type DateKind, type DatePlanView,
} from "@shared/date-plan";

const rows = (r: any) => (r?.rows ?? r ?? []) as any[];
const HARARE_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;
const harareHour = (at = new Date()) => new Date(at.getTime() + HARARE_UTC_OFFSET_MS).getUTCHours();
const firstName = (n?: string | null) => (n || "Your match").trim().split(/\s+/)[0];

export function presentPlan(p: typeof datePlans.$inferSelect): DatePlanView {
  return {
    id: p.id,
    matchId: p.matchId,
    proposerId: p.proposerId,
    kind: p.kind as DateKind,
    placeName: p.placeName,
    placeDetail: p.placeDetail,
    eventId: p.eventId,
    times: p.times ?? [],
    startsAt: p.startsAt ? p.startsAt.toISOString() : null,
    status: p.status as DatePlanView["status"],
  };
}

/** The plans behind date cards in a page of messages, by message id. */
export async function plansForMessages(msgs: DirectMessage[]): Promise<Map<number, DatePlanView>> {
  const ids = msgs.filter((m) => m.contentType === "date").map((m) => m.id);
  if (ids.length === 0) return new Map();
  const found = await db.select().from(datePlans).where(inArray(datePlans.messageId, ids));
  return new Map(found.map((p) => [p.messageId!, presentPlan(p)]));
}

// ── where to meet ─────────────────────────────────────────────────────

// Public, busy, daytime-friendly spots for a walk. Malls and cafés come
// from the places table (server/events.ts seedPlaces).
const WALKS = [
  { name: "Harare Gardens", suburb: "CBD", city: "Harare", lat: -17.8256, lng: 31.0436 },
  { name: "National Botanic Garden", suburb: "Alexandra Park", city: "Harare", lat: -17.7964, lng: 31.0503 },
  { name: "Mukuvisi Woodlands", suburb: "Hillside", city: "Harare", lat: -17.8412, lng: 31.0919 },
  { name: "Centenary Park", suburb: "CBD", city: "Bulawayo", lat: -20.1592, lng: 28.5917 },
  { name: "Hillside Dams", suburb: "Hillside", city: "Bulawayo", lat: -20.1876, lng: 28.61 },
];
const MEET_TYPES = ["mall", "cafe", "venue"];

type Spot = { name: string; detail: string; suburb: string; city: string; distKm: number | null };

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Places between the two of them (or near whichever has a location),
 *  falling back to matching their town by name. */
export async function suggestSpots(viewerId: string, otherId: string, kind: DateKind): Promise<Spot[]> {
  const ps = await db.select({ lat: profiles.locationLat, lng: profiles.locationLng, location: profiles.location, name: profiles.locationName })
    .from(profiles).where(inArray(profiles.userId, [viewerId, otherId]));
  const pts = ps.filter((p) => p.lat != null && p.lng != null).map((p) => [Number(p.lat), Number(p.lng)] as const);
  const mid = pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] as const : null;
  const towns = ps.map((p) => `${p.location ?? ""} ${p.name ?? ""}`.toLowerCase()).join(" ");

  const candidates: { name: string; suburb: string; city: string; lat: number | null; lng: number | null }[] = [];
  if (kind === "walk") candidates.push(...WALKS);
  const dbPlaces = await db.select().from(places).where(inArray(places.placeType, MEET_TYPES)).orderBy(asc(places.name)).limit(200);
  for (const p of dbPlaces) candidates.push({ name: p.name, suburb: p.suburb, city: p.city, lat: p.lat != null ? Number(p.lat) : null, lng: p.lng != null ? Number(p.lng) : null });

  const scored = candidates.map((c) => {
    const distKm = mid && c.lat != null && c.lng != null ? km(mid[0], mid[1], c.lat, c.lng) : null;
    const townHit = towns.includes(c.suburb.toLowerCase()) ? 2 : towns.includes(c.city.toLowerCase()) ? 1 : 0;
    return { name: c.name, detail: c.suburb === "CBD" ? `${c.city} CBD` : `${c.suburb}, ${c.city}`, suburb: c.suburb, city: c.city, distKm, townHit, walk: WALKS.some((w) => w.name === c.name) };
  });
  scored.sort((a, b) =>
    kind === "walk" && a.walk !== b.walk ? (a.walk ? -1 : 1)
    : a.distKm != null && b.distKm != null ? a.distKm - b.distKm
    : a.distKm != null ? -1 : b.distKm != null ? 1
    : b.townHit - a.townHit || (a.city === "Harare" ? -1 : 0) - (b.city === "Harare" ? -1 : 0));
  const seen = new Set<string>();
  return scored.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true))).slice(0, 6)
    .map(({ name, detail, suburb, city, distKm }) => ({ name, detail, suburb, city, distKm: distKm != null ? Math.round(distKm * 10) / 10 : null }));
}

async function upcomingEvents(limit = 6) {
  return db.select({ id: events.id, title: events.title, venueName: events.venueName, suburb: events.suburb, city: events.city, startsAt: events.startsAt })
    .from(events)
    .where(and(eq(events.status, "published"), eq(events.visibility, "public"), gt(events.startsAt, sql`now() + interval '1 hour'`), lt(events.startsAt, sql`now() + make_interval(days => ${DATE_MAX_DAYS_AHEAD})`)))
    .orderBy(asc(events.startsAt)).limit(limit);
}

// ── helpers ───────────────────────────────────────────────────────────

async function inMatch(matchId: number, userId: string) {
  const m = await storage.getMatch(matchId);
  if (!m || m.status !== "matched" || (m.user1Id !== userId && m.user2Id !== userId)) return null;
  return { match: m, otherId: m.user1Id === userId ? m.user2Id : m.user1Id };
}

async function nameOf(userId: string): Promise<string> {
  const [p] = await db.select({ n: profiles.displayName }).from(profiles).where(eq(profiles.userId, userId));
  return firstName(p?.n);
}

function notify(userId: string, matchId: number, title: string, body: string) {
  push.sendCategorizedPush(userId, "messages", { title, body, url: `/chat/${matchId}`, tag: `dm-${matchId}` }).catch(() => {});
}

function cleanTimes(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > DATE_MAX_TIMES) return null;
  const now = Date.now();
  const out = new Set<string>();
  for (const t of raw) {
    const d = new Date(String(t));
    const ms = d.getTime();
    if (!Number.isFinite(ms) || ms < now + 30 * 60_000 || ms > now + DATE_MAX_DAYS_AHEAD * 86_400_000) return null;
    out.add(d.toISOString());
  }
  return Array.from(out).sort();
}

/** "coffee at Sam Levy's Village", for the middle of a sentence. */
const inSentence = (p: { kind: string; placeName: string }) => {
  const t = planTitle(p as any);
  return p.kind === "event" ? t : t[0].toLowerCase() + t.slice(1);
};

const cardText = (p: { kind: string; placeName: string; startsAt?: Date | null; status: string }) =>
  p.status === "confirmed" && p.startsAt
    ? `Date: ${planTitle(p as any)}, ${dateTimeLabel(p.startsAt.toISOString())}`
    : `Date idea: ${planTitle(p as any)}`;

// ── the daily jobs ────────────────────────────────────────────────────

/** One gentle push to whoever owes a reply in a chat with real back-and-forth
 *  (3+ messages each) that's been quiet for 48 hours. Once per chat, ever. */
export async function runQuietNudges(opts: { ignoreHours?: boolean } = {}): Promise<number> {
  const hour = harareHour();
  if (!opts.ignoreHours && (hour < 9 || hour >= 20)) return 0; // never at night
  const due = rows(await db.execute(sql`
    with last as (
      select distinct on (dm.match_id) dm.match_id, dm.sender_id, dm.content, dm.content_type, dm.created_at
      from direct_messages dm
      where dm.unsent_at is null and dm.created_at > now() - interval '14 days'
      order by dm.match_id, dm.created_at desc, dm.id desc
    )
    select l.match_id, l.sender_id, l.content, l.content_type, m.user1_id, m.user2_id
    from last l join matches m on m.id = l.match_id
    where m.status = 'matched'
      and m.quiet_nudged_at is null
      and l.created_at < now() - interval '48 hours'
      and (select count(*) from direct_messages d where d.match_id = m.id and d.sender_id = m.user1_id and d.unsent_at is null) >= 3
      and (select count(*) from direct_messages d where d.match_id = m.id and d.sender_id = m.user2_id and d.unsent_at is null) >= 3
      -- Planning or just had a date: the check-in is the message, not this.
      and not exists (select 1 from date_plans dp where dp.match_id = m.id and dp.status = 'confirmed' and dp.starts_at > now() - interval '7 days')
    limit 200
  `));
  let sent = 0;
  for (const r of due) {
    // Claimed first, so a restart or a second server can't push it twice.
    const claimed = await db.update(matches).set({ quietNudgedAt: sql`now()` })
      .where(and(eq(matches.id, r.match_id), isNull(matches.quietNudgedAt))).returning({ id: matches.id });
    if (claimed.length === 0) continue;
    const owes = r.sender_id === r.user1_id ? r.user2_id : r.user1_id;
    const sender = await nameOf(r.sender_id);
    const last = r.content_type === "photo" ? "a photo" : r.content_type === "voice" ? "a voice note" : r.content_type === "date" ? "a date idea" : `“${String(r.content).slice(0, 80)}${String(r.content).length > 80 ? "…" : ""}”`;
    notify(owes, r.match_id, `Pick it back up with ${sender}?`, `${sender}'s last message: ${last}`);
    sent++;
  }
  return sent;
}

/** The morning after a confirmed date: "How did it go?" to both, once. */
export async function runDateCheckins(opts: { ignoreHours?: boolean } = {}): Promise<number> {
  if (!opts.ignoreHours && harareHour() < 10) return 0;
  const today = harareDay();
  const candidates = await db.select().from(datePlans).where(and(
    eq(datePlans.status, "confirmed"),
    isNull(datePlans.checkinPushedAt),
    gt(datePlans.startsAt, sql`now() - interval '7 days'`),
    lt(datePlans.startsAt, sql`now()`),
  ));
  let sent = 0;
  for (const p of candidates) {
    if (!p.startsAt || harareDay(p.startsAt) >= today) continue; // the next day, not the same evening
    const claimed = await db.update(datePlans).set({ checkinPushedAt: sql`now()` })
      .where(and(eq(datePlans.id, p.id), isNull(datePlans.checkinPushedAt))).returning({ id: datePlans.id });
    if (claimed.length === 0) continue;
    const m = await storage.getMatch(p.matchId);
    if (!m || m.status !== "matched") continue;
    for (const [me, other] of [[m.user1Id, m.user2Id], [m.user2Id, m.user1Id]]) {
      notify(me, p.matchId, `How did it go with ${await nameOf(other)}?`, "Just between you and Destira. They won't see your answer.");
    }
    sent++;
  }
  return sent;
}

let started = false;
export function startDateSweeps() {
  if (started) return;
  started = true;
  const tick = async () => {
    try {
      const n = await runQuietNudges();
      const c = await runDateCheckins();
      if (n || c) console.log(`[dates] quiet nudges ${n}, date check-ins ${c}`);
    } catch (e) {
      console.error("[dates] sweep failed:", e);
    }
  };
  setTimeout(tick, 90_000);
  setInterval(tick, 60 * 60 * 1000);
}

// ── routes ────────────────────────────────────────────────────────────

export function registerDateRoutes(app: Express, getUserId: (req: any) => string | null) {
  // Where to meet, and Destira events coming up.
  app.get("/api/dates/:matchId/ideas", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const kind = (DATE_KINDS as readonly string[]).includes(String(req.query.kind)) ? (req.query.kind as DateKind) : "coffee";
    try {
      const m = await inMatch(parseInt(req.params.matchId), userId);
      if (!m) return res.sendStatus(403);
      const [spots, evs] = await Promise.all([kind === "event" ? [] : suggestSpots(userId, m.otherId, kind), kind === "event" ? upcomingEvents() : []]);
      res.json({
        spots,
        events: evs.map((e) => ({ id: e.id, title: e.title, where: [e.venueName, e.suburb, e.city].filter(Boolean).join(", "), startsAt: e.startsAt.toISOString() })),
      });
    } catch (e) {
      console.error("[dates] ideas failed:", e);
      res.status(500).json({ message: "Couldn't load ideas" });
    }
  });

  // Propose. Replaces any open proposal in this chat.
  app.post("/api/dates/:matchId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.matchId);
    const kind = req.body?.kind as DateKind;
    if (!(DATE_KINDS as readonly string[]).includes(kind)) return res.status(400).json({ message: "Pick what kind of date" });
    try {
      const m = await inMatch(matchId, userId);
      if (!m) return res.sendStatus(403);
      if (await safety.blockIfHeld(res, userId)) return;
      let placeName: string;
      let placeDetail: string | null;
      let eventId: number | null = null;
      let times: string[] | null;
      if (kind === "event") {
        const [ev] = await db.select().from(events).where(and(eq(events.id, Number(req.body?.eventId)), eq(events.status, "published"), eq(events.visibility, "public"), gt(events.startsAt, sql`now()`)));
        if (!ev) return res.status(400).json({ message: "That event isn't open any more" });
        placeName = ev.title;
        placeDetail = [ev.venueName, ev.suburb, ev.city].filter(Boolean).join(", ") || null;
        eventId = ev.id;
        times = [ev.startsAt.toISOString()];
      } else {
        placeName = typeof req.body?.placeName === "string" ? req.body.placeName.trim().slice(0, 80) : "";
        placeDetail = typeof req.body?.placeDetail === "string" ? req.body.placeDetail.trim().slice(0, 120) || null : null;
        if (placeName.length < 2) return res.status(400).json({ message: "Say where" });
        times = cleanTimes(req.body?.times);
        if (!times) return res.status(400).json({ message: `Offer 1 to ${DATE_MAX_TIMES} times, from half an hour from now up to ${DATE_MAX_DAYS_AHEAD} days ahead` });
      }
      const text = `Date idea: ${planTitle({ kind, placeName })}`;
      const out = await db.transaction(async (tx) => {
        await tx.update(datePlans).set({ status: "replaced", respondedAt: sql`now()` })
          .where(and(eq(datePlans.matchId, matchId), eq(datePlans.status, "proposed")));
        const [msg] = await tx.insert(directMessages).values({ matchId, senderId: userId, content: text, contentType: "date" }).returning();
        const [plan] = await tx.insert(datePlans).values({ matchId, proposerId: userId, kind, placeName, placeDetail, eventId, times, messageId: msg.id }).returning();
        return { msg, plan };
      });
      res.status(201).json({ messageId: out.msg.id, plan: presentPlan(out.plan) });
      safety.scanText({ senderId: userId, text: `${placeName} ${placeDetail ?? ""}`, source: "dm", refId: out.msg.id, recipientId: m.otherId }).catch(() => {});
      notify(m.otherId, matchId, await nameOf(userId), `Suggested ${inSentence({ kind, placeName })}. Pick a time?`);
    } catch (e) {
      console.error("[dates] propose failed:", e);
      res.status(500).json({ message: "Couldn't send that" });
    }
  });

  async function loadPlan(id: number, userId: string) {
    const [p] = await db.select().from(datePlans).where(eq(datePlans.id, id));
    if (!p) return null;
    const m = await inMatch(p.matchId, userId);
    if (!m) return null;
    return { p, ...m };
  }

  async function syncCard(p: typeof datePlans.$inferSelect) {
    if (p.messageId) await db.update(directMessages).set({ content: cardText(p) }).where(eq(directMessages.id, p.messageId));
  }

  // The other person picks a time.
  app.post("/api/dates/plan/:id/confirm", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const l = await loadPlan(parseInt(req.params.id), userId);
      if (!l) return res.sendStatus(404);
      if (l.p.proposerId === userId) return res.status(403).json({ message: "The other person confirms" });
      if (l.p.status !== "proposed") return res.status(409).json({ message: "This plan has changed. Have a look at the chat." });
      const time = new Date(String(req.body?.time ?? "")).toISOString?.();
      if (!time || !(l.p.times ?? []).includes(time)) return res.status(400).json({ message: "Pick one of the times offered" });
      if (new Date(time).getTime() < Date.now()) return res.status(409).json({ message: "That time has passed. Suggest another?" });
      const [p] = await db.update(datePlans).set({ status: "confirmed", startsAt: new Date(time), respondedAt: sql`now()` })
        .where(and(eq(datePlans.id, l.p.id), eq(datePlans.status, "proposed"))).returning();
      if (!p) return res.status(409).json({ message: "This plan has changed. Have a look at the chat." });
      await syncCard(p);
      res.json(presentPlan(p));
      notify(p.proposerId, p.matchId, `${await nameOf(userId)} said yes`, `${planTitle(p as any)}, ${dateTimeLabel(time)}`);
    } catch (e) {
      res.status(500).json({ message: "Couldn't confirm" });
    }
  });

  app.post("/api/dates/plan/:id/decline", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const l = await loadPlan(parseInt(req.params.id), userId);
      if (!l) return res.sendStatus(404);
      if (l.p.proposerId === userId) return res.status(403).json({ message: "Cancel it instead" });
      const [p] = await db.update(datePlans).set({ status: "declined", respondedAt: sql`now()` })
        .where(and(eq(datePlans.id, l.p.id), eq(datePlans.status, "proposed"))).returning();
      if (!p) return res.status(409).json({ message: "This plan has changed. Have a look at the chat." });
      res.json(presentPlan(p));
      notify(p.proposerId, p.matchId, await nameOf(userId), `Can't make ${inSentence(p)}. Maybe another time or place?`);
    } catch (e) {
      res.status(500).json({ message: "Couldn't decline" });
    }
  });

  // Either of them, before it happens.
  app.post("/api/dates/plan/:id/cancel", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const l = await loadPlan(parseInt(req.params.id), userId);
      if (!l) return res.sendStatus(404);
      if (l.p.status === "proposed" && l.p.proposerId !== userId) return res.status(403).json({ message: "Decline it instead" });
      const [p] = await db.update(datePlans).set({ status: "cancelled", respondedAt: sql`now()` })
        .where(and(eq(datePlans.id, l.p.id), inArray(datePlans.status, ["proposed", "confirmed"]))).returning();
      if (!p) return res.status(409).json({ message: "This plan has changed. Have a look at the chat." });
      await syncCard({ ...p, status: "proposed" }); // the preview goes back to "Date idea"
      res.json(presentPlan(p));
      if (l.p.status === "confirmed") notify(l.otherId, p.matchId, `${await nameOf(userId)} cancelled`, `${planTitle(p as any)}${p.startsAt ? `, ${dateTimeLabel(p.startsAt.toISOString())}` : ""}`);
    } catch (e) {
      res.status(500).json({ message: "Couldn't cancel" });
    }
  });

  // Check-ins waiting for this member in this chat (private to them).
  app.get("/api/dates/:matchId/checkins", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const m = await inMatch(parseInt(req.params.matchId), userId);
      if (!m) return res.sendStatus(403);
      const today = harareDay();
      const plans = await db.select().from(datePlans).where(and(
        eq(datePlans.matchId, m.match.id),
        eq(datePlans.status, "confirmed"),
        gt(datePlans.startsAt, sql`now() - interval '7 days'`),
        lt(datePlans.startsAt, sql`now()`),
      )).orderBy(desc(datePlans.startsAt));
      const answered = new Set((plans.length
        ? await db.select({ planId: dateCheckins.planId }).from(dateCheckins).where(and(eq(dateCheckins.userId, userId), inArray(dateCheckins.planId, plans.map((p) => p.id))))
        : []).map((r) => r.planId));
      res.setHeader("Cache-Control", "no-store");
      res.json(plans.filter((p) => p.startsAt && harareDay(p.startsAt) < today && !answered.has(p.id)).map(presentPlan));
    } catch (e) {
      res.status(500).json({ message: "Couldn't load" });
    }
  });

  app.post("/api/dates/plan/:id/checkin", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const answer = req.body?.answer as CheckinAnswer;
    if (!(CHECKIN_ANSWERS as readonly string[]).includes(answer)) return res.status(400).json({ message: "Pick an answer" });
    try {
      const l = await loadPlan(parseInt(req.params.id), userId);
      if (!l) return res.sendStatus(404);
      if (l.p.status !== "confirmed" || !l.p.startsAt || l.p.startsAt.getTime() > Date.now()) return res.status(409).json({ message: "This date hasn't happened yet" });
      await db.insert(dateCheckins).values({ planId: l.p.id, userId, answer })
        .onConflictDoUpdate({ target: [dateCheckins.planId, dateCheckins.userId], set: { answer, createdAt: sql`now()` } });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Couldn't save that" });
    }
  });
}
