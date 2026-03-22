import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "express_sessions",
    errorLog: (err: any) => console.error("[SESSION STORE ERROR]", err),
  });

  sessionStore.on("error", (err: any) => {
    console.error("[SESSION STORE EVENT ERROR]", err);
  });

  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      const user = {};
      updateUserSession(user, tokens);
      console.log("[AUTH VERIFY] Token claims:", JSON.stringify(tokens.claims()));
      await upsertUser(tokens.claims());
      console.log("[AUTH VERIFY] User upserted successfully, sub:", tokens.claims()?.sub ?? "unknown");
      verified(null, user);
    } catch (err: any) {
      console.error("[AUTH VERIFY ERROR]", err?.message || err);
      verified(err);
    }
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const callbackURL = `https://${domain}/api/callback`;
      console.log("[AUTH] Registering strategy for domain:", domain, "callbackURL:", callbackURL);
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => {
    console.log("[AUTH SERIALIZE] serializing user");
    cb(null, user);
  });

  passport.deserializeUser((user: Express.User, cb) => {
    cb(null, user);
  });

  app.get("/api/login", (req, res, next) => {
    const callbackURL = `https://${req.hostname}/api/callback`;
    console.log("[AUTH LOGIN] hostname:", req.hostname, "callbackURL:", callbackURL);
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    const sessionID = (req as any).sessionID;
    const sessionKeys = Object.keys((req as any).session || {});
    console.log("[AUTH CALLBACK] Hit. hostname:", req.hostname, "sessionID:", sessionID, "sessionKeys:", sessionKeys, "query:", JSON.stringify(req.query));
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/auth-debug",
    })(req, res, next);
  });

  app.get("/api/auth-debug", (req: any, res) => {
    const sessionData = req.session ? JSON.stringify(req.session, null, 2) : "no session";
    const queryData = JSON.stringify(req.query, null, 2);
    console.log("[AUTH DEBUG PAGE] session:", sessionData, "query:", queryData);
    res.status(200).send(`<!DOCTYPE html><html><head><title>Auth Debug</title></head><body>
      <h2>Auth Callback Failed</h2>
      <p><strong>Session ID:</strong> ${req.sessionID || "none"}</p>
      <p><strong>Is Authenticated:</strong> ${req.isAuthenticated?.() || false}</p>
      <p><strong>Session Data:</strong></p><pre>${sessionData}</pre>
      <p><strong>Query Params:</strong></p><pre>${queryData}</pre>
      <p><strong>Hostname:</strong> ${req.hostname}</p>
      <p><strong>Expected callback URL:</strong> https://${req.hostname}/api/callback</p>
      <hr/>
      <a href="/api/login">Try Again</a>
    </body></html>`);
  });

  app.get("/debug/auth", (req: any, res) => {
    const sessionData = req.session ? JSON.stringify(req.session, null, 2) : "no session";
    res.status(200).send(`<!DOCTYPE html><html><head><title>Auth State</title></head><body>
      <h2>Current Auth State</h2>
      <p><strong>Session ID:</strong> ${req.sessionID || "none"}</p>
      <p><strong>Is Authenticated:</strong> ${req.isAuthenticated?.() || false}</p>
      <p><strong>User:</strong> <pre>${JSON.stringify(req.user, null, 2) || "none"}</pre></p>
      <p><strong>Session Data:</strong></p><pre>${sessionData}</pre>
      <p><strong>Hostname:</strong> ${req.hostname}</p>
      <p><strong>Cookies:</strong> <pre>${JSON.stringify(req.headers.cookie)}</pre></p>
      <hr/>
      <a href="/api/login">Log In</a> | <a href="/api/logout">Log Out</a> | <a href="/">Home</a>
    </body></html>`);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;

  if (!user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    console.error("[AUTH REFRESH ERROR]", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};
