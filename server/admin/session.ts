// Admin session — deliberately separate from the member session (module
// replit_integrations/auth/replitAuth.ts): its own cookie name, own store, own
// (much shorter) lifetime, and no passport. Mounted ONLY on /api/admin/* so an
// admin cookie is never read on a member route or vice versa.
import session from "express-session";
import createMemoryStore from "memorystore";
import type { Express, RequestHandler } from "express";

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
  }
}

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
    store: new MemoryStore({ checkPeriod: IDLE_MS }),
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
