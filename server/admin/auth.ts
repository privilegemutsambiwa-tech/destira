// Admin identity: login (email + password, against the SAME users table member
// auth uses) -> forced TOTP enrollment/verification -> a session distinct from
// the member one (session.ts). requireAdmin() is the only way a route may sit
// behind admin auth; adminRoute() is the only way a route may be registered
// under /api/admin (enforced statically — see scripts/check-admin-routes.ts,
// run via `npm run check:admin-routes`, which fails the build if any handler
// bypasses it). A route registered without going through adminRoute() is a
// bug this repo is set up to catch before merge, not at 2am after a leak.

import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { db } from "../db";
import { adminUsers, users } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { verifyPassword } from "../replit_integrations/auth/password";
import { encryptSecret, decryptSecret } from "./crypto";
import { ADMIN_SESSION_ABSOLUTE_MS } from "./session";
import { auditAdmin } from "./audit";
import { adminRoleRank, meetsAdminRole, type AdminRole } from "@shared/admin";

// ── login attempt lockout — tighter than the member login (5/15min vs 8/15min) ──
const attempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function isLockedOut(key: string): boolean {
  const e = attempts.get(key);
  if (!e) return false;
  if (Date.now() - e.firstAttempt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return e.count >= MAX_ATTEMPTS;
}
function recordFailure(key: string): number {
  const e = attempts.get(key);
  if (!e || Date.now() - e.firstAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttempt: Date.now() });
    return 1;
  }
  e.count += 1;
  return e.count;
}
function clearFailures(key: string) {
  attempts.delete(key);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of Array.from(attempts.entries())) {
    if (now - e.firstAttempt > WINDOW_MS) attempts.delete(k);
  }
}, 5 * 60 * 1000);

// Hook for Phase 4: called on lockout so it can page an admin. Set once the
// email layer exists; a no-op until then.
export let onAdminLockout: (email: string, attemptCount: number) => void = () => {};
export function setAdminLockoutHook(fn: typeof onAdminLockout) {
  onAdminLockout = fn;
}

async function loadActiveAdmin(userId: string) {
  const [row] = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.userId, userId), isNull(adminUsers.revokedAt)));
  return row;
}

// ── requireAdmin — the only gate; default deny ───────────────────────────
export function requireAdmin(minRole: AdminRole): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const adminUserId = req.session?.adminUserId;
    if (!adminUserId) return res.status(401).json({ message: "Not signed in" });

    const loginAt = req.session?.adminLoginAt ?? 0;
    if (Date.now() - loginAt > ADMIN_SESSION_ABSOLUTE_MS) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Session expired — sign in again" });
    }
    if (!req.session?.totpVerifiedAt) {
      return res.status(401).json({ message: "2FA required" });
    }

    const admin = await loadActiveAdmin(adminUserId);
    if (!admin) {
      req.session.destroy(() => {});
      return res.status(403).json({ message: "Access revoked" });
    }
    if (!meetsAdminRole(admin.role, minRole)) {
      return res.status(403).json({ message: "Insufficient role" });
    }
    (req as any).admin = admin;
    next();
  };
}

/** Re-verify the account password within an already-valid admin session, for
 *  a destructive action. Sets a short-lived stepUpVerifiedAt the caller must
 *  check itself (requireStepUp below) — deliberately separate from
 *  requireAdmin so ordinary reads don't force a password prompt. */
export function requireStepUp(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const verifiedAt = req.session?.stepUpVerifiedAt ?? 0;
    if (Date.now() - verifiedAt > 5 * 60 * 1000) {
      return res.status(401).json({ message: "Re-enter your password to continue", stepUpRequired: true });
    }
    next();
  };
}

type AdminHandler = (req: Request, res: Response, next: NextFunction) => any;

/** The ONLY sanctioned way to register a route under /api/admin (outside the
 *  pre-auth routes this file itself registers below). Bakes requireAdmin in —
 *  a route can't be added without declaring a minRole. */
export function adminRoute(
  app: Express,
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string,
  minRole: AdminRole,
  ...handlers: AdminHandler[]
) {
  app[method](path, requireAdmin(minRole), ...handlers);
}

// ── pre-auth routes: login, TOTP enroll/verify, logout, whoami ──────────
export function registerAdminAuthRoutes(app: Express) {
  app.post("/api/admin/auth/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const key = email.trim().toLowerCase();
    if (isLockedOut(key)) {
      return res.status(429).json({ message: "Too many attempts. Try again later." });
    }
    // Generic failure message throughout — never reveal whether an email
    // belongs to a member, an admin, or nobody.
    const fail = () => {
      const n = recordFailure(key);
      if (n >= MAX_ATTEMPTS) onAdminLockout(key, n);
      return res.status(401).json({ message: "Invalid credentials" });
    };
    try {
      const { authStorage } = await import("../replit_integrations/auth/storage");
      const user = await authStorage.getUserByEmail(key);
      if (!user) return fail();
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return fail();
      const admin = await loadActiveAdmin(user.id);
      if (!admin) return fail();

      clearFailures(key);
      req.session.adminUserId = user.id;
      req.session.adminLoginAt = Date.now();
      req.session.totpVerifiedAt = undefined; // TOTP is a separate step, every login
      await auditAdmin(req, user.id, "admin.login", { details: { totpEnrolled: !!admin.totpEnabledAt } });
      res.json({ ok: true, totpEnrolled: !!admin.totpEnabledAt });
    } catch (e) {
      console.error("[admin] login error:", e);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // First-time enrollment: only reachable once logged in (adminUserId set)
  // but before TOTP is verified, and only if no secret exists yet.
  app.post("/api/admin/auth/totp/enroll", async (req, res) => {
    const adminUserId = req.session?.adminUserId;
    if (!adminUserId) return res.sendStatus(401);
    try {
      const admin = await loadActiveAdmin(adminUserId);
      if (!admin) return res.sendStatus(403);
      if (admin.totpEnabledAt) return res.status(409).json({ message: "2FA already enrolled" });

      const secret = authenticator.generateSecret();
      await db.update(adminUsers).set({ totpSecret: encryptSecret(secret) }).where(eq(adminUsers.id, admin.id));

      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, adminUserId));
      const otpauth = authenticator.keyuri(user?.email || adminUserId, "Destira Admin", secret);
      const qrDataUrl = await QRCode.toDataURL(otpauth);
      await auditAdmin(req, adminUserId, "admin.totp_enroll_start");
      res.json({ qrDataUrl, secret }); // secret shown once as a manual-entry fallback
    } catch (e) {
      console.error("[admin] totp enroll error:", e);
      res.status(500).json({ message: "Could not start 2FA enrollment" });
    }
  });

  app.post("/api/admin/auth/totp/verify", async (req, res) => {
    const adminUserId = req.session?.adminUserId;
    if (!adminUserId) return res.sendStatus(401);
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: "Enter the 6-digit code" });
    try {
      const admin = await loadActiveAdmin(adminUserId);
      if (!admin?.totpSecret) return res.status(400).json({ message: "2FA isn't set up yet" });
      const secret = decryptSecret(admin.totpSecret);
      const valid = authenticator.verify({ token: code, secret });
      if (!valid) {
        await auditAdmin(req, adminUserId, "admin.totp_verify_failed");
        return res.status(401).json({ message: "Wrong code" });
      }
      req.session.totpVerifiedAt = Date.now();
      if (!admin.totpEnabledAt) {
        await db.update(adminUsers).set({ totpEnabledAt: new Date() }).where(eq(adminUsers.id, admin.id));
      }
      await auditAdmin(req, adminUserId, "admin.totp_verify_ok");
      res.json({ ok: true, role: admin.role });
    } catch (e) {
      console.error("[admin] totp verify error:", e);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Step-up: re-enter password within an existing, TOTP-verified session,
  // ahead of a destructive action.
  app.post("/api/admin/auth/step-up", requireAdmin("read_only"), async (req, res) => {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    try {
      const { authStorage } = await import("../replit_integrations/auth/storage");
      const user = await authStorage.getUser(req.session.adminUserId!);
      const ok = await verifyPassword(password, user?.passwordHash);
      if (!ok) return res.status(401).json({ message: "Wrong password" });
      req.session.stepUpVerifiedAt = Date.now();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed" });
    }
  });

  app.get("/api/admin/auth/whoami", async (req, res) => {
    const adminUserId = req.session?.adminUserId;
    if (!adminUserId || !req.session?.totpVerifiedAt) return res.status(401).json({ message: "Not signed in" });
    const admin = await loadActiveAdmin(adminUserId);
    if (!admin) return res.status(403).json({ message: "Access revoked" });
    const { authStorage } = await import("../replit_integrations/auth/storage");
    const user = await authStorage.getUser(adminUserId);
    res.json({ role: admin.role, email: user?.email, firstName: user?.firstName });
  });

  app.post("/api/admin/auth/logout", (req, res) => {
    req.session?.destroy(() => res.json({ ok: true }));
  });
}

export { adminRoleRank };
