// The Destira Android/iOS app runs its own packaged copy of the site (from
// https://localhost inside the app) and talks to this server across origins.
// The website's session cookie is SameSite=Lax, which an app on another
// origin can't use, so the app signs in with a token instead. Nothing here
// changes how the website itself works.
//
//  - CORS for the app's fixed origins only (never a wildcard)
//  - "Authorization: Bearer <session id>" from the app is turned back into
//    the usual session cookie before express-session sees the request
//  - after sign-in, the app receives that session id in X-Destira-Session
//  - members-only /uploads paths in JSON become short-lived signed /m/ links,
//    since an <img> in the app can't send the token
import type { Express, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import path from "path";
import { getSignedUrl, getObjectBuffer, isObjectStorageEnabled } from "./storage/objectStorage";

const APP_ORIGINS = new Set(["https://localhost", "capacitor://localhost", "http://localhost"]);
const SESSION_COOKIE = "connect.sid";
const secret = () => process.env.SESSION_SECRET || "local-dev-insecure-secret";

export function isAppRequest(req: Request): boolean {
  return req.get("x-destira-client") === "app";
}

// express-session's signed cookie value: "<sid>.<base64 HMAC-SHA256>" (the
// same thing the cookie-signature package produces).
function signSessionId(sid: string): string {
  return `${sid}.${crypto.createHmac("sha256", secret()).update(sid).digest("base64").replace(/=+$/, "")}`;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url").slice(0, 32);
}

// A day-numbered expiry (today + 2), so a photo's link stays the same all day
// and the phone can cache it, but an old link stops working soon after.
function mediaUrl(key: string, origin: string): string {
  const exp = Math.floor(Date.now() / 86_400_000) + 2;
  return `${origin}/m/${key.split("/").map(encodeURIComponent).join("/")}?e=${exp}&s=${sign(`${key}.${exp}`)}`;
}

function rewriteMedia(value: unknown, origin: string, depth = 0): unknown {
  if (depth > 12) return value;
  if (typeof value === "string") return value.startsWith("/uploads/") ? mediaUrl(value.slice("/uploads/".length), origin) : value;
  if (Array.isArray(value)) return value.map((v) => rewriteMedia(v, origin, depth + 1));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteMedia(v, origin, depth + 1);
    return out;
  }
  return value;
}

function publicOrigin(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

/** Mount before the session middleware (setupAuth). */
export function mountAppClient(app: Express) {
  // CORS, for the app's origins only.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.get("origin");
    if (origin && APP_ORIGINS.has(origin) && (req.path.startsWith("/api/") || req.path.startsWith("/m/"))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Destira-Client");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Expose-Headers", "X-Destira-Session");
      res.setHeader("Access-Control-Max-Age", "600");
      if (req.method === "OPTIONS") return res.sendStatus(204);
    }
    // The app's welcome screen shows the website's public photos.
    if (req.path.startsWith("/photos/")) res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!isAppRequest(req)) return next();

    // Token → the same signed cookie the website would have sent.
    const auth = req.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const sid = auth.slice(7).trim();
      if (/^[A-Za-z0-9_-]{16,128}$/.test(sid)) {
        const cookie = `${SESSION_COOKIE}=${encodeURIComponent(`s:${signSessionId(sid)}`)}`;
        const others = (req.headers.cookie ?? "").split(/;\s*/).filter((c) => c && !c.startsWith(`${SESSION_COOKIE}=`));
        req.headers.cookie = [...others, cookie].join("; ");
      }
    }

    // Hand the signed-in session's id back so the app can keep using it.
    const writeHead = res.writeHead;
    res.writeHead = function (this: Response, ...args: any[]) {
      const r = req as any;
      if (r.sessionID && r.session?.passport?.user && !res.headersSent) res.setHeader("X-Destira-Session", r.sessionID);
      return (writeHead as any).apply(this, args);
    } as any;

    // Members-only photo paths → signed links an <img> can load.
    const json = res.json.bind(res);
    res.json = ((body: unknown) => json(rewriteMedia(body, publicOrigin(req)))) as any;
    next();
  });

  // The signed links themselves. No session needed: the signature is the key.
  app.get("/m/*key", async (req: Request, res: Response) => {
    const parts = (req.params as any).key;
    const key = Array.isArray(parts) ? parts.join("/") : String(parts ?? "");
    const exp = Number(req.query.e);
    const sig = String(req.query.s ?? "");
    const today = Math.floor(Date.now() / 86_400_000);
    if (!key || key.includes("..") || !Number.isInteger(exp) || exp < today) return res.sendStatus(404);
    const expected = sign(`${key}.${exp}`);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return res.sendStatus(404);
    // The app shows these from another origin (helmet defaults to same-origin).
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (isObjectStorageEnabled) {
      const url = await getSignedUrl(key, 3 * 3600);
      return url ? res.redirect(url) : res.sendStatus(404);
    }
    const buf = await getObjectBuffer(key);
    if (!buf) return res.sendStatus(404);
    res.type(path.extname(key) || "application/octet-stream").send(buf);
  });
}
