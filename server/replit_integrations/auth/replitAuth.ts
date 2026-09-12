// LOCAL AUTH — replaces Replit Auth (OIDC).
//
// The original implementation authenticated against Replit's OIDC provider.
// Off Replit there's no such provider, so this module implements real
// email/password auth instead (see ./routes.ts for the /api/auth/signup and
// /api/auth/login handlers). This file owns the session/passport plumbing
// that both the old and new implementations share:
//
//   GET /api/logout  -> clears the session, redirects to /
//   GET /api/login, /api/callback -> legacy links; redirect to the real
//     client-rendered /login page instead of auto-signing anyone in.
//
// The logged-in user object matches the shape the app expects elsewhere:
//   req.user.claims.sub / .email / .first_name / ...
//
// To restore real Replit OIDC, reinstate that version from git history.

import session from "express-session";
import createMemoryStore from "memorystore";
import passport from "passport";
import type { Express, RequestHandler } from "express";

const MemoryStore = createMemoryStore(session);

// Sessions here aren't OAuth tokens with a real expiry, so we set a
// far-future "exp" — this keeps any token-freshness checks elsewhere in the
// app satisfied without needing a refresh flow.
const SESSION_EXPIRES_AT = Math.floor(new Date("2100-01-01T00:00:00Z").getTime() / 1000);

export interface SessionSourceUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

// Builds the req.user shape the rest of the app relies on
// (req.user.claims.sub, etc.) from a DB user row.
export function createSessionUser(user: SessionSourceUser) {
  return {
    claims: {
      sub: user.id,
      email: user.email ?? undefined,
      first_name: user.firstName ?? undefined,
      last_name: user.lastName ?? undefined,
      profile_image_url: user.profileImageUrl ?? undefined,
      exp: SESSION_EXPIRES_AT,
    },
    access_token: "local-session",
    refresh_token: "local-session",
    expires_at: SESSION_EXPIRES_AT,
  };
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week

  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "local-dev-insecure-secret")
  ) {
    console.warn(
      "[SECURITY] SESSION_SECRET is not set (or is using the insecure local-dev default) " +
        "in production. Set a strong random SESSION_SECRET before real users sign in.",
    );
  }

  return session({
    secret: process.env.SESSION_SECRET || "local-dev-insecure-secret",
    store: new MemoryStore({ checkPeriod: sessionTtl }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

// The admin console mounts its own, separately-named session middleware on
// /api/admin (see server/admin/session.ts). Both middlewares write to the
// same req.session property, so if this member middleware also ran on admin
// paths, whichever ran last would silently win — the two would fight over
// req.session/req.sessionID and only one Set-Cookie would ever reach the
// client (this is exactly how an earlier version of the admin console shipped
// with admin login silently issuing a member connect.sid cookie instead of
// its own). Excluding /api/admin here is what actually makes the two
// sessions "entirely separate" rather than just separately coded.
function skipAdminPaths(mw: RequestHandler): RequestHandler {
  return (req, res, next) => {
    if (req.path.startsWith("/api/admin")) return next();
    return mw(req, res, next);
  };
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(skipAdminPaths(getSession()));
  app.use(skipAdminPaths(passport.initialize()));
  app.use(skipAdminPaths(passport.session()));

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user as any));

  // Legacy Replit-style links. These used to auto-sign the visitor in as a
  // single fixed user — that was the bug. Now they just forward to the real,
  // credential-checked login page.
  app.get("/api/login", (_req, res) => res.redirect("/login"));
  app.get("/api/callback", (_req, res) => res.redirect("/login"));

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session?.destroy(() => res.redirect("/"));
    });
  });

  app.get("/debug/auth", (req: any, res) => {
    res.status(200).json({
      isAuthenticated: req.isAuthenticated?.() ?? false,
      user: req.user ? { id: req.user.claims?.sub, email: req.user.claims?.email } : null,
      sessionID: req.sessionID ?? null,
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated() && (req.user as any)?.claims?.sub) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};
