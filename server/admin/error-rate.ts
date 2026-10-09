// A live "is anything wrong right now" number for the overview screen, plus
// the failures behind it. Kept in memory, not a DB table — this is explicitly
// a right-now figure (see the build report §5: live is fine for the overview,
// rollups for anything historical), and persisting every request would be
// write amplification for no benefit. The failure list is bounded (500 rows /
// 24h) and resets on restart; say so wherever it's shown.
//
// What counts as a failure: an /api/ response with a 5xx status, or a render
// crash reported by the client's ErrorBoundary (POST /api/client-errors,
// which itself answers 204). 4xx (wrong password, not found, validation) are
// the caller's problem, not the platform's, so they don't count.
import { AsyncLocalStorage } from "async_hooks";

const WINDOW_MS = 15 * 60 * 1000;
const RETAIN_MS = 24 * 60 * 60 * 1000;
const MAX_FAILURES = 500;

const outcomes: { at: number; failed: boolean }[] = [];

export interface FailureRecord {
  at: number;
  kind: "server" | "client";
  method: string;
  route: string;
  status: number;
  message: string; // what the user-facing response/crash said
  cause: string | null; // the logged underlying error, when one was logged
}
const failures: FailureRecord[] = [];

// Per-request scratch space so the console.error a route handler already
// makes ("Create event error:", err) is attached to the failed request it
// belongs to, with no change to any of the ~hundreds of handlers.
const als = new AsyncLocalStorage<{ cause: string | null }>();
let consolePatched = false;

function describeArg(a: unknown): string | null {
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  if (typeof a === "string") return a;
  return null;
}

function installConsoleCapture() {
  if (consolePatched) return;
  consolePatched = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const store = als.getStore();
    if (store && !store.cause) {
      const err = args.find((a) => a instanceof Error);
      const text = describeArg(err) ?? args.map(describeArg).find(Boolean) ?? null;
      if (text) store.cause = text.slice(0, 300);
    }
    original(...args);
  };
}

function trimOutcomes() {
  const cutoff = Date.now() - WINDOW_MS;
  while (outcomes.length && outcomes[0].at < cutoff) outcomes.shift();
}

function trimFailures() {
  const cutoff = Date.now() - RETAIN_MS;
  while (failures.length && (failures[0].at < cutoff || failures.length > MAX_FAILURES)) failures.shift();
}

function recordOutcome(failed: boolean) {
  outcomes.push({ at: Date.now(), failed });
  if (outcomes.length > 5000) trimOutcomes();
}

function recordFailure(f: Omit<FailureRecord, "at">) {
  failures.push({ at: Date.now(), ...f });
  trimFailures();
}

export function recordClientCrash(info: { url?: string; message?: string }) {
  let path = "unknown page";
  try {
    if (info.url) path = new URL(info.url).pathname;
  } catch {
    /* keep default */
  }
  recordOutcome(true);
  recordFailure({
    kind: "client",
    method: "PAGE",
    route: normalizePath(path),
    status: 0,
    message: String(info.message ?? "Page crashed").slice(0, 300),
    cause: null,
  });
}

function normalizePath(p: string): string {
  return p
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
}

export function currentErrorRate(): { pct: number | null; sampleSize: number; failedCount: number; windowMinutes: number } {
  trimOutcomes();
  if (outcomes.length === 0) return { pct: null, sampleSize: 0, failedCount: 0, windowMinutes: WINDOW_MS / 60000 };
  const failed = outcomes.filter((e) => e.failed).length;
  return {
    pct: Math.round((failed / outcomes.length) * 1000) / 10,
    sampleSize: outcomes.length,
    failedCount: failed,
    windowMinutes: WINDOW_MS / 60000,
  };
}

/** Plain-English reading of a failure, so the console says what to do about
 *  it rather than just what it was. */
export function explainFailure(f: Pick<FailureRecord, "kind" | "message" | "cause">): string {
  const text = `${f.cause ?? ""} ${f.message}`.toLowerCase();
  if (f.kind === "client") return "A screen crashed in someone's browser. Check the page and the message.";
  if (/connection terminated|connection timeout|timeout exceeded|econnreset|econnrefused|too many clients|statement timeout|query read timeout/.test(text))
    return "The database was slow or dropped the connection. Often a brief blip; if it repeats, the database is overloaded.";
  if (/column .* does not exist|relation .* does not exist|no such table|undefined column/.test(text))
    return "The code expects a database column or table that isn't there. A migration probably hasn't been run.";
  if (/duplicate key|unique constraint|violates .* constraint|foreign key/.test(text))
    return "The database refused a write that broke a rule (duplicate or missing related row).";
  if (/openai|anthropic|rate limit|429|insufficient_quota|api key/.test(text))
    return "An outside AI service refused or failed the request (limit, key or outage).";
  if (/paynow|stripe/.test(text)) return "The payment provider failed or didn't answer.";
  if (/cannot read properties|is not a function|undefined|is not defined|typeerror|referenceerror/.test(text))
    return "A bug in the code: it hit a value it didn't expect. This one needs a fix.";
  return "An unexpected server error. The details below are the best clue.";
}

export interface FailureGroup {
  key: string;
  kind: "server" | "client";
  method: string;
  route: string;
  status: number;
  count: number;
  lastAt: number;
  firstAt: number;
  lastMessage: string;
  lastCause: string | null;
  explanation: string;
}

export function failureSummary(sinceMs: number) {
  trimFailures();
  const cutoff = Date.now() - sinceMs;
  const rows = failures.filter((f) => f.at >= cutoff);
  const map = new Map<string, FailureGroup>();
  for (const f of rows) {
    const key = `${f.kind}|${f.method}|${f.route}|${f.status}`;
    const g = map.get(key);
    if (!g) {
      map.set(key, {
        key, kind: f.kind, method: f.method, route: f.route, status: f.status, count: 1,
        firstAt: f.at, lastAt: f.at, lastMessage: f.message, lastCause: f.cause, explanation: explainFailure(f),
      });
    } else {
      g.count += 1;
      g.lastAt = f.at;
      g.lastMessage = f.message;
      g.lastCause = f.cause ?? g.lastCause;
      g.explanation = explainFailure({ kind: f.kind, message: f.message, cause: g.lastCause });
    }
  }
  return {
    total: rows.length,
    groups: Array.from(map.values()).sort((a, b) => b.count - a.count || b.lastAt - a.lastAt),
  };
}

export const ERROR_WINDOW_MS = WINDOW_MS;
export const ERROR_RETAIN_MS = RETAIN_MS;

export function requestOutcomeMiddleware() {
  installConsoleCapture();
  return (req: any, res: any, next: any) => {
    if (!req.path?.startsWith("/api/")) return next();
    const ctx = { cause: null as string | null };
    let bodyMessage: string | null = null;
    const origJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 500 && body && typeof body.message === "string") bodyMessage = body.message;
      return origJson(body);
    };
    res.on("finish", () => {
      // The client-crash beacon answers 204 and records itself (with the
      // crash details); don't double count it as a successful request.
      if (req.path === "/api/client-errors") return;
      const failed = res.statusCode >= 500;
      recordOutcome(failed);
      if (!failed) return;
      const route = req.route?.path ? normalizePath(`${req.baseUrl ?? ""}${req.route.path}`) : normalizePath(req.path);
      recordFailure({
        kind: "server",
        method: req.method,
        route,
        status: res.statusCode,
        message: (bodyMessage ?? "No message returned").slice(0, 300),
        cause: ctx.cause,
      });
    });
    als.run(ctx, next);
  };
}
