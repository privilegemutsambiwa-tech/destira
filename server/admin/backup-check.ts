// The daily backup check (Part K7). Once a day the server asks Supabase's
// Management API which backups exist for the production database, records
// the answer in backup_checks, and emails the owner (alert "backup_missing")
// when the newest backup is more than a day and a bit old, when there are
// none at all, or when it can't find out. The console's Errors page shows
// the latest result and the last two weeks.
//
// Needs, in the server's environment (set by the owner, never committed):
//   SUPABASE_ACCESS_TOKEN  a personal access token from
//                          supabase.com/dashboard/account/tokens
//   SUPABASE_PROJECT_REF   optional; read from DATABASE_URL when absent
//
// Without a token it records "not set up" and says so, once a day. The
// restore drill that proves a backup actually works is in docs/backups.md.
import type { Express } from "express";
import { desc, gte } from "drizzle-orm";
import { db } from "../db";
import { backupChecks } from "@shared/schema";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";

const HOUR = 60 * 60 * 1000;
/** Supabase backs up once a day; a little slack for when in the day it runs. */
export const BACKUP_MAX_AGE_MS = 26 * HOUR;
const CHECK_EVERY_MS = 23 * HOUR;

export type BackupStatus = "ok" | "stale" | "missing" | "error" | "not_configured";
export interface BackupVerdict {
  status: BackupStatus;
  latestBackupAt: Date | null;
  backupCount: number;
  pitr: boolean;
  message: string;
}

/** The project ref: SUPABASE_PROJECT_REF, or from the database URL
 *  (postgres.<ref>@…pooler.supabase.com, or db.<ref>.supabase.co). */
export function projectRef(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.SUPABASE_PROJECT_REF) return env.SUPABASE_PROJECT_REF;
  const url = env.DATABASE_URL || "";
  const m = url.match(/\/\/postgres\.([a-z0-9]{20})[:@]/) || url.match(/@db\.([a-z0-9]{20})\.supabase\.co/);
  return m ? m[1] : null;
}

const ago = (ms: number) => (ms < 2 * HOUR ? `${Math.round(ms / 60000)} min` : ms < 48 * HOUR ? `${Math.round(ms / HOUR)} h` : `${Math.round(ms / (24 * HOUR))} days`);

/** What Supabase's answer means. Pure, so the rules are tested on their own.
 *  The response is read defensively: Supabase doesn't document its fields,
 *  so anything unexpected counts as "couldn't tell", never as "fine". */
export function judgeBackups(body: any, now = Date.now()): BackupVerdict {
  const list: any[] = Array.isArray(body?.backups) ? body.backups : [];
  const done = list.filter((b) => !b?.status || String(b.status).toUpperCase() === "COMPLETED");
  const times = done.map((b) => Date.parse(b?.inserted_at ?? "")).filter((t) => Number.isFinite(t));
  const physical = Number(body?.physical_backup_data?.latest_physical_backup_date_unix);
  if (Number.isFinite(physical) && physical > 0) times.push(physical * 1000);
  const pitr = body?.pitr_enabled === true;
  const latest = times.length ? Math.max(...times) : null;
  const base = { backupCount: done.length, pitr, latestBackupAt: latest ? new Date(latest) : null };

  if (pitr && (latest === null || now - latest <= BACKUP_MAX_AGE_MS)) {
    return { ...base, status: "ok", message: "Point-in-time recovery is on: the database can be restored to any moment in the recovery window." };
  }
  if (latest === null) {
    return {
      ...base,
      status: "missing",
      message:
        "Supabase lists no finished backups for this project. Projects on the free plan get none: keep the weekly off-site dump going (docs/backups.md), or move to the Pro plan for daily backups.",
    };
  }
  const age = now - latest;
  if (age > BACKUP_MAX_AGE_MS) {
    return { ...base, status: "stale", message: `The newest backup is ${ago(age)} old; Supabase normally makes one every day. Check the project's Backups page.` };
  }
  return { ...base, status: "ok", message: `Last backup ${ago(age)} ago; ${done.length} kept.` };
}

/** Asks Supabase. Never throws: a failure is itself a result to record. */
export async function fetchBackupVerdict(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): Promise<BackupVerdict> {
  const empty = { latestBackupAt: null, backupCount: 0, pitr: false };
  const token = env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef(env);
  if (!token || !ref) {
    return {
      ...empty,
      status: "not_configured",
      message: !token
        ? "Not set up: add SUPABASE_ACCESS_TOKEN to the server's environment (see docs/backups.md)."
        : "Not set up: the Supabase project ref couldn't be worked out; set SUPABASE_PROJECT_REF.",
    };
  }
  try {
    const r = await fetcher(`https://api.supabase.com/v1/projects/${ref}/database/backups`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 401 || r.status === 403) {
      return { ...empty, status: "error", message: `Supabase refused the access token (${r.status}). It may have expired or belong to another account: make a new one (docs/backups.md).` };
    }
    if (!r.ok) return { ...empty, status: "error", message: `Supabase answered ${r.status} when asked for the backup list. The check runs again tomorrow.` };
    return judgeBackups(await r.json());
  } catch (e: any) {
    return { ...empty, status: "error", message: `Couldn't reach Supabase to ask about backups (${e?.name === "TimeoutError" ? "timed out" : e?.message ?? e}).` };
  }
}

/** Runs the check, records it, and alerts when it isn't fine. */
export async function runBackupCheck(trigger = "schedule", fetcher: typeof fetch = fetch) {
  const v = await fetchBackupVerdict(process.env, fetcher);
  const [row] = await db
    .insert(backupChecks)
    .values({ checkedAt: new Date(), status: v.status, latestBackupAt: v.latestBackupAt, backupCount: v.backupCount, pitr: v.pitr, message: v.message, trigger })
    .returning();
  if (v.status !== "ok") {
    const { sendAlert } = await import("../email");
    const subject =
      v.status === "not_configured" ? "Backup check isn't set up" : v.status === "error" ? "Couldn't check the database backups" : v.status === "missing" ? "No database backups found" : "Database backup is late";
    await sendAlert("backup_missing", subject, `${v.message}\n\nThe restore drill and what to do: docs/backups.md in the repository.`, { consolePath: "/console/errors" }).catch((e) =>
      console.warn("[backup-check] alert failed:", e?.message ?? e),
    );
  }
  return row;
}

/** Once a day, wherever the server restarts: an hourly look at when the last
 *  check ran, so restarts don't skip a day or check twice. */
export function startBackupChecks() {
  if (process.env.NODE_ENV === "test") return;
  const tick = async () => {
    try {
      const [last] = await db.select({ at: backupChecks.checkedAt }).from(backupChecks).orderBy(desc(backupChecks.checkedAt)).limit(1);
      if (last && Date.now() - last.at.getTime() < CHECK_EVERY_MS) return;
      const row = await runBackupCheck();
      console.log(`[backup-check] ${row.status}: ${row.message}`);
    } catch (e: any) {
      console.warn("[backup-check] failed:", e?.message ?? e);
    }
  };
  setTimeout(tick, 3 * 60 * 1000);
  setInterval(tick, HOUR);
}

export function registerAdminBackupRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/backups", "support", async (_req, res) => {
    try {
      const since = new Date(Date.now() - 14 * 24 * HOUR);
      const checks = await db.select().from(backupChecks).where(gte(backupChecks.checkedAt, since)).orderBy(desc(backupChecks.checkedAt)).limit(60);
      res.json({ latest: checks[0] ?? null, checks, maxAgeHours: BACKUP_MAX_AGE_MS / HOUR });
    } catch (e: any) {
      res.status(500).json({ message: "Couldn't load the backup checks." });
    }
  });

  adminRoute(app, "post", "/api/admin/backups/check", "admin", async (req, res) => {
    try {
      const adminId = (req as any).admin.userId as string;
      const row = await runBackupCheck(`console:${adminId}`);
      await auditAdmin(req, adminId, "backup.check", { targetType: "backup_check", targetId: row.id, details: { status: row.status } }).catch(() => {});
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ message: "The check couldn't run." });
    }
  });
}
