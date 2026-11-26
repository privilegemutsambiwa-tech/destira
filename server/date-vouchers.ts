// Date on me, the member and till side (shared/date-vouchers.ts; console in
// server/admin/date-vouchers.ts).
//   GET  /api/date-vouchers/plan/:planId   what this date card can show: the venue's menu, the voucher
//   POST /api/date-vouchers                { planId, itemId } -> { voucherId } then pay via /api/purchases/initiate
//   POST /api/till/check                   { code, pin } the venue's staff check a code (no sign-in)
//   POST /api/till/redeem                  { code, pin } and mark it used
// The sweep turns unused (30 days) or called-off vouchers into refunds due.
import crypto from "crypto";
import type { Express, Request } from "express";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "./db";
import { datePlans, dateVouchers, matches, places, type DateVoucher } from "@shared/schema";
import {
  PURCHASE_KIND_VOUCHER, VOUCHER_CODE_ALPHABET, VOUCHER_DAYS, normalizeVoucherCode,
  type PlanVoucherState, type TillCheck, type VoucherItem, type VoucherStatus,
} from "@shared/date-vouchers";
import { isCrown } from "./crown";
import { notify } from "./push";
import { registerPurchaseKind } from "./purchase-kinds";

type Fail = { error: number; message: string };
const DAY_MS = 24 * 3600e3;
const LIVE_PLAN = ["proposed", "confirmed"];
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
export const hashPin = (pin: string) => crypto.createHash("sha256").update(`till:${pin}`).digest("hex");

function newCode(): string {
  const b = crypto.randomBytes(8);
  const s = Array.from(b, (x) => VOUCHER_CODE_ALPHABET[x % VOUCHER_CODE_ALPHABET.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

async function planFor(userId: string, planId: number) {
  const [p] = await db.select().from(datePlans).where(eq(datePlans.id, planId));
  if (!p) return null;
  const [m] = await db.select({ a: matches.user1Id, b: matches.user2Id }).from(matches).where(eq(matches.id, p.matchId));
  if (!m || (m.a !== userId && m.b !== userId)) return null;
  return { plan: p, other: m.a === userId ? m.b : m.a };
}

/** The partner venue a date is at, if it has a menu. Matched by name, like the planner's spots. */
async function venueFor(placeName: string) {
  const [v] = await db.select().from(places).where(and(eq(places.name, placeName), isNotNull(places.partnerSince)));
  const items = (v?.voucherItems ?? []) as VoucherItem[];
  return v && items.length ? { place: v, items } : null;
}

const planIsLive = (p: typeof datePlans.$inferSelect) =>
  LIVE_PLAN.includes(p.status) && (p.status === "proposed" || !p.startsAt || p.startsAt.getTime() > Date.now());

async function planState(userId: string, planId: number): Promise<PlanVoucherState | Fail> {
  const f = await planFor(userId, planId);
  if (!f) return { error: 404, message: "Not found" };
  const { plan } = f;
  const [v] = await db.select().from(dateVouchers)
    .where(and(eq(dateVouchers.planId, planId), inArray(dateVouchers.status, ["active", "redeemed", "refund_due", "refunded"])));
  const venue = plan.kind === "event" ? null : await venueFor(plan.placeName);
  const crown = await isCrown(userId);
  return {
    venue: venue ? { name: venue.place.name, offer: venue.place.partnerOffer } : null,
    items: crown && venue ? venue.items : [],
    canAttach: !!venue && crown && !v && planIsLive(plan),
    voucher: v ? {
      id: v.id,
      // The other person sees the code only while it can be used.
      code: v.crownUserId === userId || v.status === "active" ? v.code : "",
      itemLabel: v.itemLabel,
      amountCents: v.amountCents,
      status: v.status as VoucherStatus,
      expiresAt: v.expiresAt?.toISOString() ?? null,
      mine: v.crownUserId === userId,
    } : null,
  };
}

async function attach(userId: string, planId: number, itemId: string): Promise<{ voucherId: number } | Fail> {
  if (!(await isCrown(userId))) return { error: 403, message: "Date on me is a Crown perk." };
  const f = await planFor(userId, planId);
  if (!f) return { error: 404, message: "Not found" };
  if (!planIsLive(f.plan)) return { error: 409, message: "This date isn't on any more." };
  const venue = f.plan.kind === "event" ? null : await venueFor(f.plan.placeName);
  if (!venue) return { error: 409, message: "Date on me works at Destira partner venues." };
  const item = venue.items.find((i) => i.id === itemId);
  if (!item) return { error: 400, message: "Pick something from the menu." };
  const [taken] = await db.select({ id: dateVouchers.id }).from(dateVouchers)
    .where(and(eq(dateVouchers.planId, planId), inArray(dateVouchers.status, ["active", "redeemed"])));
  if (taken) return { error: 409, message: "This date is covered already." };
  // One unpaid voucher per member per plan, re-used if they change their pick.
  const [pending] = await db.select().from(dateVouchers)
    .where(and(eq(dateVouchers.planId, planId), eq(dateVouchers.crownUserId, userId), eq(dateVouchers.status, "pending_payment")));
  const values = { placeId: venue.place.id, itemId: item.id, itemLabel: item.label, amountCents: item.cents };
  if (pending) {
    await db.update(dateVouchers).set(values).where(eq(dateVouchers.id, pending.id));
    return { voucherId: pending.id };
  }
  for (let i = 0; i < 5; i++) {
    try {
      const [row] = await db.insert(dateVouchers).values({
        ...values, code: newCode(), crownUserId: userId, planId, matchId: f.plan.matchId, createdAt: new Date(),
      }).returning({ id: dateVouchers.id });
      return { voucherId: row.id };
    } catch (e: any) {
      if (!String(e?.message ?? "").includes("code")) throw e; // a clash on the random code: try another
    }
  }
  return { error: 500, message: "Couldn't make a code. Try again." };
}

// ── paying (server/purchase-kinds.ts) ───────────────────────────────

registerPurchaseKind(PURCHASE_KIND_VOUCHER, {
  async quote(userId, ref) {
    const [v] = await db.select().from(dateVouchers).where(eq(dateVouchers.id, ref));
    if (!v || v.crownUserId !== userId) return { error: 404, message: "Not found" };
    if (v.status !== "pending_payment") return { error: 409, message: "This voucher is paid for already." };
    if (!(await isCrown(userId))) return { error: 403, message: "Date on me is a Crown perk." };
    const [p] = await db.select().from(datePlans).where(eq(datePlans.id, v.planId));
    if (!p || !planIsLive(p)) return { error: 409, message: "This date isn't on any more." };
    const [pl] = await db.select({ name: places.name }).from(places).where(eq(places.id, v.placeId));
    return { cents: v.amountCents, label: `Date on me: ${v.itemLabel} at ${pl?.name ?? "a partner venue"}`, returnTo: `/chat/${v.matchId}` };
  },
  async onPaid(tx, pay) {
    if (pay.purchaseRef == null) return;
    const [v] = await tx.select().from(dateVouchers).where(eq(dateVouchers.id, pay.purchaseRef)).for("update");
    if (!v || v.status !== "pending_payment") return;
    const [p] = await tx.select().from(datePlans).where(eq(datePlans.id, v.planId));
    const now = new Date();
    const covered = await tx.select({ id: dateVouchers.id }).from(dateVouchers)
      .where(and(eq(dateVouchers.planId, v.planId), inArray(dateVouchers.status, ["active", "redeemed"])));
    // Paid, but the date went off (or got covered) while they were paying: straight to a refund.
    const refund = !p || !LIVE_PLAN.includes(p.status) ? "The date was off before the payment came through." : covered.length ? "The date was already covered." : null;
    await tx.update(dateVouchers).set({
      status: refund ? "refund_due" : "active", paidAt: now, paymentId: pay.id,
      expiresAt: new Date(now.getTime() + VOUCHER_DAYS * DAY_MS), refundReason: refund,
    }).where(eq(dateVouchers.id, v.id));
    if (refund || !p) {
      setTimeout(() => notify(v.crownUserId, "account", {
        type: "date_on_me",
        title: "Your Date on me payment is being refunded",
        body: `${v.itemLabel}, ${money(v.amountCents)}. ${refund ?? ""} The team will send it back to the number you paid from.`,
        url: `/chat/${v.matchId}`,
        tag: `date-voucher-${v.id}`,
      }).catch(() => {}), 0);
      return;
    }
    const other = await tx.select({ a: matches.user1Id, b: matches.user2Id }).from(matches).where(eq(matches.id, v.matchId));
    const otherId = other[0] ? (other[0].a === v.crownUserId ? other[0].b : other[0].a) : null;
    const [pl] = await tx.select({ name: places.name }).from(places).where(eq(places.id, v.placeId));
    if (otherId) {
      setTimeout(() => notify(otherId, "matches", {
        type: "date_on_me",
        title: "Your date has covered this",
        body: `${v.itemLabel} at ${pl?.name ?? "the venue"}. Show the code in your chat at the till.`,
        url: `/chat/${v.matchId}`,
        tag: `date-voucher-${v.id}`,
      }).catch(() => {}), 0);
    }
  },
  async returnTo(ref) {
    const [v] = await db.select({ matchId: dateVouchers.matchId }).from(dateVouchers).where(eq(dateVouchers.id, ref));
    return v ? `/chat/${v.matchId}` : "/chats";
  },
});

// ── the till ─────────────────────────────────────────────────────────

const tries = new Map<string, { n: number; since: number }>();
const TILL_TRIES = 12;
const TILL_WINDOW_MS = 10 * 60e3;
function tooMany(key: string): boolean {
  const now = Date.now();
  const t = tries.get(key);
  if (!t || now - t.since > TILL_WINDOW_MS) { tries.set(key, { n: 1, since: now }); return false; }
  t.n++;
  return t.n > TILL_TRIES;
}

async function tillFind(rawCode: unknown, rawPin: unknown): Promise<{ v: DateVoucher; venueName: string } | Fail> {
  const code = normalizeVoucherCode(String(rawCode ?? ""));
  const pin = String(rawPin ?? "").replace(/\D/g, "");
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) || pin.length < 4) return { error: 400, message: "Enter the code and your venue PIN." };
  const [v] = await db.select().from(dateVouchers).where(eq(dateVouchers.code, code));
  const [pl] = v ? await db.select().from(places).where(eq(places.id, v.placeId)) : [];
  // Same answer for a wrong code and a wrong PIN, so codes can't be guessed.
  if (!v || !pl?.tillPinHash || pl.tillPinHash !== hashPin(pin) || v.status === "pending_payment" || v.status === "cancelled") {
    return { error: 404, message: "That code and PIN don't match a voucher here." };
  }
  return { v, venueName: pl.name };
}

const tillView = (v: DateVoucher, venueName: string): TillCheck => ({
  code: v.code, venueName, itemLabel: v.itemLabel, amountCents: v.amountCents, status: v.status as VoucherStatus,
  expiresAt: v.expiresAt?.toISOString() ?? null, redeemedAt: v.redeemedAt?.toISOString() ?? null,
});

// ── the sweep ────────────────────────────────────────────────────────

/** All active vouchers, or just the one on `planId` (when its date is called off). */
export async function sweepDateVouchers(now = new Date(), planId?: number): Promise<number> {
  const live = await db.select().from(dateVouchers)
    .where(planId ? and(eq(dateVouchers.status, "active"), eq(dateVouchers.planId, planId)) : eq(dateVouchers.status, "active"));
  let n = 0;
  for (const v of live) {
    const [p] = await db.select({ status: datePlans.status }).from(datePlans).where(eq(datePlans.id, v.planId));
    const reason = v.expiresAt && v.expiresAt < now ? `Not used within ${VOUCHER_DAYS} days.`
      : !p || !LIVE_PLAN.includes(p.status) ? "The date was called off." : null;
    if (!reason) continue;
    const [moved] = await db.update(dateVouchers).set({ status: "refund_due", refundReason: reason })
      .where(and(eq(dateVouchers.id, v.id), eq(dateVouchers.status, "active"))).returning({ id: dateVouchers.id });
    if (!moved) continue;
    n++;
    notify(v.crownUserId, "account", {
      type: "date_on_me",
      title: "Your Date on me voucher is being refunded",
      body: `${v.itemLabel}, ${money(v.amountCents)}. ${reason} The team will send it back to the number you paid from.`,
      url: `/chat/${v.matchId}`,
      tag: `date-voucher-${v.id}`,
    }).catch(() => {});
  }
  if (planId) return n;
  // Unpaid vouchers older than a day are dropped.
  await db.update(dateVouchers).set({ status: "cancelled" })
    .where(and(eq(dateVouchers.status, "pending_payment"), lt(dateVouchers.createdAt, new Date(now.getTime() - DAY_MS))));
  return n;
}

export function startDateVoucherSweep(): void {
  const run = () => sweepDateVouchers().catch((e) => console.error("[date on me] sweep failed:", e));
  setTimeout(run, 30_000);
  setInterval(run, 10 * 60e3);
}

// ── routes ───────────────────────────────────────────────────────────

export function registerDateVoucherRoutes(app: Express, getUserId: (req: Request) => string | null) {
  const handle = (fn: (userId: string, req: Request) => Promise<any>) => async (req: Request, res: any) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const out = await fn(userId, req);
      if (out && "error" in out) return res.status(out.error).json({ message: out.message });
      res.json(out);
    } catch (e) {
      console.error("[date on me] failed:", e);
      res.status(500).json({ message: "Something went wrong" });
    }
  };
  app.get("/api/date-vouchers/plan/:planId", handle((userId, req) => planState(userId, Number(req.params.planId))));
  app.post("/api/date-vouchers", handle((userId, req) => attach(userId, Number(req.body?.planId), String(req.body?.itemId ?? ""))));

  const till = (redeem: boolean) => async (req: Request, res: any) => {
    if (tooMany(String(req.ip ?? "?"))) return res.status(429).json({ message: "Too many tries. Wait ten minutes." });
    try {
      const f = await tillFind(req.body?.code, req.body?.pin);
      if ("error" in f) return res.status(f.error).json({ message: f.message });
      let v = f.v;
      if (redeem) {
        if (v.status !== "active") return res.status(409).json({ message: v.status === "redeemed" ? "Already used." : "This voucher can't be used." });
        if (v.expiresAt && v.expiresAt < new Date()) return res.status(409).json({ message: "This voucher has expired." });
        const [u] = await db.update(dateVouchers).set({ status: "redeemed", redeemedAt: new Date() })
          .where(and(eq(dateVouchers.id, v.id), eq(dateVouchers.status, "active"))).returning();
        if (!u) return res.status(409).json({ message: "Already used." });
        v = u;
        notify(v.crownUserId, "account", {
          type: "date_on_me", title: "Your Date on me was used", body: `${v.itemLabel} at ${f.venueName}. Enjoy.`, url: `/chat/${v.matchId}`, tag: `date-voucher-${v.id}`,
        }).catch(() => {});
      }
      res.json(tillView(v, f.venueName));
    } catch (e) {
      console.error("[till] failed:", e);
      res.status(500).json({ message: "Something went wrong" });
    }
  };
  app.post("/api/till/check", till(false));
  app.post("/api/till/redeem", till(true));
}
