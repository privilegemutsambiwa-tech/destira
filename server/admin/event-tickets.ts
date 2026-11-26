// Console: paid event tickets (shared/event-tickets.ts, server/event-tickets.ts).
//   GET  /api/admin/tickets                         refunds to send, hosts to pay, ticketed events coming up, recent payouts
//   POST /api/admin/tickets/:id/refunded            { note } after sending a buyer's money back by hand
//   POST /api/admin/tickets/events/:id/paid-out     { note } after sending the host their share (ticket total less 10%)
import type { Express } from "express";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";
import { eventTickets, events, payments, profiles } from "@shared/schema";
import { HOST_PAYOUT_DAYS, eventEndsAt, ticketPrice } from "@shared/event-tickets";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import { notify } from "../push";

const adminId = (req: any): string => req.admin.userId;

async function names(ids: string[]): Promise<Map<string, string>> {
  const u = Array.from(new Set(ids));
  if (!u.length) return new Map();
  const ps = await db.select({ userId: profiles.userId, displayName: profiles.displayName }).from(profiles).where(inArray(profiles.userId, u));
  return new Map(ps.map((p) => [p.userId, (p.displayName || "").trim() || "No name"]));
}

/** Ticketed events whose paid tickets haven't been paid out to the host, with their totals. */
async function unpaidEvents() {
  const evs = await db.select().from(events).where(and(eq(events.costModel, "ticket"), eq(events.status, "published"), isNull(events.hostPaidOutAt)));
  if (!evs.length) return [];
  const ts = await db.select().from(eventTickets).where(and(inArray(eventTickets.eventId, evs.map((e) => e.id)), eq(eventTickets.status, "paid")));
  return evs.map((e) => {
    const mine = ts.filter((t) => t.eventId === e.id);
    const gross = mine.reduce((s, t) => s + t.amountCents, 0);
    const fee = mine.reduce((s, t) => s + t.feeCents, 0);
    const endsAt = eventEndsAt(e.startsAt, e.endsAt);
    return { e, sold: mine.length, gross, fee, host: gross - fee, endsAt, dueBy: new Date(endsAt.getTime() + HOST_PAYOUT_DAYS * 864e5) };
  }).filter((x) => x.sold > 0);
}

/** For the overview badge: refunds to send, and hosts whose event is over and not yet paid. */
export async function ticketsToActionCount(): Promise<number> {
  const due = await db.select({ id: eventTickets.id }).from(eventTickets).where(eq(eventTickets.status, "refund_due"));
  const now = Date.now();
  return due.length + (await unpaidEvents()).filter((x) => x.endsAt.getTime() < now).length;
}

export function registerAdminEventTicketRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/tickets", "support", async (_req, res) => {
    try {
      const now = Date.now();
      const due = await db.select({ t: eventTickets, title: events.title, startsAt: events.startsAt }).from(eventTickets)
        .innerJoin(events, eq(events.id, eventTickets.eventId)).where(eq(eventTickets.status, "refund_due")).orderBy(eventTickets.createdAt);
      const pays = due.length ? await db.select({ id: payments.id, provider: payments.provider, phone: payments.phoneNumberMasked, ref: payments.providerReference })
        .from(payments).where(inArray(payments.id, due.map((d) => d.t.paymentId))) : [];
      const unpaid = await unpaidEvents();
      const done = await db.select().from(events).where(and(eq(events.costModel, "ticket"), isNotNull(events.hostPaidOutAt))).orderBy(desc(events.hostPaidOutAt)).limit(20);
      const nm = await names([...due.map((d) => d.t.userId), ...unpaid.map((x) => x.e.hostUserId), ...done.map((e) => e.hostUserId)]);
      res.json({
        refundsDue: due.map(({ t, title, startsAt }) => {
          const p = pays.find((x) => x.id === t.paymentId);
          return {
            id: t.id, buyerName: nm.get(t.userId) ?? "No name", eventId: t.eventId, eventTitle: title, startsAt: startsAt.toISOString(),
            amountCents: t.amountCents, reason: t.refundReason, paidAt: t.createdAt.toISOString(),
            paidWith: p ? `${p.provider}${p.phone ? `, ${p.phone}` : ""}` : null, paymentRef: p?.ref ?? null,
          };
        }),
        payouts: unpaid.filter((x) => x.endsAt.getTime() < now).sort((a, b) => a.dueBy.getTime() - b.dueBy.getTime()).map((x) => ({
          eventId: x.e.id, title: x.e.title, hostName: nm.get(x.e.hostUserId) ?? "No name", payoutNumber: x.e.payoutNumber,
          sold: x.sold, grossCents: x.gross, feeCents: x.fee, hostCents: x.host, endedAt: x.endsAt.toISOString(), dueBy: x.dueBy.toISOString(), overdue: x.dueBy.getTime() < now,
        })),
        upcoming: unpaid.filter((x) => x.endsAt.getTime() >= now).sort((a, b) => a.e.startsAt.getTime() - b.e.startsAt.getTime()).map((x) => ({
          eventId: x.e.id, title: x.e.title, hostName: nm.get(x.e.hostUserId) ?? "No name", startsAt: x.e.startsAt.toISOString(),
          priceCents: x.e.ticketCents ?? 0, sold: x.sold, grossCents: x.gross, hostCents: x.host,
        })),
        paidOut: done.map((e) => ({
          eventId: e.id, title: e.title, hostName: nm.get(e.hostUserId) ?? "No name", cents: e.hostPayoutCents ?? 0,
          paidOutAt: e.hostPaidOutAt!.toISOString(), note: e.hostPayoutNote,
        })),
      });
    } catch (e) {
      console.error("[admin tickets] list failed:", e);
      res.status(500).json({ message: "Couldn't load" });
    }
  });

  adminRoute(app, "post", "/api/admin/tickets/:id/refunded", "admin", async (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 200) : "";
    if (note.length < 3) return res.status(400).json({ message: "Note how it was sent back (e.g. the EcoCash reference)." });
    try {
      const [t] = await db.update(eventTickets).set({ status: "refunded", refundedAt: new Date(), refundedBy: adminId(req), refundNote: note })
        .where(and(eq(eventTickets.id, Number(req.params.id)), eq(eventTickets.status, "refund_due"))).returning();
      if (!t) return res.status(404).json({ message: "Not waiting for a refund." });
      await auditAdmin(req, adminId(req), "tickets.refunded", { targetType: "event_ticket", targetId: t.id, details: { note, amountCents: t.amountCents, eventId: t.eventId } });
      notify(t.userId, "account", {
        type: "event_ticket", title: "Your ticket refund was sent", body: `${ticketPrice(t.amountCents)} is on its way back to you.`, url: "/settings#payments", tag: `ticket-${t.paymentId}`,
      }).catch(() => {});
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin tickets] refund failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });

  adminRoute(app, "post", "/api/admin/tickets/events/:id/paid-out", "admin", async (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 200) : "";
    if (note.length < 3) return res.status(400).json({ message: "Note how it was paid (e.g. the EcoCash reference)." });
    try {
      const x = (await unpaidEvents()).find((u) => u.e.id === Number(req.params.id));
      if (!x) return res.status(404).json({ message: "Nothing owed to this host." });
      if (x.endsAt.getTime() > Date.now()) return res.status(400).json({ message: "Pay the host once the event is over." });
      const [e] = await db.update(events).set({ hostPaidOutAt: new Date(), hostPaidOutBy: adminId(req), hostPayoutCents: x.host, hostPayoutNote: note })
        .where(and(eq(events.id, x.e.id), isNull(events.hostPaidOutAt))).returning({ id: events.id, title: events.title, hostUserId: events.hostUserId });
      if (!e) return res.status(409).json({ message: "Already paid out." });
      await auditAdmin(req, adminId(req), "tickets.host_paid", { targetType: "event", targetId: e.id, details: { note, cents: x.host, gross: x.gross, fee: x.fee, sold: x.sold } });
      notify(e.hostUserId, "account", {
        type: "event_ticket", title: `Your ticket money for "${e.title}" was sent`,
        body: `${ticketPrice(x.host)}: ${x.sold} ticket${x.sold === 1 ? "" : "s"}, less Destira's 10%.`, url: `/events/${e.id}`, tag: `payout-${e.id}`,
      }).catch(() => {});
      res.json({ cents: x.host });
    } catch (err) {
      console.error("[admin tickets] payout failed:", err);
      res.status(500).json({ message: "Couldn't save" });
    }
  });
}
