// The lasting error log behind the console's Errors page (Part K3). Every
// failure error-rate.ts sees (a 500+ from the API, a screen that crashed) is
// also counted here, grouped by what broke, in the database so it outlives
// a restart. Writes are batched: failures collect in memory and are written
// every few seconds, one upsert per group, so a storm of the same error is a
// handful of writes, not thousands.
//
// "New error spiking" (shared/email-alerts.ts): an error first seen in the
// last day, or one marked resolved that came back, that happens the
// threshold number of times (default 5) inside 15 minutes. One email per
// error, at most every 6 hours; muted errors never mail.
import type { Express } from "express";
import { createHash } from "crypto";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { emailAlertConfig, errorGroupHours, errorGroups } from "@shared/schema";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";

const FLUSH_MS = 5_000;
const SPIKE_WINDOW_MS = 15 * 60 * 1000;
const ALERT_EVERY_MS = 6 * 60 * 60 * 1000;
const NEW_FOR_MS = 24 * 60 * 60 * 1000;
const HOURS_KEPT_DAYS = 30;
const DEFAULT_SPIKE_THRESHOLD = 5;
const HOUR = 3600_000;

export type ErrorState = "open" | "resolved" | "muted";
export const ERROR_STATES: ErrorState[] = ["open", "resolved", "muted"];

export interface LoggedError {
  kind: "server" | "client";
  method: string;
  route: string;
  status: number;
  message: string;
  cause: string | null;
  stack?: string | null;
  source?: string | null;
}

interface Pending extends LoggedError {
  fingerprint: string;
  n: number;
  firstAt: number;
  lastAt: number;
  hours: Map<number, number>;
}

const pending = new Map<string, Pending>();
/** Recent occurrence times per fingerprint, for the 15-minute spike count. */
const recent = new Map<string, number[]>();
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;
let warnedMissing = false;
let lastCleanup = 0;

/** Same error, same group: numbers and ids in a message don't make a new one. */
export function normalizeMessage(m: string): string {
  return m
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id")
    .replace(/https?:\/\/\S+/g, ":url")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function fingerprintOf(e: Pick<LoggedError, "kind" | "method" | "route" | "status" | "message">): string {
  const key = [e.kind, e.method, e.route, e.status, normalizeMessage(e.message)].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 40);
}

/** Emails and long digit runs (phone numbers, card-like numbers) out of any
 *  text that leaves the console, such as the alert email. */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[number]");
}

export function logError(e: LoggedError) {
  const fingerprint = fingerprintOf(e);
  const now = Date.now();
  const hour = Math.floor(now / HOUR) * HOUR;
  const p = pending.get(fingerprint);
  if (p) {
    p.n += 1;
    p.lastAt = now;
    p.message = e.message;
    p.cause = e.cause ?? p.cause;
    p.stack = e.stack ?? p.stack;
    p.source = e.source ?? p.source;
    p.hours.set(hour, (p.hours.get(hour) ?? 0) + 1);
  } else {
    pending.set(fingerprint, { ...e, fingerprint, n: 1, firstAt: now, lastAt: now, hours: new Map([[hour, 1]]) });
  }
  const times = recent.get(fingerprint) ?? [];
  times.push(now);
  while (times.length && times[0] < now - SPIKE_WINDOW_MS) times.shift();
  recent.set(fingerprint, times);
  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      void flushErrors();
    }, FLUSH_MS);
    timer.unref?.();
  }
}

/** Write what's collected. Safe to call any time (the console calls it before
 *  reading, so the page is never a few seconds behind). */
export async function flushErrors(): Promise<void> {
  if (flushing) return flushing;
  flushing = doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush() {
  if (pending.size === 0) return;
  const batch = Array.from(pending.values());
  pending.clear();
  const touched: { id: number; fingerprint: string; reopened: boolean }[] = [];
  try {
    for (const p of batch) {
      const [before] = await db
        .select({ id: errorGroups.id, state: errorGroups.state })
        .from(errorGroups)
        .where(eq(errorGroups.fingerprint, p.fingerprint));
      const reopened = before?.state === "resolved";
      const [row] = await db
        .insert(errorGroups)
        .values({
          fingerprint: p.fingerprint,
          kind: p.kind,
          method: p.method,
          route: p.route,
          status: p.status,
          message: p.message.slice(0, 500),
          cause: p.cause?.slice(0, 500) ?? null,
          stack: p.stack?.slice(0, 4000) ?? null,
          source: p.source?.slice(0, 80) ?? null,
          count: p.n,
          // Both times from this clock, not the database's (they can disagree).
          firstSeenAt: new Date(p.firstAt),
          lastSeenAt: new Date(p.lastAt),
        })
        .onConflictDoUpdate({
          target: errorGroups.fingerprint,
          set: {
            count: sql`${errorGroups.count} + ${p.n}`,
            lastSeenAt: new Date(p.lastAt),
            message: p.message.slice(0, 500),
            cause: sql`coalesce(${p.cause?.slice(0, 500) ?? null}, ${errorGroups.cause})`,
            stack: sql`coalesce(${p.stack?.slice(0, 4000) ?? null}, ${errorGroups.stack})`,
            source: sql`coalesce(${p.source?.slice(0, 80) ?? null}, ${errorGroups.source})`,
            state: sql`case when ${errorGroups.state} = 'resolved' then 'open' else ${errorGroups.state} end`,
            resolvedAt: sql`case when ${errorGroups.state} = 'resolved' then null else ${errorGroups.resolvedAt} end`,
          },
        })
        .returning({ id: errorGroups.id });
      for (const [hour, n] of p.hours) {
        await db
          .insert(errorGroupHours)
          .values({ groupId: row.id, hour: new Date(hour), count: n })
          .onConflictDoUpdate({
            target: [errorGroupHours.groupId, errorGroupHours.hour],
            set: { count: sql`${errorGroupHours.count} + ${n}` },
          });
      }
      touched.push({ id: row.id, fingerprint: p.fingerprint, reopened });
    }
  } catch (e: any) {
    // Most likely the tables don't exist yet (scripts/migrate-error-log.ts).
    // Never let the error log itself become an error storm.
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn("[error-log] couldn't write the error log (run scripts/migrate-error-log.ts?):", e?.message ?? e);
    }
    return;
  }
  await checkSpikes(touched).catch((e) => console.warn("[error-log] spike check failed:", e?.message ?? e));
  if (Date.now() - lastCleanup > 24 * HOUR) {
    lastCleanup = Date.now();
    await db
      .delete(errorGroupHours)
      .where(lt(errorGroupHours.hour, new Date(Date.now() - HOURS_KEPT_DAYS * 24 * HOUR)))
      .catch(() => {});
  }
}

async function spikeThreshold(): Promise<number> {
  const [cfg] = await db.select({ threshold: emailAlertConfig.threshold }).from(emailAlertConfig).where(eq(emailAlertConfig.alertType, "new_error_spike"));
  const n = Number(cfg?.threshold);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_SPIKE_THRESHOLD;
}

async function checkSpikes(touched: { id: number; fingerprint: string; reopened: boolean }[]) {
  const now = Date.now();
  const hot = touched.filter((t) => (recent.get(t.fingerprint)?.length ?? 0) > 0);
  if (hot.length === 0) return;
  const threshold = await spikeThreshold();
  const candidates = hot.filter((t) => (recent.get(t.fingerprint)?.filter((at) => at >= now - SPIKE_WINDOW_MS).length ?? 0) >= threshold);
  if (candidates.length === 0) return;
  const rows = await db.select().from(errorGroups).where(inArray(errorGroups.id, candidates.map((c) => c.id)));
  for (const g of rows) {
    const c = candidates.find((x) => x.id === g.id)!;
    if (g.state === "muted") continue;
    const isNew = now - g.firstSeenAt.getTime() < NEW_FOR_MS;
    if (!isNew && !c.reopened) continue;
    if (g.lastAlertAt && now - g.lastAlertAt.getTime() < ALERT_EVERY_MS) continue;
    const n15 = recent.get(c.fingerprint)!.filter((at) => at >= now - SPIKE_WINDOW_MS).length;
    await db.update(errorGroups).set({ lastAlertAt: new Date(now) }).where(eq(errorGroups.id, g.id));
    const what = g.kind === "client" ? `Screen crash on ${g.route}` : `${g.method} ${g.route} → ${g.status}`;
    const { explainFailure } = await import("./error-rate");
    const { sendAlert } = await import("../email");
    await sendAlert(
      "new_error_spike",
      `${c.reopened ? "Error is back" : "New error"}: ${what} (${n15} in 15 min)`,
      [
        `${what}`,
        `${n15} times in the last 15 minutes; ${g.count} in all since ${g.firstSeenAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
        c.reopened ? "It was marked resolved and has come back." : "First seen in the last day.",
        "",
        explainFailure({ kind: g.kind as "server" | "client", message: g.message, cause: g.cause }),
        "",
        `Message: ${redact(g.message)}`,
        g.cause ? `Cause: ${redact(g.cause)}` : "",
      ]
        .filter((l, i, a) => l !== "" || a[i - 1] !== "")
        .join("\n"),
      { consolePath: `/console/errors?id=${g.id}` },
    );
  }
}

// ── Console routes ─────────────────────────────────────────────────────────

const SINCE: Record<string, number> = { "24h": 24 * HOUR, "7d": 7 * 24 * HOUR, "30d": 30 * 24 * HOUR };

async function hourlySeries(ids: number[], hours: number): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (ids.length === 0) return out;
  const end = Math.floor(Date.now() / HOUR) * HOUR;
  const start = end - (hours - 1) * HOUR;
  const rows = await db
    .select()
    .from(errorGroupHours)
    .where(and(inArray(errorGroupHours.groupId, ids), gte(errorGroupHours.hour, new Date(start))));
  for (const id of ids) out.set(id, new Array(hours).fill(0));
  for (const r of rows) {
    const i = Math.round((r.hour.getTime() - start) / HOUR);
    const s = out.get(r.groupId);
    if (s && i >= 0 && i < hours) s[i] += r.count;
  }
  return out;
}

export function registerAdminErrorLogRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/error-groups", "support", async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : "open";
    const kind = req.query.kind === "server" || req.query.kind === "client" ? req.query.kind : null;
    const sinceKey = typeof req.query.since === "string" && SINCE[req.query.since] ? req.query.since : "7d";
    const cutoff = new Date(Date.now() - SINCE[sinceKey]);
    try {
      await flushErrors();
      const where = and(
        gte(errorGroups.lastSeenAt, cutoff),
        (ERROR_STATES as string[]).includes(state) ? eq(errorGroups.state, state) : undefined,
        kind ? eq(errorGroups.kind, kind) : undefined,
      );
      const rows = await db.select().from(errorGroups).where(where).orderBy(desc(errorGroups.lastSeenAt)).limit(200);
      const ids = rows.map((r) => r.id);
      const series = await hourlySeries(ids, 48);
      const inRange = ids.length
        ? await db
            .select({ groupId: errorGroupHours.groupId, n: sql<number>`sum(${errorGroupHours.count})` })
            .from(errorGroupHours)
            .where(and(inArray(errorGroupHours.groupId, ids), gte(errorGroupHours.hour, new Date(Math.floor(cutoff.getTime() / HOUR) * HOUR))))
            .groupBy(errorGroupHours.groupId)
        : [];
      const rangeCount = new Map(inRange.map((r) => [r.groupId, Number(r.n)]));
      const { explainFailure } = await import("./error-rate");
      const counts = await db
        .select({ state: errorGroups.state, n: sql<number>`count(*)` })
        .from(errorGroups)
        .where(gte(errorGroups.lastSeenAt, cutoff))
        .groupBy(errorGroups.state);
      res.json({
        since: sinceKey,
        states: Object.fromEntries(counts.map((c) => [c.state, Number(c.n)])),
        groups: rows.map((g) => ({
          ...g,
          inRange: rangeCount.get(g.id) ?? 0,
          last48h: series.get(g.id) ?? [],
          isNew: Date.now() - g.firstSeenAt.getTime() < NEW_FOR_MS,
          explanation: explainFailure({ kind: g.kind as "server" | "client", message: g.message, cause: g.cause }),
        })),
      });
    } catch (e: any) {
      res.status(500).json({ message: "Couldn't load the error log. Has scripts/migrate-error-log.ts been run?" });
    }
  });

  adminRoute(app, "patch", "/api/admin/error-groups/:id", "support", async (req, res) => {
    const id = Number(req.params.id);
    const state = req.body?.state;
    if (!Number.isInteger(id) || !(ERROR_STATES as string[]).includes(state)) return res.status(400).json({ message: "Bad request" });
    try {
      const adminId = (req as any).admin.userId as string;
      const [updated] = await db
        .update(errorGroups)
        .set({ state, resolvedAt: state === "resolved" ? new Date() : null, resolvedBy: state === "resolved" ? adminId : null })
        .where(eq(errorGroups.id, id))
        .returning();
      if (!updated) return res.status(404).json({ message: "No such error" });
      await auditAdmin(req, adminId, "error.state", { targetType: "error_group", targetId: id, details: { state } });
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Failed to update" });
    }
  });
}

/** Errors first seen in the last day and still open: the nav badge. */
export async function newErrorCount(): Promise<number> {
  try {
    const [r] = await db
      .select({ n: sql<number>`count(*)` })
      .from(errorGroups)
      .where(and(eq(errorGroups.state, "open"), gte(errorGroups.firstSeenAt, new Date(Date.now() - NEW_FOR_MS))));
    return Number(r?.n ?? 0);
  } catch {
    return 0;
  }
}

/** For tests: forget what's buffered. */
export function _resetErrorLogForTests() {
  pending.clear();
  recent.clear();
  if (timer) clearTimeout(timer);
  timer = null;
}
