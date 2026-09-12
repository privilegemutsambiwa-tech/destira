// "My account" — the signed-in admin's own settings. Ops identity only, not
// a member profile: no photos, no bio. Every route here acts on the caller
// (req.session.adminUserId) and never takes a target id from the client —
// there is no "account" route that can touch anyone else's row; that's what
// team.ts is for.
import type { Express } from "express";
import { db } from "../db";
import { adminUsers, adminRecoveryCodes, adminAuditLog, users } from "@shared/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { adminRoute, requireStepUp } from "./auth";
import { auditAdmin } from "./audit";
import { verifyPassword, hashPassword } from "../replit_integrations/auth/password";
import { generateRecoveryCode, hashOpaqueToken } from "./crypto";
import { listAdminSessions, destroyAdminSession, destroyAllAdminSessions } from "./session";
import { ADMIN_ROLE_REFERENCE, type AdminRole } from "@shared/admin";

const RECOVERY_CODE_COUNT = 10;

async function issueRecoveryCodes(adminUserId: string): Promise<string[]> {
  // Regeneration invalidates whatever's left of the old batch — a viewer who
  // only ever sees a code once shouldn't have two live batches to guess between.
  await db.delete(adminRecoveryCodes).where(and(eq(adminRecoveryCodes.adminUserId, adminUserId), isNull(adminRecoveryCodes.usedAt)));
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
  await db.insert(adminRecoveryCodes).values(codes.map((code) => ({ adminUserId, codeHash: hashOpaqueToken(code) })));
  return codes;
}

export function registerAdminAccountRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/account", "admin", async (req, res) => {
    const admin = (req as any).admin;
    try {
      const [user] = await db.select().from(users).where(eq(users.id, admin.userId));
      const grantedBy = admin.grantedBy ? await db.select().from(users).where(eq(users.id, admin.grantedBy)) : [];
      const [unusedCodes] = await db
        .select()
        .from(adminRecoveryCodes)
        .where(and(eq(adminRecoveryCodes.adminUserId, admin.userId), isNull(adminRecoveryCodes.usedAt)));
      res.json({
        email: user?.email, // sign-in identity — NOT the Email alerts page's default recipient; that's a separate, console-wide address
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
        role: admin.role,
        roleDescription: ADMIN_ROLE_REFERENCE[admin.role as AdminRole],
        totpEnabled: !!admin.totpEnabledAt,
        hasUnusedRecoveryCodes: !!unusedCodes,
        grantedAt: admin.grantedAt,
        grantedByName: grantedBy[0] ? [grantedBy[0].firstName, grantedBy[0].lastName].filter(Boolean).join(" ") || grantedBy[0].email : null,
        lastSignInAt: admin.lastSignInAt,
      });
    } catch (e) {
      console.error("[admin] account load error:", e);
      res.status(500).json({ message: "Failed to load account" });
    }
  });

  adminRoute(app, "patch", "/api/admin/account", "admin", async (req, res) => {
    const admin = (req as any).admin;
    const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim().slice(0, 80) : undefined;
    const lastName = typeof req.body?.lastName === "string" ? req.body.lastName.trim().slice(0, 80) : undefined;
    if (firstName === undefined && lastName === undefined) return res.status(400).json({ message: "Nothing to update" });
    try {
      const patch: Record<string, string> = {};
      if (firstName !== undefined) patch.firstName = firstName;
      if (lastName !== undefined) patch.lastName = lastName;
      await auditAdmin(req, admin.userId, "account.update_name", { details: patch });
      await db.update(users).set(patch).where(eq(users.id, admin.userId));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to save" });
    }
  });

  adminRoute(app, "post", "/api/admin/account/change-password", "admin", async (req, res) => {
    const admin = (req as any).admin;
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (newPassword.length < 8) return res.status(400).json({ message: "New password must be at least 8 characters" });
    try {
      const [user] = await db.select().from(users).where(eq(users.id, admin.userId));
      const ok = await verifyPassword(currentPassword, user?.passwordHash);
      if (!ok) return res.status(401).json({ message: "Current password is wrong" });
      const passwordHash = await hashPassword(newPassword);
      await db.update(users).set({ passwordHash }).where(eq(users.id, admin.userId));
      await auditAdmin(req, admin.userId, "account.change_password");
      // A changed password invalidates every OTHER session on the spot — the
      // one making this request stays alive so the admin isn't locked out of
      // their own change.
      const mine = req.sessionID;
      const sessions = await listAdminSessions(admin.userId);
      await Promise.all(sessions.filter((s) => s.sid !== mine).map((s) => destroyAdminSession(s.sid)));
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin] change password error:", e);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  adminRoute(app, "get", "/api/admin/account/sessions", "admin", async (req, res) => {
    const admin = (req as any).admin;
    try {
      const sessions = await listAdminSessions(admin.userId);
      res.json(
        sessions.map(({ sid, ...rest }) => ({ ...rest, sessionRef: sid.slice(0, 8), current: sid === req.sessionID })),
      );
    } catch (e) {
      res.status(500).json({ message: "Failed to load sessions" });
    }
  });

  adminRoute(app, "post", "/api/admin/account/sessions/sign-out-everywhere", "admin", requireStepUp(), async (req, res) => {
    const admin = (req as any).admin;
    try {
      const n = await destroyAllAdminSessions(admin.userId);
      await auditAdmin(req, admin.userId, "account.sign_out_everywhere", { details: { sessionsKilled: n } });
      res.json({ ok: true, sessionsKilled: n });
    } catch (e) {
      res.status(500).json({ message: "Failed to sign out" });
    }
  });

  adminRoute(app, "get", "/api/admin/account/audit-log", "admin", async (req, res) => {
    const admin = (req as any).admin;
    try {
      const rows = await db
        .select()
        .from(adminAuditLog)
        .where(eq(adminAuditLog.adminUserId, admin.userId))
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(50);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: "Failed to load audit log" });
    }
  });

  adminRoute(app, "post", "/api/admin/account/recovery-codes/regenerate", "admin", requireStepUp(), async (req, res) => {
    const admin = (req as any).admin;
    try {
      const codes = await issueRecoveryCodes(admin.userId);
      await auditAdmin(req, admin.userId, "account.recovery_codes_regenerated");
      res.json({ ok: true, recoveryCodes: codes });
    } catch (e) {
      res.status(500).json({ message: "Failed to regenerate recovery codes" });
    }
  });
}
