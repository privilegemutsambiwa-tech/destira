// Console: member lookup and actions (docs/destira-3-upgrade-prompt.md Part L1, L2).
//
//   GET  /api/admin/members?q=           search by name, email, payment phone ending, or id
//   GET  /api/admin/members/:id          one member: profile, plan, payments, reports, verification,
//                                         risk flags, sign-ins, and what the team has done
//   POST /api/admin/members/:id/actions  { type, reason, ... } every action audited with its reason
//
// No message content here: reports show their category and the reporter's
// own note, risk flags show what kind of signal it was, never the words.
import type { Express } from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  adminAuditLog, memberSignIns, payments, profiles, reports, riskFlags, subscriptions, users, verificationRequests,
} from "@shared/schema";
import {
  ADMIN_ONLY_ACTIONS, GRANT_TIERS, MAX_CREDIT, MAX_GRANT_DAYS, MEMBER_ACTIONS, STEP_UP_ACTIONS,
  isFreePlanProvider, type MemberAction, type MemberSearchRow,
} from "@shared/member-admin";
import { adminRoute, requireStepUp } from "./auth";
import { auditAdmin } from "./audit";
import { forgetStatus } from "../safety";
import { notify } from "../push";

const DAY = 86_400_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function searchMembers(raw: string): Promise<MemberSearchRow[]> {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const digits = q.replace(/\D/g, "");
  const conds = [ilike(users.email, like), ilike(profiles.displayName, like)];
  if (isUuid(q)) conds.push(eq(users.id, q));
  // Payments only keep the last digits of a phone ("07•• ••• 1234").
  if (digits.length >= 4) {
    conds.push(
      sql`${users.id} in (select user_id from payments where right(regexp_replace(coalesce(phone_number_masked, ''), '\\D', '', 'g'), 4) = ${digits.slice(-4)})`,
    );
  }
  const found = await db
    .select({
      userId: users.id, email: users.email, createdAt: users.createdAt,
      name: profiles.displayName, tier: profiles.subscriptionTier, moderationStatus: profiles.moderationStatus, isVerified: profiles.isVerified,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(or(...conds))
    .orderBy(desc(users.createdAt))
    .limit(25);
  return found.map((r) => ({
    userId: r.userId, name: r.name, email: r.email, tier: r.tier ?? null,
    moderationStatus: r.moderationStatus ?? "active", isVerified: !!r.isVerified, joinedAt: iso(r.createdAt),
  }));
}

export async function memberDetail(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return null;
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt)).limit(1);
  const [pays, made, received, verifs, flags, signIns, actions] = await Promise.all([
    db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt)).limit(30),
    db.select({ id: reports.id, subjectId: reports.subjectId, category: reports.category, status: reports.status, createdAt: reports.createdAt })
      .from(reports).where(eq(reports.reporterId, userId)).orderBy(desc(reports.createdAt)).limit(20),
    db.select({ id: reports.id, reporterId: reports.reporterId, category: reports.category, status: reports.status, createdAt: reports.createdAt })
      .from(reports).where(eq(reports.subjectId, userId)).orderBy(desc(reports.createdAt)).limit(20),
    db.select({ id: verificationRequests.id, status: verificationRequests.status, rejectReason: verificationRequests.rejectReason, createdAt: verificationRequests.createdAt, reviewedAt: verificationRequests.reviewedAt })
      .from(verificationRequests).where(eq(verificationRequests.userId, userId)).orderBy(desc(verificationRequests.createdAt)).limit(10),
    db.select({ id: riskFlags.id, kind: riskFlags.kind, severity: riskFlags.severity, source: riskFlags.source, status: riskFlags.status, createdAt: riskFlags.createdAt })
      .from(riskFlags).where(eq(riskFlags.userId, userId)).orderBy(desc(riskFlags.createdAt)).limit(30),
    db.select().from(memberSignIns).where(eq(memberSignIns.userId, userId)).orderBy(desc(memberSignIns.createdAt)).limit(15),
    db.select({ id: adminAuditLog.id, action: adminAuditLog.action, details: adminAuditLog.details, createdAt: adminAuditLog.createdAt, adminEmail: users.email })
      .from(adminAuditLog).leftJoin(users, eq(users.id, adminAuditLog.adminUserId))
      .where(and(eq(adminAuditLog.targetType, "user"), eq(adminAuditLog.targetId, userId)))
      .orderBy(desc(adminAuditLog.createdAt)).limit(30),
  ]);
  const otherIds = Array.from(new Set([...made.map((r) => r.subjectId), ...received.map((r) => r.reporterId)]));
  const names = otherIds.length
    ? new Map((await db.select({ id: profiles.userId, n: profiles.displayName }).from(profiles).where(inArray(profiles.userId, otherIds))).map((r) => [r.id, r.n]))
    : new Map<string, string | null>();
  const planLive = !!sub && sub.status === "active" && sub.tier !== "free" && !!sub.currentPeriodEnd && sub.currentPeriodEnd > new Date();
  return {
    userId,
    email: u.email,
    joinedAt: iso(u.createdAt),
    profile: p
      ? {
          name: p.displayName, age: p.age, location: p.location, lookingFor: p.lookingFor,
          isVerified: !!p.isVerified, verificationStatus: p.verificationStatus,
          moderationStatus: p.moderationStatus, moderationReason: p.moderationStatusReason, moderationAt: iso(p.moderationStatusAt),
          superLikes: p.superMatchesRemaining ?? 0, boosts: p.boostsRemaining ?? 0, likesPassUntil: iso(p.seeLikesUntil),
          onboarded: !!p.onboardingCompleted,
        }
      : null,
    plan: sub
      ? { tier: sub.tier, period: sub.period, provider: sub.provider, free: isFreePlanProvider(sub.provider), live: planLive, endsAt: iso(sub.currentPeriodEnd), cancelling: !!sub.cancelAtPeriodEnd }
      : null,
    payments: pays.map((x) => ({
      id: x.id, cents: x.amount, status: x.status, provider: x.provider, phone: x.phoneNumberMasked,
      what: x.purchaseLabel ?? (x.tier ? `${x.tier} (${x.period})` : "payment"),
      failureReason: x.failureReason, createdAt: iso(x.createdAt),
      refund: x.refundedAt ? { at: iso(x.refundedAt), cents: x.refundCents, note: x.refundNote } : null,
    })),
    reportsMade: made.map((r) => ({ id: r.id, about: names.get(r.subjectId) ?? "a member", category: r.category, status: r.status, createdAt: iso(r.createdAt) })),
    reportsReceived: received.map((r) => ({ id: r.id, from: names.get(r.reporterId) ?? "a member", category: r.category, status: r.status, createdAt: iso(r.createdAt) })),
    verification: verifs.map((v) => ({ ...v, createdAt: iso(v.createdAt), reviewedAt: iso(v.reviewedAt) })),
    riskFlags: flags.map((f) => ({ ...f, createdAt: iso(f.createdAt) })),
    signIns: signIns.map((s) => ({ method: s.method, network: s.network, device: s.device, at: iso(s.createdAt) })),
    teamActions: actions.map((a) => ({ id: a.id, action: a.action, details: a.details, by: a.adminEmail, at: iso(a.createdAt) })),
  };
}

type ActionBody = { type?: string; reason?: string; tier?: string; days?: number; count?: number; paymentId?: number; cents?: number };
type Out = { status: number; message: string } | { ok: true; message: string };

async function apply(adminUserId: string, userId: string, type: MemberAction, reason: string, b: ActionBody): Promise<Out> {
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!p) return { status: 404, message: "That member has no profile" };
  const now = new Date();

  if (type === "grant_plan_days") {
    const tier = b.tier as (typeof GRANT_TIERS)[number];
    const days = Math.floor(Number(b.days));
    if (!GRANT_TIERS.includes(tier)) return { status: 400, message: "Pick Spark, Flame or Ember" };
    if (!(days >= 1 && days <= MAX_GRANT_DAYS)) return { status: 400, message: `Grant 1 to ${MAX_GRANT_DAYS} days` };
    const add = days * DAY;
    await db.transaction(async (tx) => {
      const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt)).limit(1);
      const live = sub && sub.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
      if (sub && live && sub.tier === tier) {
        // Same plan: their paid period just runs longer; it stays a paid plan.
        await tx.update(subscriptions).set({ currentPeriodEnd: new Date(sub.currentPeriodEnd!.getTime() + add), updatedAt: now }).where(eq(subscriptions.id, sub.id));
      } else if (sub) {
        const base = live && sub.currentPeriodEnd ? sub.currentPeriodEnd : now;
        await tx.update(subscriptions).set({
          tier, status: "active", provider: "grant", period: "monthly", cancelAtPeriodEnd: false,
          currentPeriodStart: now, currentPeriodEnd: new Date(base.getTime() + add), updatedAt: now,
        }).where(eq(subscriptions.id, sub.id));
      } else {
        await tx.insert(subscriptions).values({ userId, tier, status: "active", provider: "grant", currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + add) });
      }
      await tx.update(profiles).set({ subscriptionTier: tier }).where(eq(profiles.userId, userId));
    });
    const name = tier[0].toUpperCase() + tier.slice(1);
    notify(userId, "account", { type: "plan", title: `${days} days of ${name}, on us`, body: "From the Destira team. Enjoy.", url: "/plans", tag: "plan-grant" }).catch(() => {});
    return { ok: true, message: `${days} days of ${name} granted` };
  }

  if (type === "credit_super_like" || type === "credit_boost") {
    const n = Math.floor(Number(b.count));
    if (!(n >= 1 && n <= MAX_CREDIT)) return { status: 400, message: `Credit 1 to ${MAX_CREDIT}` };
    const col = type === "credit_super_like" ? profiles.superMatchesRemaining : profiles.boostsRemaining;
    await db.update(profiles).set(type === "credit_super_like" ? { superMatchesRemaining: sql`coalesce(${col}, 0) + ${n}` } : { boostsRemaining: sql`coalesce(${col}, 0) + ${n}` }).where(eq(profiles.userId, userId));
    const what = type === "credit_super_like" ? (n === 1 ? "a super like" : `${n} super likes`) : n === 1 ? "a boost" : `${n} boosts`;
    return { ok: true, message: `Credited ${what}` };
  }

  if (type === "refund_given") {
    const id = Number(b.paymentId);
    const [pay] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, userId)));
    if (!pay) return { status: 404, message: "That payment isn't this member's" };
    if (pay.status !== "paid") return { status: 409, message: "Only a paid payment can be refunded" };
    if (pay.refundedAt) return { status: 409, message: "That refund is already recorded" };
    const cents = b.cents == null ? pay.amount : Math.round(Number(b.cents));
    if (!(cents >= 1 && cents <= pay.amount)) return { status: 400, message: "The refund can't be more than they paid" };
    await db.update(payments).set({ refundedAt: now, refundedBy: adminUserId, refundCents: cents, refundNote: reason }).where(eq(payments.id, id));
    return { ok: true, message: `Refund of $${(cents / 100).toFixed(2)} recorded` };
  }

  if (type === "reset_verification") {
    if (!p.isVerified && p.verificationStatus !== "verified") return { status: 409, message: "They aren't verified" };
    await db.update(profiles).set({ isVerified: false, verificationStatus: "unverified" }).where(eq(profiles.userId, userId));
    notify(userId, "account", { type: "verification", title: "Please verify again", body: "Your verified mark was removed. Take a new selfie to get it back.", url: "/settings#verify", tag: "verification" }).catch(() => {});
    return { ok: true, message: "Verification reset: they'll be asked for a new selfie" };
  }

  if (type === "suspend" || type === "ban") {
    if (p.moderationStatus === (type === "ban" ? "banned" : "suspended")) return { status: 409, message: `Already ${type === "ban" ? "banned" : "suspended"}` };
    await db.update(profiles).set({ moderationStatus: type === "ban" ? "banned" : "suspended", moderationStatusReason: reason, moderationStatusAt: now }).where(eq(profiles.userId, userId));
    forgetStatus(userId); // their open sessions stop at once
    return { ok: true, message: type === "ban" ? "Banned" : "Suspended" };
  }

  // reinstate
  if (p.moderationStatus === "active") return { status: 409, message: "They aren't suspended or banned" };
  await db.update(profiles).set({ moderationStatus: "active", moderationStatusReason: null, moderationStatusAt: now }).where(eq(profiles.userId, userId));
  forgetStatus(userId);
  return { ok: true, message: "Reinstated" };
}

export function registerMemberAdminRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/members", "support", async (req, res) => {
    try {
      res.json(await searchMembers(String(req.query.q ?? "")));
    } catch (e) {
      console.error("[admin] member search error:", e);
      res.status(500).json({ message: "Search failed" });
    }
  });

  adminRoute(app, "get", "/api/admin/members/:id", "support", async (req, res) => {
    try {
      const d = await memberDetail(String(req.params.id));
      if (!d) return res.status(404).json({ message: "No such member" });
      await auditAdmin(req, (req as any).admin.userId, "member.view", { targetType: "user", targetId: String(req.params.id) });
      res.json(d);
    } catch (e) {
      console.error("[admin] member detail error:", e);
      res.status(500).json({ message: "Failed to load member" });
    }
  });

  adminRoute(app, "post", "/api/admin/members/:id/actions", "support", (req, res, next) => {
    const type = req.body?.type as MemberAction;
    if (STEP_UP_ACTIONS.includes(type)) return requireStepUp()(req, res, next);
    next();
  }, async (req, res) => {
    const b = (req.body ?? {}) as ActionBody;
    const type = b.type as MemberAction;
    if (!MEMBER_ACTIONS.includes(type)) return res.status(400).json({ message: "Unknown action" });
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 1000) : "";
    if (!reason) return res.status(400).json({ message: "Write a reason. It goes in the audit log." });
    const admin = (req as any).admin;
    if (ADMIN_ONLY_ACTIONS.includes(type) && admin.role !== "admin" && admin.role !== "owner") {
      return res.status(403).json({ message: "That needs the admin role" });
    }
    try {
      const out = await apply(admin.userId, String(req.params.id), type, reason, b);
      if ("status" in out) return res.status(out.status).json({ message: out.message });
      await auditAdmin(req, admin.userId, `member.${type}`, {
        targetType: "user",
        targetId: String(req.params.id),
        details: { reason, tier: b.tier, days: b.days, count: b.count, paymentId: b.paymentId, cents: b.cents },
      });
      res.json(out);
    } catch (e) {
      console.error("[admin] member action error:", e);
      res.status(500).json({ message: "That didn't work" });
    }
  });
}
