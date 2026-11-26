// Console: Date on me (shared/date-vouchers.ts, server/date-vouchers.ts).
//   GET  /api/admin/date-on-me                         venues (menu, PIN set?), refunds due, payouts owed by venue and month, recent vouchers
//   PATCH /api/admin/date-on-me/venues/:id/items        { items: [{ label, cents }] } the member-price menu
//   POST /api/admin/date-on-me/venues/:id/pin          a new till PIN, shown once
//   POST /api/admin/date-on-me/vouchers/:id/refunded   { note } after sending the money back by hand
//   POST /api/admin/date-on-me/payouts                 { placeId, month: "YYYY-MM", note } mark that month's used vouchers paid to the venue
import crypto from "crypto";
import type { Express } from "express";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "../db";
import { dateVouchers, payments, places, profiles } from "@shared/schema";
import { VOUCHER_CENTS_MAX, VOUCHER_CENTS_MIN, VOUCHER_ITEMS_MAX, type VoucherItem } from "@shared/date-vouchers";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import { hashPin } from "../date-vouchers";
import { notify } from "../push";

const adminId = (req: any): string => req.admin.userId;
const OFFSET = 2 * 3600e3; // Harare
const monthOf = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 7);
const monthBounds = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return { from: new Date(Date.UTC(y, mo - 1, 1) - OFFSET), to: new Date(Date.UTC(y, mo, 1) - OFFSET) };
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "item";

export async function refundsDueCount(): Promise<number> {
  return (await db.select({ id: dateVouchers.id }).from(dateVouchers).where(eq(dateVouchers.status, "refund_due"))).length;
}

export function registerAdminDateVoucherRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/date-on-me", "support", async (_req, res) => {
    try {
      const venues = await db.select({
        id: places.id, name: places.name, suburb: places.suburb, partnerOffer: places.partnerOffer,
        voucherItems: places.voucherItems, tillPinHash: places.tillPinHash,
      }).from(places).where(isNotNull(places.partnerSince)).orderBy(places.name);
      const due = await db.select().from(dateVouchers).where(eq(dateVouchers.status, "refund_due")).orderBy(dateVouchers.paidAt);
      const owed = await db.select().from(dateVouchers).where(and(eq(dateVouchers.status, "redeemed"), isNull(dateVouchers.paidOutAt)));
      const recent = await db.select().from(dateVouchers).where(inArray(dateVouchers.status, ["active", "redeemed", "refunded"]))
        .orderBy(desc(dateVouchers.paidAt)).limit(40);
      const ids = Array.from(new Set([...due, ...recent].map((v) => v.crownUserId)));
      const ps = ids.length ? await db.select({ userId: profiles.userId, displayName: profiles.displayName }).from(profiles).where(inArray(profiles.userId, ids)) : [];
      const nm = new Map(ps.map((p) => [p.userId, (p.displayName || "").trim() || "No name"]));
      const payIds = due.map((v) => v.paymentId).filter((x): x is number => x != null);
      const pays = payIds.length ? await db.select({ id: payments.id, provider: payments.provider, phone: payments.phoneNumberMasked, ref: payments.providerReference })
        .from(payments).where(inArray(payments.id, payIds)) : [];
      const vname = new Map(venues.map((v) => [v.id, v.name]));
      const buckets = new Map<string, { placeId: number; venueName: string; month: string; count: number; cents: number }>();
      for (const v of owed) {
        const month = monthOf(v.redeemedAt ?? v.paidAt ?? new Date());
        const key = `${v.placeId}:${month}`;
        const b = buckets.get(key) ?? { placeId: v.placeId, venueName: vname.get(v.placeId) ?? "Venue", month, count: 0, cents: 0 };
        b.count++;
        b.cents += v.amountCents;
        buckets.set(key, b);
      }
      const view = (v: typeof due[number]) => ({
        id: v.id, code: v.code, crownName: nm.get(v.crownUserId) ?? "No name", venueName: vname.get(v.placeId) ?? "Venue", itemLabel: v.itemLabel,
        amountCents: v.amountCents, status: v.status, paidAt: v.paidAt?.toISOString() ?? null, redeemedAt: v.redeemedAt?.toISOString() ?? null,
        refundReason: v.refundReason, refundNote: v.refundNote,
      });
      res.json({
        currentMonth: monthOf(new Date()),
        venues: venues.map((v) => ({ id: v.id, name: v.name, suburb: v.suburb, partnerOffer: v.partnerOffer, items: (v.voucherItems ?? []) as VoucherItem[], pinSet: !!v.tillPinHash })),
        refundsDue: due.map((v) => {
          const p = pays.find((x) => x.id === v.paymentId);
          return { ...view(v), paidWith: p ? `${p.provider}${p.phone ? `, ${p.phone}` : ""}` : null, paymentRef: p?.ref ?? null };
        }),
        payouts: Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month) || a.venueName.localeCompare(b.venueName)),
        recent: recent.map(view),
      });
    } catch (e) {
      console.error("[admin date on me] list failed:", e);
      res.status(500).json({ message: "Couldn't load" });
    }
  });

  adminRoute(app, "patch", "/api/admin/date-on-me/venues/:id/items", "admin", async (req, res) => {
    const raw = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!raw || raw.length > VOUCHER_ITEMS_MAX) return res.status(400).json({ message: `Up to ${VOUCHER_ITEMS_MAX} things on the menu.` });
    const items: VoucherItem[] = [];
    for (const r of raw) {
      const label = typeof r?.label === "string" ? r.label.trim().slice(0, 60) : "";
      const cents = Math.round(Number(r?.cents));
      if (label.length < 3 || !Number.isInteger(cents) || cents < VOUCHER_CENTS_MIN || cents > VOUCHER_CENTS_MAX) {
        return res.status(400).json({ message: `Each item needs a name and a price from $${VOUCHER_CENTS_MIN / 100} to $${VOUCHER_CENTS_MAX / 100}.` });
      }
      let id = slug(label);
      while (items.some((i) => i.id === id)) id += "-2";
      items.push({ id, label, cents });
    }
    try {
      const [p] = await db.update(places).set({ voucherItems: items }).where(and(eq(places.id, Number(req.params.id)), isNotNull(places.partnerSince))).returning({ id: places.id });
      if (!p) return res.status(404).json({ message: "Not a partner venue." });
      await auditAdmin(req, adminId(req), "date_on_me.menu", { targetType: "place", targetId: p.id, details: { items } });
      res.json({ items });
    } catch (e) {
      console.error("[admin date on me] menu failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });

  adminRoute(app, "post", "/api/admin/date-on-me/venues/:id/pin", "admin", async (req, res) => {
    const pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      const [p] = await db.update(places).set({ tillPinHash: hashPin(pin) }).where(and(eq(places.id, Number(req.params.id)), isNotNull(places.partnerSince))).returning({ id: places.id });
      if (!p) return res.status(404).json({ message: "Not a partner venue." });
      await auditAdmin(req, adminId(req), "date_on_me.pin_reset", { targetType: "place", targetId: p.id });
      res.json({ pin });
    } catch (e) {
      console.error("[admin date on me] pin failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });

  adminRoute(app, "post", "/api/admin/date-on-me/vouchers/:id/refunded", "admin", async (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 200) : "";
    if (note.length < 3) return res.status(400).json({ message: "Note how it was sent back (e.g. the EcoCash reference)." });
    try {
      const [v] = await db.update(dateVouchers).set({ status: "refunded", refundedAt: new Date(), refundedBy: adminId(req), refundNote: note })
        .where(and(eq(dateVouchers.id, Number(req.params.id)), eq(dateVouchers.status, "refund_due"))).returning();
      if (!v) return res.status(404).json({ message: "Not waiting for a refund." });
      await auditAdmin(req, adminId(req), "date_on_me.refunded", { targetType: "date_voucher", targetId: v.id, details: { note, amountCents: v.amountCents } });
      notify(v.crownUserId, "account", {
        type: "date_on_me", title: "Your Date on me refund was sent", body: `$${(v.amountCents / 100).toFixed(2)} for ${v.itemLabel}.`, url: "/settings#payments", tag: `date-voucher-${v.id}`,
      }).catch(() => {});
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin date on me] refund failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });

  adminRoute(app, "post", "/api/admin/date-on-me/payouts", "admin", async (req, res) => {
    const placeId = Number(req.body?.placeId);
    const month = String(req.body?.month ?? "");
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 200) : "";
    if (!Number.isInteger(placeId) || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ message: "Pick a venue and month." });
    if (note.length < 3) return res.status(400).json({ message: "Note how it was paid (e.g. the bank reference)." });
    if (month >= monthOf(new Date())) return res.status(400).json({ message: "Pay a month out once it's over." });
    try {
      const { from, to } = monthBounds(month);
      const rows = await db.update(dateVouchers).set({ paidOutAt: new Date(), paidOutBy: adminId(req), payoutNote: note })
        .where(and(eq(dateVouchers.placeId, placeId), eq(dateVouchers.status, "redeemed"), isNull(dateVouchers.paidOutAt),
          gte(dateVouchers.redeemedAt, from), lt(dateVouchers.redeemedAt, to)))
        .returning({ cents: dateVouchers.amountCents });
      if (!rows.length) return res.status(404).json({ message: "Nothing owed to that venue for that month." });
      const cents = rows.reduce((s, r) => s + r.cents, 0);
      await auditAdmin(req, adminId(req), "date_on_me.payout", { targetType: "place", targetId: placeId, details: { month, count: rows.length, cents, note } });
      res.json({ count: rows.length, cents });
    } catch (e) {
      console.error("[admin date on me] payout failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });
}
