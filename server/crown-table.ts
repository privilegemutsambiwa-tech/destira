// Crown Table, the member side (shared/crown-table.ts; console in server/admin/crown-table.ts).
//   GET  /api/crown/table                       upcoming dinners: as a Crown member, or as someone's guest
//   POST /api/crown/table/:id/seat              { going } Crown only
//   POST /api/crown/table/:id/guest             { userId | null } bring one of your matches (or withdraw the ask)
//   POST /api/crown/table/:id/guest-answer      { yes } the guest's answer
// Plus the reserved-seat rule for official events (crownSkipsWaitlist).
import type { Express, Request } from "express";
import { and, asc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import { blockedUsers, crownDinnerSeats, crownDinners, matches, places, profiles, type CrownDinner } from "@shared/schema";
import { CROWN_DINNER_CHANGE_CUTOFF_H, type CrownDinnerView, type CrownTableMe } from "@shared/crown-table";
import { activeCrownIds, isCrown } from "./crown";
import { notify } from "./push";

type Fail = { error: number; message: string };
const HOLDS = ["going", "invited"];
const firstName = (n: string | null | undefined) => (n || "").trim().split(/\s+/)[0] || "Someone";
const whenLabel = (d: Date) => d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" });

export const canChange = (d: Pick<CrownDinner, "startsAt" | "status">, now = Date.now()) =>
  d.status === "scheduled" && d.startsAt.getTime() - now > CROWN_DINNER_CHANGE_CUTOFF_H * 3600e3;

async function names(ids: string[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids));
  if (!uniq.length) return new Map();
  const ps = await db.select({ userId: profiles.userId, displayName: profiles.displayName }).from(profiles).where(inArray(profiles.userId, uniq));
  return new Map(ps.map((p) => [p.userId, firstName(p.displayName)]));
}

/** People this member has a match with (love or friends), minus blocks and Crown members. */
async function guestOptions(userId: string): Promise<{ userId: string; name: string }[]> {
  const ms = await db.select({ a: matches.user1Id, b: matches.user2Id }).from(matches)
    .where(and(eq(matches.status, "matched"), or(eq(matches.user1Id, userId), eq(matches.user2Id, userId))));
  const blocks = await db.select({ a: blockedUsers.blockerId, b: blockedUsers.blockedId }).from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId)));
  const blocked = new Set(blocks.map((r) => (r.a === userId ? r.b : r.a)));
  const crown = await activeCrownIds();
  const ids = Array.from(new Set(ms.map((m) => (m.a === userId ? m.b : m.a)))).filter((id) => !blocked.has(id) && !crown.has(id));
  if (!ids.length) return [];
  const ps = await db.select({ userId: profiles.userId, displayName: profiles.displayName, moderationStatus: profiles.moderationStatus })
    .from(profiles).where(inArray(profiles.userId, ids));
  return ps.filter((p) => p.moderationStatus === "active").map((p) => ({ userId: p.userId, name: firstName(p.displayName) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function seatsHeld(dinnerId: number): Promise<number> {
  const rows = await db.select({ id: crownDinnerSeats.id }).from(crownDinnerSeats)
    .where(and(eq(crownDinnerSeats.dinnerId, dinnerId), inArray(crownDinnerSeats.status, HOLDS)));
  return rows.length;
}

async function crownTableMe(userId: string): Promise<CrownTableMe> {
  const crown = await isCrown(userId);
  const now = new Date();
  const mySeats = await db.select().from(crownDinnerSeats).where(eq(crownDinnerSeats.userId, userId));
  const asGuest = mySeats.filter((s) => s.guestOf).map((s) => s.dinnerId);
  const dinners = await db.select().from(crownDinners).where(and(
    gte(crownDinners.startsAt, new Date(now.getTime() - 3 * 3600e3)),
    crown ? sql`true` : inArray(crownDinners.id, asGuest.length ? asGuest : [-1]),
  )).orderBy(asc(crownDinners.startsAt));
  // A guest never sees a dinner they weren't asked to (or a cancelled one they'd said no to).
  const ids = dinners.map((d) => d.id);
  const all = ids.length ? await db.select().from(crownDinnerSeats).where(inArray(crownDinnerSeats.dinnerId, ids)) : [];
  const placeIds = dinners.map((d) => d.placeId).filter((x): x is number => x != null);
  const offers = placeIds.length ? await db.select({ id: places.id, offer: places.partnerOffer }).from(places).where(inArray(places.id, placeIds)) : [];
  const crownIds = await activeCrownIds();
  const nm = await names(all.map((s) => s.userId).concat(all.map((s) => s.guestOf ?? "").filter(Boolean)));

  const out: CrownDinnerView[] = [];
  for (const d of dinners) {
    const seats = all.filter((s) => s.dinnerId === d.id);
    const me = seats.find((s) => s.userId === userId);
    const role: "crown" | "guest" = crown && !me?.guestOf ? "crown" : "guest";
    if (role === "guest" && (!me || me.status === "cancelled")) continue;
    if (d.status === "cancelled" && !me) continue;
    const guestRow = role === "crown"
      ? seats.find((s) => s.guestOf === userId && HOLDS.includes(s.status)) ?? seats.find((s) => s.guestOf === userId && s.status === "declined")
      : undefined;
    const going = seats.filter((s) => s.status === "going");
    out.push({
      id: d.id,
      title: d.title,
      venueName: d.venueName,
      venueDetail: d.venueDetail,
      partnerOffer: offers.find((o) => o.id === d.placeId)?.offer ?? null,
      startsAt: d.startsAt.toISOString(),
      note: d.note,
      status: d.status as CrownDinnerView["status"],
      cancelReason: d.cancelReason,
      seats: d.seats,
      seatsLeft: Math.max(0, d.seats - seats.filter((s) => HOLDS.includes(s.status)).length),
      role,
      mine: (me?.status as CrownDinnerView["mine"]) ?? null,
      guest: guestRow ? { userId: guestRow.userId, name: nm.get(guestRow.userId) ?? "Someone", status: guestRow.status as any } : null,
      invitedBy: me?.guestOf ? nm.get(me.guestOf) ?? "A Crown member" : null,
      coming: me?.status === "going"
        ? going.map((s) => ({ userId: s.userId, name: nm.get(s.userId) ?? "Someone", crown: !s.guestOf && crownIds.has(s.userId) }))
        : [],
      canChange: canChange(d),
    });
  }
  return { crown, dinners: out, guestOptions: crown ? await guestOptions(userId) : [] };
}

async function dinnerOf(id: number): Promise<CrownDinner | null> {
  const [d] = await db.select().from(crownDinners).where(eq(crownDinners.id, id));
  return d ?? null;
}

async function setSeat(userId: string, id: number, going: boolean): Promise<{ status: string } | Fail> {
  if (!(await isCrown(userId))) return { error: 403, message: "Crown Table is for Crown members." };
  const d = await dinnerOf(id);
  if (!d) return { error: 404, message: "Not found" };
  if (!canChange(d)) return { error: 409, message: d.status === "cancelled" ? "This dinner is off." : "Seats are settled this close to the dinner." };
  return db.transaction(async (tx) => {
    await tx.select({ id: crownDinners.id }).from(crownDinners).where(eq(crownDinners.id, id)).for("update");
    const [me] = await tx.select().from(crownDinnerSeats).where(and(eq(crownDinnerSeats.dinnerId, id), eq(crownDinnerSeats.userId, userId)));
    if (me?.guestOf) return { error: 409, message: "You're someone's guest at this one." } as Fail;
    if (!going) {
      if (me) await tx.update(crownDinnerSeats).set({ status: "cancelled" }).where(eq(crownDinnerSeats.id, me.id));
      // Your guest's seat goes with yours.
      const [g] = await tx.update(crownDinnerSeats).set({ status: "cancelled" })
        .where(and(eq(crownDinnerSeats.dinnerId, id), eq(crownDinnerSeats.guestOf, userId), inArray(crownDinnerSeats.status, HOLDS)))
        .returning({ userId: crownDinnerSeats.userId });
      if (g) notify(g.userId, "account", { type: "crown_table", title: `${d.title} is off for you`, body: "The person who asked you can't make it now.", url: "/crown/table", tag: `crown-dinner-${id}` }).catch(() => {});
      return { status: "cancelled" };
    }
    if (me?.status === "going") return { status: "going" };
    const held = (await tx.select({ id: crownDinnerSeats.id }).from(crownDinnerSeats)
      .where(and(eq(crownDinnerSeats.dinnerId, id), inArray(crownDinnerSeats.status, HOLDS)))).length;
    if (held >= d.seats) return { error: 409, message: "Every seat is taken." } as Fail;
    if (me) await tx.update(crownDinnerSeats).set({ status: "going" }).where(eq(crownDinnerSeats.id, me.id));
    else await tx.insert(crownDinnerSeats).values({ dinnerId: id, userId, status: "going", createdAt: new Date() });
    return { status: "going" };
  });
}

async function askGuest(userId: string, id: number, guestId: string | null): Promise<{ status: string } | Fail> {
  if (!(await isCrown(userId))) return { error: 403, message: "Crown Table is for Crown members." };
  const d = await dinnerOf(id);
  if (!d) return { error: 404, message: "Not found" };
  if (!canChange(d)) return { error: 409, message: "Guests are settled this close to the dinner." };
  const allowed = guestId ? (await guestOptions(userId)).some((g) => g.userId === guestId) : true;
  const host = (await names([userId])).get(userId) ?? "A Crown member";
  return db.transaction(async (tx) => {
    await tx.select({ id: crownDinners.id }).from(crownDinners).where(eq(crownDinners.id, id)).for("update");
    const [me] = await tx.select().from(crownDinnerSeats).where(and(eq(crownDinnerSeats.dinnerId, id), eq(crownDinnerSeats.userId, userId)));
    if (me?.status !== "going") return { error: 409, message: "Take your own seat first." } as Fail;
    const [current] = await tx.select().from(crownDinnerSeats)
      .where(and(eq(crownDinnerSeats.dinnerId, id), eq(crownDinnerSeats.guestOf, userId), inArray(crownDinnerSeats.status, HOLDS)));
    if (!guestId) {
      // Withdraw the ask, or clear a "can't make it" to ask someone else.
      await tx.update(crownDinnerSeats).set({ status: "cancelled" })
        .where(and(eq(crownDinnerSeats.dinnerId, id), eq(crownDinnerSeats.guestOf, userId), inArray(crownDinnerSeats.status, [...HOLDS, "declined"])));
      return { status: "none" };
    }
    if (current) return { error: 409, message: "One guest each. Withdraw the first ask to ask someone else." } as Fail;
    if (!allowed) return { error: 403, message: "You can bring someone you've matched with." } as Fail;
    const [theirs] = await tx.select().from(crownDinnerSeats).where(and(eq(crownDinnerSeats.dinnerId, id), eq(crownDinnerSeats.userId, guestId)));
    if (theirs && theirs.status !== "cancelled") return { error: 409, message: "They've already been asked to this one." } as Fail;
    const held = (await tx.select({ id: crownDinnerSeats.id }).from(crownDinnerSeats)
      .where(and(eq(crownDinnerSeats.dinnerId, id), inArray(crownDinnerSeats.status, HOLDS)))).length;
    if (held >= d.seats) return { error: 409, message: "Every seat is taken." } as Fail;
    if (theirs) await tx.update(crownDinnerSeats).set({ status: "invited", guestOf: userId, createdAt: new Date() }).where(eq(crownDinnerSeats.id, theirs.id));
    else await tx.insert(crownDinnerSeats).values({ dinnerId: id, userId: guestId, guestOf: userId, status: "invited", createdAt: new Date() });
    notify(guestId, "account", {
      type: "crown_table",
      title: `${host} would like you at ${d.title}`,
      body: `${whenLabel(d.startsAt)} at ${d.venueName}. Everyone pays the venue for their own food.`,
      url: "/crown/table",
      tag: `crown-dinner-${id}`,
    }).catch(() => {});
    return { status: "invited" };
  });
}

async function guestAnswer(userId: string, id: number, yes: boolean): Promise<{ status: string } | Fail> {
  const d = await dinnerOf(id);
  if (!d) return { error: 404, message: "Not found" };
  const [me] = await db.select().from(crownDinnerSeats).where(and(eq(crownDinnerSeats.dinnerId, id), eq(crownDinnerSeats.userId, userId)));
  if (!me?.guestOf || me.status === "cancelled") return { error: 404, message: "Not found" };
  if (!canChange(d)) return { error: 409, message: d.status === "cancelled" ? "This dinner is off." : "It's too close to the dinner to change now." };
  const status = yes ? "going" : "declined";
  await db.update(crownDinnerSeats).set({ status }).where(eq(crownDinnerSeats.id, me.id));
  const guest = (await names([userId])).get(userId) ?? "Your guest";
  notify(me.guestOf, "account", {
    type: "crown_table",
    title: yes ? `${guest} is coming to ${d.title}` : `${guest} can't make ${d.title}`,
    body: yes ? `${whenLabel(d.startsAt)} at ${d.venueName}.` : "You can ask someone else.",
    url: "/crown/table",
    tag: `crown-dinner-${id}`,
  }).catch(() => {});
  return { status };
}

export function registerCrownTableRoutes(app: Express, getUserId: (req: Request) => string | null) {
  const handle = (fn: (userId: string, req: Request) => Promise<any>) => async (req: Request, res: any) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const out = await fn(userId, req);
      if (out && "error" in out) return res.status(out.error).json({ message: out.message });
      res.json(out);
    } catch (e) {
      console.error("[crown table] failed:", e);
      res.status(500).json({ message: "Something went wrong" });
    }
  };
  app.get("/api/crown/table", handle((userId) => crownTableMe(userId)));
  app.post("/api/crown/table/:id/seat", handle(async (userId, req) =>
    typeof req.body?.going !== "boolean" ? { error: 400, message: "going must be true or false" } : setSeat(userId, Number(req.params.id), req.body.going)));
  app.post("/api/crown/table/:id/guest", handle(async (userId, req) => {
    const g = req.body?.userId;
    if (g !== null && typeof g !== "string") return { error: 400, message: "userId must be a member or null" };
    return askGuest(userId, Number(req.params.id), g);
  }));
  app.post("/api/crown/table/:id/guest-answer", handle(async (userId, req) =>
    typeof req.body?.yes !== "boolean" ? { error: 400, message: "yes must be true or false" } : guestAnswer(userId, Number(req.params.id), req.body.yes)));
}
