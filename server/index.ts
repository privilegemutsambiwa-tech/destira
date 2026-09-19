import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';

if (!process.env.DEEPSEEK_API_KEY) {
  console.warn("DEEPSEEK_API_KEY not set — AI Twin calls will fail");
}

const app = express();
const httpServer = createServer(app);

// Standard security headers (X-Content-Type-Options, X-Frame-Options,
// Strict-Transport-Security, etc.) on every response. CSP is left off: this
// app serves a React SPA plus third-party embeds (Stripe, Supabase-hosted
// images) that would need bespoke directives to keep working, and that's out
// of scope for this pass — the headers below don't require that tuning.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

// Per-IP throttles: /api/auth/* against credential-stuffing / brute-force
// login attempts (on top of the per-email lockout in replit_integrations/
// auth/routes.ts), and /api/twin/* against hammering the LLM (on top of the
// per-user checkAIRateLimit in routes.ts) — both act before the request ever
// reaches a route handler, unauthenticated or not.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});
const twinRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please wait a moment." },
});
app.use("/api/auth", authRateLimiter);
app.use("/api/twin", twinRateLimiter);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  // Stripe billing depends on the Replit Stripe connector + a real Postgres URL.
  // Off Replit it is opt-in: set ENABLE_STRIPE=1 (and provide the connector env)
  // to turn it back on. Billing routes will simply error until then.
  if (process.env.ENABLE_STRIPE !== '1') {
    console.log('Stripe disabled (set ENABLE_STRIPE=1 to enable)');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('DATABASE_URL not set, skipping Stripe init');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    // REPLIT_DOMAINS only exists on Replit; PUBLIC_APP_URL is what every other
    // env var in this app already uses for "the real, public origin" (see
    // server/admin/team.ts, server/email/index.ts). Stripe itself still goes
    // through Replit's connector for credentials (server/stripeClient.ts) —
    // this alone doesn't make ENABLE_STRIPE=1 work off-Replit, it just stops
    // the webhook URL from being "https://undefined" if someone flips it on.
    const webhookBaseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : process.env.PUBLIC_APP_URL || 'http://localhost:5000';
    try {
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      console.log('Webhook configured:', result?.webhook?.url || 'managed');
    } catch (webhookErr: any) {
      console.warn('Webhook setup warning (non-fatal):', webhookErr.message);
    }

    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

// Not awaited: esbuild's CJS output (script/build.ts) can't emit top-level
// await, and there's nothing downstream in this file that depends on Stripe
// init finishing first — initStripe() already catches its own errors
// internally, .catch() here is just a safety net against something throwing
// before that try block runs.
initStripe().catch((e) => console.error('Unexpected error initializing Stripe:', e));

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  // Bind host: containers/Replit need 0.0.0.0; for local dev default to "::" so
  // both http://localhost (IPv6 ::1 on Windows) and http://127.0.0.1 resolve.
  const host =
    process.env.HOST ||
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "::");
  // `reusePort` triggers a libuv assertion on Windows; only pass it elsewhere.
  const listenOpts: Record<string, unknown> = { port, host };
  if (process.platform !== "win32") {
    listenOpts.reusePort = true;
  }
  httpServer.listen(listenOpts, () => {
    log(`serving on port ${port} (host ${host})`);
  });
})();
