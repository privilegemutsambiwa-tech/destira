// Paid event tickets (Part G4, shared/event-tickets.ts).
//
// A member pays through the one-off purchase path (server/purchases.ts) with
// kind "event_ticket" and the event id as the ref. Nothing is held while they
// pay: the seat is given inside the payment's own transaction, once Paynow
// confirms it. If the event filled up or was called off in the meantime, the
// ticket goes straight to a refund instead.
//
// A ticket is refunded in full when the event is called off (by the host, or
// the team taking it down): sweepEventTickets moves it to refund_due and tells
// the buyer, and the console records the money going back. Cancelling your
// own seat isn't refunded; you keep the ticket and can take the seat back
// while one is free.
//
//   GET /api/events/:id/tickets   the host's sales: sold, Destira's 10%, their share, payout status
import type { Express, Request } from "express";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { eventAttendees, eventTickets, events, profiles, type Event } from "@shared/schema";
import {
  HOST_PAYOUT_DAYS, PURCHASE_KIND_TICKET, eventEndsAt, ticketFeeCents, ticketPrice, type HostTicketSummary,
} from "@shared/event-tickets";
import { registerPurchaseKind } from "./purchase-kinds";
import { notify } from "./push";
import { storage } from "./storage";

export const maskPayoutNumber = (n: string | null) => (n ? `${n.slice(0, 2)}•• ••• ${n.slice(-4)}` : null);

/** Why this member can't have a seat right now, or null. Reads with `q` (a tx or db). */
async function seatProblem(q: any, e: Event, userId: string): Promise<string | null> {
  if (e.genderPolicy !== "mixed") {
    const [p] = await q.select({ gender: profiles.gender }).from(profiles).where(eq(profiles.userId, userId));
    const g = p?.gender ?? null;
    if (e.genderPolicy === "men_only" && g !== "man") return "This event is for men only.";
    if (e.genderPolicy === "women_only" && g !== "woman") return "This event is for women only.";
    if (e.genderPolicy === "quota" && (g === "man" || g === "woman")) {
      const slot = g === "man" ? e.menSlots : e.womenSlots;
      const [{ n }] = await q.select({ n: count() }).from(eventAttendees)
        .innerJoin(profiles, eq(profiles.userId, eventAttendees.userId))
        .where(and(eq(eventAttendees.eventId, e.id), eq(eventAttendees.status, "going"), eq(profiles.gender, g)));
      if (slot != null && Number(n) >= slot) return "Sold out.";
      return null;
    }
  }
  if (e.seatModel === "capped" && e.seatCount != null) {
    const [{ n }] = await q.select({ n: count() }).from(eventAttendees)
      .where(and(eq(eventAttendees.eventId, e.id), eq(eventAttendees.status, "going")));
    if (Number(n) >= e.seatCount) return "Sold out.";
  }
  return null;
}

/** A paid ticket this member holds for this event (q: a tx or db). */
export async function heldTicket(q: any, eventId: number, userId: string) {
  const [t] = await q.select().from(eventTickets)
    .where(and(eq(eventTickets.eventId, eventId), eq(eventTickets.userId, userId), eq(eventTickets.status, "paid")));
  return t ?? null;
}

const onSale = (e: Event) => e.status === "published" && e.costModel === "ticket" && e.ticketCents != null && e.startsAt.getTime() > Date.now();

registerPurchaseKind(PURCHASE_KIND_TICKET, {
  // A refunded or used-up ticket mustn't block buying one again.
  repeatable: true,
  async quote(userId, eventId) {
    const [e] = await db.select().from(events).where(eq(events.id, eventId));
    if (!e || e.costModel !== "ticket") return { error: 404, message: "Not found" };
    if (e.hostUserId === userId) return { error: 409, message: "It's your event." };
    if (!onSale(e)) return { error: 409, message: "Tickets for this event aren't on sale." };
    if (await heldTicket(db, e.id, userId)) return { error: 409, message: "You have a ticket already." };
    const no = await seatProblem(db, e, userId);
    if (no) return { error: 409, message: no };
    return { cents: e.ticketCents!, label: `Ticket: ${e.title}`, returnTo: `/events/${e.id}` };
  },
  async onPaid(tx, pay) {
    if (pay.purchaseRef == null) return;
    const [e] = await tx.select().from(events).where(eq(events.id, pay.purchaseRef)).for("update");
    if (!e) return;
    const now = new Date();
    const refund = e.status !== "published" || e.startsAt.getTime() <= now.getTime()
      ? "The event was off by the time the payment came through."
      : (await heldTicket(tx, e.id, pay.userId))
        ? "You had a ticket already."
        : (await seatProblem(tx, e, pay.userId))
          ? "The last seat went while you were paying."
          : null;
    await tx.insert(eventTickets).values({
      eventId: e.id, userId: pay.userId, paymentId: pay.id, amountCents: pay.amount, feeCents: ticketFeeCents(pay.amount),
      status: refund ? "refund_due" : "paid", refundReason: refund, createdAt: now,
    }).onConflictDoNothing();
    if (!refund) {
      const [existing] = await tx.select().from(eventAttendees)
        .where(and(eq(eventAttendees.eventId, e.id), eq(eventAttendees.userId, pay.userId)));
      if (existing) await tx.update(eventAttendees).set({ status: "going", decidedAt: now }).where(eq(eventAttendees.id, existing.id));
      else await tx.insert(eventAttendees).values({ eventId: e.id, userId: pay.userId, status: "going", decidedAt: now });
    }
    // After the transaction commits: tell them, and seat them in the event chat.
    setTimeout(async () => {
      notify(pay.userId, "events", refund
        ? { type: "event_ticket", title: `Your ticket for "${e.title}" is being refunded`, body: `${refund} The full ${ticketPrice(pay.amount)} comes back to you.`, url: `/events/${e.id}`, tag: `ticket-${pay.id}` }
        : { type: "event_ticket", title: `You have a ticket for "${e.title}"`, body: "Your seat is saved. See you there.", url: `/events/${e.id}`, tag: `ticket-${pay.id}` },
      ).catch(() => {});
      if (!refund && e.chatGroupId != null) {
        try {
          if (!(await storage.getGroupMember(e.chatGroupId, pay.userId))) {
            const p = await storage.getProfile(pay.userId);
            await storage.joinGroup(e.chatGroupId, pay.userId, p?.groupNickname || p?.displayName || "Guest");
          }
        } catch {}
      }
    }, 0);
  },
  async returnTo(eventId) {
    return `/events/${eventId}`;
  },
});

/**
 * Paid tickets on an event that's no longer on (the host cancelled, or the
 * team took it down) become full refunds, and the buyer is told. Pass an
 * event id to do just that one now.
 */
export async function sweepEventTickets(eventId?: number): Promise<number> {
  const rows = await db.select({ t: eventTickets, title: events.title, status: events.status })
    .from(eventTickets).innerJoin(events, eq(events.id, eventTickets.eventId))
    .where(and(eq(eventTickets.status, "paid"), ne(events.status, "published"), eventId != null ? eq(eventTickets.eventId, eventId) : sql`true`));
  for (const { t, title } of rows) {
    const reason = "The event was called off.";
    const [moved] = await db.update(eventTickets).set({ status: "refund_due", refundReason: reason })
      .where(and(eq(eventTickets.id, t.id), eq(eventTickets.status, "paid"))).returning({ id: eventTickets.id });
    if (!moved) continue;
    notify(t.userId, "events", {
      type: "event_ticket", title: `"${title}" was called off`, body: `Your ${ticketPrice(t.amountCents)} ticket is being refunded in full.`, url: `/events/${t.eventId}`, tag: `ticket-${t.paymentId}`,
    }).catch(() => {});
  }
  return rows.length;
}

export function startEventTicketSweep(): void {
  const run = () => sweepEventTickets().catch((e) => console.error("[tickets] sweep failed:", e));
  setTimeout(run, 40_000);
  setInterval(run, 10 * 60e3);
}

export async function hostTicketSummary(e: Event): Promise<HostTicketSummary> {
  const rows = await db.select().from(eventTickets).where(and(eq(eventTickets.eventId, e.id), inArray(eventTickets.status, ["paid", "refund_due"])));
  const paid = rows.filter((r) => r.status === "paid");
  const gross = paid.reduce((s, r) => s + r.amountCents, 0);
  const fee = paid.reduce((s, r) => s + r.feeCents, 0);
  return {
    sold: paid.length,
    grossCents: gross,
    feeCents: fee,
    hostCents: gross - fee,
    refundsDue: rows.length - paid.length,
    payoutDueBy: new Date(eventEndsAt(e.startsAt, e.endsAt).getTime() + HOST_PAYOUT_DAYS * 864e5).toISOString(),
    paidOutAt: e.hostPaidOutAt?.toISOString() ?? null,
    paidOutCents: e.hostPayoutCents ?? null,
    payoutNumberMasked: maskPayoutNumber(e.payoutNumber),
  };
}

export function registerEventTicketRoutes(app: Express, getUserId: (req: Request) => string | null) {
  app.get("/api/events/:id/tickets", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const [e] = await db.select().from(events).where(eq(events.id, Number(req.params.id)));
      if (!e || e.hostUserId !== userId) return res.status(404).json({ message: "Not found" });
      if (e.costModel !== "ticket") return res.json(null);
      res.json(await hostTicketSummary(e));
    } catch (err) {
      console.error("[tickets] summary failed:", err);
      res.status(500).json({ message: "Couldn't load" });
    }
  });
}
