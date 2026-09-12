// Team management: invite, role changes, suspend/reactivate, remove. Every
// mutation here is audit-logged before it takes effect and re-checked
// server-side (never just in the client) — the invariants in the header
// comment on shared/schema.ts's adminUsers table are enforced here, not
// trusted from the request.
import type { Express } from "express";
import { db } from "../db";
import { adminUsers, adminInvites, users } from "@shared/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { adminRoute, requireStepUp } from "./auth";
import { auditAdmin } from "./audit";
import { generateOpaqueToken } from "./crypto";
import { destroyAllAdminSessions } from "./session";
import { resendConfigured, sendViaResend } from "../email/resend";
import { authStorage } from "../replit_integrations/auth/storage";
import { ADMIN_ROLES, ADMIN_ROLE_REFERENCE, adminRoleRank, type AdminRole } from "@shared/admin";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function baseUrl(): string {
  return process.env.PUBLIC_APP_URL || "http://localhost:5000";
}
function isValidRole(r: unknown): r is AdminRole {
  return typeof r === "string" && (ADMIN_ROLES as readonly string[]).includes(r);
}

// Only an owner may act on an owner (grant it, change it, suspend/remove
// one) — everyone else may act on anyone strictly below their own rank.
// Peers (e.g. one "admin" acting on another) are allowed; that's not a
// gap the spec asked to close, and this repo doesn't invent restrictions
// the brief didn't ask for.
function canActOnRole(actorRole: AdminRole, targetRole: AdminRole): boolean {
  if (targetRole === "owner") return actorRole === "owner";
  return adminRoleRank(actorRole) >= adminRoleRank(targetRole);
}

class LastOwnerError extends Error {}

/** Inside a transaction: locks every currently-active owner row so a
 *  concurrent request touching a DIFFERENT owner row can't also pass this
 *  check before either commits — the actual fix for the two-owners-remove-
 *  each-other race, not just a count-then-act read. Throws (aborting the
 *  transaction) if the action would leave zero active owners. Only meaningful
 *  when the target's CURRENT role is owner and the action removes their
 *  active-owner status (suspend / remove / demote) — a call for anyone else,
 *  or a promotion TO owner, is a no-op. */
async function guardLastOwner(tx: Tx, targetCurrentRole: string) {
  if (targetCurrentRole !== "owner") return;
  const activeOwners = await tx
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(and(eq(adminUsers.role, "owner"), isNull(adminUsers.revokedAt), isNull(adminUsers.suspendedAt)))
    .for("update");
  if (activeOwners.length <= 1) throw new LastOwnerError();
}

async function loadAdminByUserId(userId: string) {
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.userId, userId));
  return row;
}

export function registerAdminTeamRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/team", "admin", async (req, res) => {
    try {
      const rows = await db
        .select({ admin: adminUsers, user: users })
        .from(adminUsers)
        .innerJoin(users, eq(adminUsers.userId, users.id))
        .orderBy(desc(adminUsers.grantedAt));
      const grantedByIds = Array.from(new Set(rows.map((r) => r.admin.grantedBy).filter(Boolean))) as string[];
      const granterMap = new Map<string, string>();
      for (const id of grantedByIds) {
        const [g] = await db.select().from(users).where(eq(users.id, id));
        if (g) granterMap.set(id, [g.firstName, g.lastName].filter(Boolean).join(" ") || g.email || id);
      }

      const admins = rows.map(({ admin, user }) => ({
        userId: admin.userId,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
        email: user.email,
        role: admin.role,
        status: admin.revokedAt ? "removed" : admin.suspendedAt ? "suspended" : "active",
        totpEnabled: !!admin.totpEnabledAt,
        lastSignInAt: admin.lastSignInAt,
        grantedAt: admin.grantedAt,
        grantedByName: admin.grantedBy ? granterMap.get(admin.grantedBy) ?? admin.grantedBy : null,
        suspendedReason: admin.suspendedReason,
        revokedReason: admin.revokedReason,
      }));

      const invites = await db
        .select()
        .from(adminInvites)
        .where(and(isNull(adminInvites.acceptedAt), isNull(adminInvites.revokedAt)))
        .orderBy(desc(adminInvites.createdAt));

      res.json({
        admins,
        invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, createdAt: i.createdAt, expiresAt: i.expiresAt, expired: i.expiresAt < new Date() })),
        roleReference: ADMIN_ROLE_REFERENCE,
      });
    } catch (e) {
      console.error("[admin] team list error:", e);
      res.status(500).json({ message: "Failed to load team" });
    }
  });

  adminRoute(app, "post", "/api/admin/team/invite", "admin", async (req, res) => {
    const actor = (req as any).admin;
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const role = req.body?.role;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address" });
    if (!isValidRole(role)) return res.status(400).json({ message: "Invalid role" });
    if (!canActOnRole(actor.role, role)) {
      return res.status(403).json({ message: role === "owner" ? "Only an owner can invite another owner" : "Can't grant a role above your own" });
    }
    if (!resendConfigured()) {
      return res.status(503).json({
        message: "Email isn't configured yet (RESEND_API_KEY not set) — invites can't be sent until it is. No invite was created.",
        code: "EMAIL_NOT_CONFIGURED",
      });
    }
    try {
      const existingUser = await authStorage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "An account with this email already exists. Invite only creates a brand-new identity — promote an existing member with scripts/seed-admin.ts instead." });
      }
      const [existingInvite] = await db
        .select()
        .from(adminInvites)
        .where(and(eq(adminInvites.email, email), isNull(adminInvites.acceptedAt), isNull(adminInvites.revokedAt)));
      if (existingInvite && existingInvite.expiresAt > new Date()) {
        return res.status(409).json({ message: "There's already a pending invite for this email" });
      }

      const { raw, hash } = generateOpaqueToken();
      const [invite] = await db
        .insert(adminInvites)
        .values({ email, role, tokenHash: hash, invitedBy: actor.userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
        .returning();

      await auditAdmin(req, actor.userId, "team.invite_sent", { targetType: "invite", targetId: invite.id, details: { email, role } });

      const link = `${baseUrl()}/console/accept-invite?token=${raw}`;
      const r = await sendViaResend({
        to: email,
        subject: "You're invited to the Destira admin console",
        text: `You've been invited as ${role} on the Destira admin console. This link works once and expires in 24 hours:\n\n${link}\n\nIf you weren't expecting this, ignore it.`,
      });
      if (!r.ok) {
        await db.delete(adminInvites).where(eq(adminInvites.id, invite.id));
        return res.status(502).json({ message: `Failed to send the invite email: ${r.error}. No invite was created.` });
      }
      res.json({ ok: true, invite: { id: invite.id, email, role, expiresAt: invite.expiresAt } });
    } catch (e) {
      console.error("[admin] invite error:", e);
      res.status(500).json({ message: "Failed to send invite" });
    }
  });

  adminRoute(app, "post", "/api/admin/team/invites/:id/revoke", "admin", requireStepUp(), async (req, res) => {
    const actor = (req as any).admin;
    const id = Number(req.params.id);
    try {
      const [invite] = await db.select().from(adminInvites).where(eq(adminInvites.id, id));
      if (!invite || invite.acceptedAt || invite.revokedAt) return res.status(404).json({ message: "No pending invite here" });
      await auditAdmin(req, actor.userId, "team.invite_revoked", { targetType: "invite", targetId: id, details: { email: invite.email } });
      await db.update(adminInvites).set({ revokedAt: new Date(), revokedBy: actor.userId }).where(eq(adminInvites.id, id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to revoke invite" });
    }
  });

  adminRoute(app, "patch", "/api/admin/team/:userId/role", "owner", requireStepUp(), async (req, res) => {
    const actor = (req as any).admin;
    const targetUserId = String(req.params.userId);
    const newRole = req.body?.role;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (targetUserId === actor.userId) return res.status(400).json({ message: "You can't change your own role", code: "SELF_ACTION" });
    if (!isValidRole(newRole)) return res.status(400).json({ message: "Invalid role" });
    if (!reason) return res.status(400).json({ message: "A reason is required" });
    try {
      const target = await loadAdminByUserId(targetUserId);
      if (!target || target.revokedAt) return res.status(404).json({ message: "No such admin" });
      if (target.role === newRole) return res.status(400).json({ message: "Already that role" });

      await db.transaction(async (tx) => {
        await guardLastOwner(tx, target.role);
        await auditAdmin(
          req,
          actor.userId,
          "team.role_changed",
          { targetType: "admin_user", targetId: targetUserId, details: { from: target.role, to: newRole, reason } },
          tx,
        );
        await tx.update(adminUsers).set({ role: newRole }).where(eq(adminUsers.id, target.id));
      });
      res.json({ ok: true });
    } catch (e) {
      if (e instanceof LastOwnerError) {
        return res.status(409).json({ message: "This is the last active owner — the role can't be changed until another owner exists", code: "LAST_OWNER" });
      }
      console.error("[admin] role change error:", e);
      res.status(500).json({ message: "Failed to change role" });
    }
  });

  adminRoute(app, "post", "/api/admin/team/:userId/suspend", "admin", requireStepUp(), async (req, res) => {
    const actor = (req as any).admin;
    const targetUserId = String(req.params.userId);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (targetUserId === actor.userId) return res.status(400).json({ message: "You can't suspend yourself", code: "SELF_ACTION" });
    if (!reason) return res.status(400).json({ message: "A reason is required" });
    try {
      const target = await loadAdminByUserId(targetUserId);
      if (!target || target.revokedAt) return res.status(404).json({ message: "No such admin" });
      if (target.suspendedAt) return res.status(400).json({ message: "Already suspended" });
      if (!canActOnRole(actor.role, target.role as AdminRole)) return res.status(403).json({ message: "Can't act on a higher-privileged admin" });

      await db.transaction(async (tx) => {
        await guardLastOwner(tx, target.role);
        await auditAdmin(req, actor.userId, "team.admin_suspended", { targetType: "admin_user", targetId: targetUserId, details: { reason } }, tx);
        await tx.update(adminUsers).set({ suspendedAt: new Date(), suspendedBy: actor.userId, suspendedReason: reason }).where(eq(adminUsers.id, target.id));
      });
      const killed = await destroyAllAdminSessions(targetUserId);
      res.json({ ok: true, sessionsKilled: killed });
    } catch (e) {
      if (e instanceof LastOwnerError) {
        return res.status(409).json({ message: "This is the last active owner — they can't be suspended until another owner exists", code: "LAST_OWNER" });
      }
      console.error("[admin] suspend error:", e);
      res.status(500).json({ message: "Failed to suspend" });
    }
  });

  adminRoute(app, "post", "/api/admin/team/:userId/reactivate", "admin", requireStepUp(), async (req, res) => {
    const actor = (req as any).admin;
    const targetUserId = String(req.params.userId);
    try {
      const target = await loadAdminByUserId(targetUserId);
      if (!target || target.revokedAt) return res.status(404).json({ message: "No such admin" });
      if (!target.suspendedAt) return res.status(400).json({ message: "Not suspended" });
      if (!canActOnRole(actor.role, target.role as AdminRole)) return res.status(403).json({ message: "Can't act on a higher-privileged admin" });

      await auditAdmin(req, actor.userId, "team.admin_reactivated", { targetType: "admin_user", targetId: targetUserId });
      await db.update(adminUsers).set({ suspendedAt: null, suspendedBy: null, suspendedReason: null }).where(eq(adminUsers.id, target.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to reactivate" });
    }
  });

  adminRoute(app, "post", "/api/admin/team/:userId/remove", "admin", requireStepUp(), async (req, res) => {
    const actor = (req as any).admin;
    const targetUserId = String(req.params.userId);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (targetUserId === actor.userId) return res.status(400).json({ message: "You can't remove yourself", code: "SELF_ACTION" });
    if (!reason) return res.status(400).json({ message: "A reason is required" });
    try {
      const target = await loadAdminByUserId(targetUserId);
      if (!target || target.revokedAt) return res.status(404).json({ message: "No such admin" });
      if (!canActOnRole(actor.role, target.role as AdminRole)) return res.status(403).json({ message: "Can't act on a higher-privileged admin" });

      await db.transaction(async (tx) => {
        await guardLastOwner(tx, target.role);
        // The audit trail this admin generated over their whole tenure is
        // never touched — only the grant row changes. adminAuditLog has no
        // delete route, for anyone, ever; removing this admin doesn't add one.
        await auditAdmin(req, actor.userId, "team.admin_removed", { targetType: "admin_user", targetId: targetUserId, details: { reason } }, tx);
        await tx.update(adminUsers).set({ revokedAt: new Date(), revokedBy: actor.userId, revokedReason: reason }).where(eq(adminUsers.id, target.id));
      });
      const killed = await destroyAllAdminSessions(targetUserId);
      res.json({ ok: true, sessionsKilled: killed });
    } catch (e) {
      if (e instanceof LastOwnerError) {
        return res.status(409).json({ message: "This is the last active owner — they can't be removed until another owner exists", code: "LAST_OWNER" });
      }
      console.error("[admin] remove error:", e);
      res.status(500).json({ message: "Failed to remove" });
    }
  });
}
