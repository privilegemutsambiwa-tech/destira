// Admin session — deliberately separate from the member session (module
// replit_integrations/auth/replitAuth.ts): its own cookie name, own store, own
// (much shorter) lifetime, and no passport. Mounted ONLY on /api/admin/* so an
// admin cookie is never read on a member route or vice versa.
import session from "express-session";
import createMemoryStore from "memorystore";
import pgSession from "connect-pg-simple";
import type { Express, Request, RequestHandler } from "express";
import { client as dbClient } from "../db";
import { Pool } from "pg";

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

// connect-pg-simple implements get/set/destroy/touch but NOT all() — express-
// session's base Store class leaves that to the implementation, and
// connect-pg-simple never added it (its README only advertises get/set/
// destroy/touch). listAdminSessions() below (My Account's "active sessions"
// list, and "sign out everywhere") depends on all() with the same shape
// memorystore's all() returns — fn(err, { [sid]: SessionData }) — so it's
// added here rather than silently breaking that feature on the switch.
function withAll(store: InstanceType<ReturnType<typeof pgSession>>, pool: Pool, tableName: string) {
  (store as any).all = function (fn: (err: Error | null, result?: Record<string, session.SessionData>) => void) {
    pool
      .query(`SELECT sid, sess FROM "${tableName}" WHERE expire > now()`)
      .then((res) => {
        const result: Record<string, session.SessionData> = {};
        for (const row of res.rows) result[row.sid] = row.sess as session.SessionData;
        fn(null, result);
      })
      .catch((err) => fn(err));
  };
  return store;
}

// A single store instance, not a new one per adminSessionMiddleware() call
// (which only happens once at mount time anyway) — exported so
// server/admin/account.ts can enumerate/destroy a given admin's sessions.
//
// Production (DATABASE_URL set): connect-pg-simple, in its own `admin_session`
// table (createTableIfMissing — no migration to write by hand) on the SAME
// Postgres `client` server/db.ts already opened. Sessions survive a restart
// and are visible across instances, unlike the in-memory store this replaced.
// Local dev (PGlite, no DATABASE_URL): connect-pg-simple needs a real `pg`
// connection, which PGlite isn't, so dev keeps the in-memory store — fine for
// a single local process that's never expected to survive a restart anyway.
const ADMIN_SESSION_TABLE = "admin_session";
export const adminSessionStore = process.env.DATABASE_URL
  ? withAll(
      // false, not true: createTableIfMissing reads connect-pg-simple's
      // bundled table.sql from disk relative to the module, but esbuild
      // flattens everything into dist/index.cjs without that file --
      // ENOENT on every boot in production, table present or not. The
      // table now exists (created once, by hand, same shape as
      // express_sessions: sid/sess jsonb/expire + an expire index).
      new (pgSession(session))({ pool: dbClient as Pool, tableName: ADMIN_SESSION_TABLE, createTableIfMissing: false, pruneSessionInterval: 60 * 15 }),
      dbClient as Pool,
      ADMIN_SESSION_TABLE,
    )
  : new MemoryStore({ checkPeriod: IDLE_MS });

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
    // Both branches of adminSessionStore always define `all` (memorystore
    // natively, the pg-backed store via withAll above) — express-session's
    // base Store type just declares it optional.
    adminSessionStore.all!((err, sessions) => {
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
