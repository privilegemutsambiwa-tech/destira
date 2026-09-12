// Admin session — deliberately separate from the member session (module
// replit_integrations/auth/replitAuth.ts): its own cookie name, own store, own
// (much shorter) lifetime, and no passport. Mounted ONLY on /api/admin/* so an
// admin cookie is never read on a member route or vice versa.
import session from "express-session";
import createMemoryStore from "memorystore";
import type { Express, Request, RequestHandler } from "express";

const MemoryStore = createMemoryStore(session);

const IDLE_MS = 30 * 60 * 1000; // 30 min idle
export const ADMIN_SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000; // 8h absolute, enforced in requireAdmin

declare module "express-session" {
  interface SessionData {
    adminUserId?: string;
    adminLoginAt?: number;
    totpVerifiedAt?: number;
    // set right before a destructive action's confirm step; cleared on use
    stepUpVerifiedAt?: number;
    // For My Account's "active sessions" list and "sign out everywhere" —
    // captured at login, refreshed on each authenticated request.
    ip?: string;
    userAgent?: string;
    lastSeenAt?: number;
  }
}

// A single store instance, not a new one per adminSessionMiddleware() call
// (which only happens once at mount time anyway) — exported so
// server/admin/account.ts can enumerate/destroy a given admin's sessions.
// In-process only, same as the rest of this session system: sessions don't
// survive a restart and aren't visible across instances if this ever scales
// out beyond one Node process.
export const adminSessionStore = new MemoryStore({ checkPeriod: IDLE_MS });

export function adminSessionMiddleware(): RequestHandler {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET === "local-dev-insecure-admin-secret")
  ) {
    console.warn(
      "[SECURITY] ADMIN_SESSION_SECRET is not set (or using the insecure local-dev default) " +
        "in production. Set a strong random value before any admin logs in.",
    );
  }
  return session({
    name: "destira.admin.sid",
    secret: process.env.ADMIN_SESSION_SECRET || "local-dev-insecure-admin-secret",
    store: adminSessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true, // idle timeout: re-extends on activity
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict", // stricter than the member cookie — admin never needs cross-site
      maxAge: IDLE_MS,
      path: "/api/admin",
    },
  });
}

export function mountAdminSession(app: Express) {
  app.use("/api/admin", adminSessionMiddleware());
}

export function requestIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

/** Captured at login, refreshed on every authenticated request thereafter —
 *  piggybacked on the session's natural per-request save, not an extra
 *  store round trip. */
export function touchSessionMeta(req: Request) {
  req.session.ip = requestIp(req);
  req.session.userAgent = (req.headers["user-agent"] as string) || "unknown";
  req.session.lastSeenAt = Date.now();
}

/** Every {sid, session} for one admin, newest-activity first — the shape
 *  My Account's "active sessions" list and "sign out everywhere" both need. */
export function listAdminSessions(adminUserId: string): Promise<{ sid: string; ip?: string; userAgent?: string; lastSeenAt?: number; loginAt?: number; current?: boolean }[]> {
  return new Promise((resolve, reject) => {
    adminSessionStore.all((err, sessions) => {
      if (err) return reject(err);
      const all = (sessions as unknown as Record<string, session.SessionData>) || {};
      const rows = Object.entries(all)
        .filter(([, s]) => s.adminUserId === adminUserId)
        .map(([sid, s]) => ({ sid, ip: s.ip, userAgent: s.userAgent, lastSeenAt: s.lastSeenAt, loginAt: s.adminLoginAt }))
        .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
      resolve(rows);
    });
  });
}

export function destroyAdminSession(sid: string): Promise<void> {
  return new Promise((resolve, reject) => {
    adminSessionStore.destroy(sid, (err) => (err ? reject(err) : resolve()));
  });
}

/** Kill every session for one admin — suspension/removal taking effect
 *  immediately, and "sign out everywhere" from My Account. */
export async function destroyAllAdminSessions(adminUserId: string): Promise<number> {
  const rows = await listAdminSessions(adminUserId);
  await Promise.all(rows.map((r) => destroyAdminSession(r.sid)));
  return rows.length;
}
