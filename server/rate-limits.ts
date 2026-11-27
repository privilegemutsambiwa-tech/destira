// Rate limits (Part K4), in one place. Two kinds:
//
// Before sign-in (registerSignInRateLimits, mounted in server/index.ts before
// anything else): sign-up, sign-in, password reset. Many phones in Zimbabwe
// share one mobile-network address, so an address is only ever a generous
// backstop; the phone's own device id (the vf_dev cookie, or the app's
// x-destira-device header) is the real key where there is one, and sign-in
// also has its per-email lockout (replit_integrations/auth/routes.ts).
//
// Signed in (registerMemberRateLimits, mounted in routes.ts after the
// session): per member, never per address. These catch a stuck button, a
// script or a runaway client, far above what a person does by hand. Plan
// limits (daily likes, daily passes) are a different thing and live in
// server/gate.ts.
//
// Every refusal is a 429 with a message the app shows as is.
import type { Express, Request } from "express";
import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import { deviceIdOf } from "./safety";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const ipKey = (req: Request) => `ip:${ipKeyGenerator(req.ip ?? "")}`;
const deviceOrIp = (req: Request) => {
  const d = deviceIdOf(req);
  return d ? `dev:${d}` : ipKey(req);
};
const memberKey = (req: Request) => {
  const id = (req as any).user?.claims?.sub;
  return id ? `u:${id}` : ipKey(req);
};

function limiter(o: {
  windowMs: number;
  limit: Options["limit"];
  message: string;
  key: (req: Request) => string;
  /** Count only what worked (a typo shouldn't use up a try). */
  successesOnly?: boolean;
}) {
  return rateLimit({
    windowMs: o.windowMs,
    limit: o.limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: o.key,
    // Reading (GET) never counts: "am I signed in" is asked on every screen.
    skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
    skipFailedRequests: o.successesOnly ?? false,
    message: { message: o.message },
  });
}

/** The limits below, by name, for the tests and for anyone reading. */
export const LIMITS = {
  authFlood: { windowMs: 15 * MIN, limit: 150 },
  signupPerDevice: { windowMs: HOUR, limit: 5 },
  signupPerAddress: { windowMs: HOUR, limit: 60 },
  resetPerAddress: { windowMs: HOUR, limit: 30 },
  likes: { windowMs: MIN, limit: 60 },
  likesHour: { windowMs: HOUR, limit: 600 },
  messages: { windowMs: MIN, limit: 30 },
  media: { windowMs: MIN, limit: 15 },
  roomPosts: { windowMs: MIN, limit: 30 },
  storyReplies: { windowMs: MIN, limit: 20 },
  reports: { windowMs: HOUR, limit: 20 },
  ai: { windowMs: MIN, limit: 20 },
  aiDay: { windowMs: DAY, limit: 400 },
} as const;

export function registerSignInRateLimits(app: Express) {
  // Everything under /api/auth: a flood backstop per address.
  app.use(
    "/api/auth",
    limiter({ ...LIMITS.authFlood, key: ipKey, message: "Too many tries from this network. Please wait a few minutes and try again." }),
  );
  // New accounts: a few per phone an hour; more per address, since a whole
  // campus or office can sit behind one.
  app.use(
    "/api/auth/signup",
    limiter({
      windowMs: HOUR,
      limit: (req) => (deviceIdOf(req) ? LIMITS.signupPerDevice.limit : LIMITS.signupPerAddress.limit),
      key: deviceOrIp,
      // Accounts made, not attempts: mistyping an email doesn't use one up.
      successesOnly: true,
      message: "You've made a few accounts from this phone already. Please try again in an hour.",
    }),
  );
  // Reset requests are also limited per email (quietly, so it can't be used
  // to find out who has an account); this stops one place sending thousands.
  app.use(
    ["/api/auth/forgot-password", "/api/auth/reset-password"],
    limiter({ ...LIMITS.resetPerAddress, key: deviceOrIp, message: "Too many password reset tries. Please wait an hour and try again." }),
  );
}

export function registerMemberRateLimits(app: Express) {
  const m = (l: { windowMs: number; limit: number }, message: string) => limiter({ ...l, key: memberKey, message });

  // Likes: liking, liking back, super likes. Per minute and per hour.
  const likePaths = [/^\/api\/matches$/, /^\/api\/likes$/, /^\/api\/likes\/\d+\/like-back$/, /^\/api\/discover\/super-like$/];
  app.use(likePaths, m(LIMITS.likes, "You're liking very fast. Slow down and take a proper look; try again in a minute."));
  app.use(likePaths, m(LIMITS.likesHour, "That's a lot of likes in an hour. Take a break and come back a little later."));

  // Messages and posts.
  app.use(/^\/api\/messages\/\d+$/, m(LIMITS.messages, "You're sending messages very fast. Take a breath and try again in a minute."));
  app.use(/^\/api\/messages\/\d+\/media$/, m(LIMITS.media, "You're sending a lot of photos and voice notes. Try again in a minute."));
  app.use(/^\/api\/groups\/\d+\/messages$/, m(LIMITS.roomPosts, "You're posting very fast. Try again in a minute."));
  app.use(/^\/api\/stories\/\d+\/comments$/, m(LIMITS.storyReplies, "Too many replies at once. Try again in a minute."));

  // Reports of a member or an event, one count between them.
  app.use(
    [/^\/api\/users\/[^/]+\/report$/, /^\/api\/events\/\d+\/report$/],
    m(LIMITS.reports, "You've sent a lot of reports this hour. Our team is on it; try again later."),
  );

  // Everything that asks the AI: per minute, and a daily ceiling far above
  // real use that stops a runaway client running up the bill. Individual
  // endpoints keep their own tighter checks where they have them.
  const aiPaths = [
    /^\/api\/twin\/(chat|preview|extract-profile|extract-trait)$/,
    /^\/api\/twin\/coach\/[a-z-]+$/,
    /^\/api\/twin\/writer\/[a-z-]+$/,
    // A mounted pattern has to end on a path boundary, so match it whole.
    /^\/api\/ai\/.+$/,
    /^\/api\/chat\/\d+\/suggest$/,
    /^\/api\/profile\/refine-text$/,
    /^\/api\/profiles\/generate-(summary|twin)$/,
    /^\/api\/interviews(\/\d+\/chat)?$/,
    /^\/api\/matchmaker\/chat$/,
    /^\/api\/wingman$/,
    /^\/api\/generate-image$/,
  ];
  app.use(aiPaths, m(LIMITS.ai, "You're asking a lot at once. Give it a minute and try again."));
  app.use(aiPaths, m(LIMITS.aiDay, "You've used the AI a great deal today. It'll be ready again tomorrow."));
}
