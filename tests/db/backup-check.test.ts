// The daily backup check (server/admin/backup-check.ts): what Supabase's
// answer means, that every failure is a result rather than a crash, and that
// a run is recorded and alerts unless the backup is fine.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../server/db";
import { backupChecks, emailLog } from "@shared/schema";
import { BACKUP_MAX_AGE_MS, fetchBackupVerdict, judgeBackups, projectRef, runBackupCheck } from "../../server/admin/backup-check";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-27T12:00:00Z");
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR).toISOString();
const respond = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const env = { SUPABASE_ACCESS_TOKEN: "sbp_test", DATABASE_URL: "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-1-eu-west-1.pooler.supabase.com:6543/postgres" } as any;

describe("what Supabase's answer means", () => {
  it("a backup from this morning is fine", () => {
    const v = judgeBackups({ pitr_enabled: false, backups: [{ status: "COMPLETED", inserted_at: at(30) }, { status: "COMPLETED", inserted_at: at(6) }] }, NOW);
    expect(v.status).toBe("ok");
    expect(v.backupCount).toBe(2);
    expect(v.latestBackupAt?.toISOString()).toBe(at(6));
  });

  it("nothing for more than a day is late", () => {
    const v = judgeBackups({ backups: [{ status: "COMPLETED", inserted_at: at(40) }] }, NOW);
    expect(v.status).toBe("stale");
    expect(v.message).toMatch(/40 h old/);
  });

  it("a backup still running or failed doesn't count", () => {
    const v = judgeBackups({ backups: [{ status: "COMPLETED", inserted_at: at(50) }, { status: "FAILED", inserted_at: at(2) }] }, NOW);
    expect(v.status).toBe("stale");
  });

  it("none at all says so, and what to do on the free plan", () => {
    const v = judgeBackups({ backups: [] }, NOW);
    expect(v.status).toBe("missing");
    expect(v.message).toMatch(/free plan/);
  });

  it("an answer it doesn't understand is never taken as fine", () => {
    expect(judgeBackups(null, NOW).status).toBe("missing");
    expect(judgeBackups({ something: "else" }, NOW).status).toBe("missing");
  });

  it("physical backups count by their own timestamp", () => {
    const v = judgeBackups({ backups: [], physical_backup_data: { latest_physical_backup_date_unix: (NOW - 3 * HOUR) / 1000 } }, NOW);
    expect(v.status).toBe("ok");
  });

  it("point-in-time recovery is fine on its own", () => {
    expect(judgeBackups({ pitr_enabled: true, backups: [] }, NOW).status).toBe("ok");
  });

  it("the allowance is a day and a bit", () => {
    expect(BACKUP_MAX_AGE_MS).toBe(26 * HOUR);
    expect(judgeBackups({ backups: [{ inserted_at: at(25.9) }] }, NOW).status).toBe("ok");
  });
});

describe("asking Supabase", () => {
  it("finds the project from the database address", () => {
    expect(projectRef(env)).toBe("abcdefghijklmnopqrst");
    expect(projectRef({ DATABASE_URL: "postgresql://postgres:pw@db.zyxwvutsrqponmlkjihg.supabase.co:5432/postgres" } as any)).toBe("zyxwvutsrqponmlkjihg");
    expect(projectRef({ SUPABASE_PROJECT_REF: "given", DATABASE_URL: env.DATABASE_URL } as any)).toBe("given");
    expect(projectRef({ DATABASE_URL: "" } as any)).toBeNull();
  });

  it("without a token it isn't set up, and says how", async () => {
    const v = await fetchBackupVerdict({ DATABASE_URL: env.DATABASE_URL } as any, respond(200));
    expect(v.status).toBe("not_configured");
    expect(v.message).toMatch(/SUPABASE_ACCESS_TOKEN/);
  });

  it("a refused token is an error to fix, not a crash", async () => {
    const v = await fetchBackupVerdict(env, respond(401));
    expect(v.status).toBe("error");
    expect(v.message).toMatch(/refused the access token/);
  });

  it("Supabase being down is an error, not a crash", async () => {
    expect((await fetchBackupVerdict(env, respond(500))).status).toBe("error");
    const down = (async () => { throw new Error("getaddrinfo ENOTFOUND"); }) as unknown as typeof fetch;
    expect((await fetchBackupVerdict(env, down)).message).toMatch(/Couldn't reach Supabase/);
  });

  it("asks for this project's backups with the token", async () => {
    let asked = "";
    let auth = "";
    const spy = (async (url: string, init: any) => {
      asked = url;
      auth = init.headers.Authorization;
      return new Response(JSON.stringify({ backups: [{ status: "COMPLETED", inserted_at: new Date().toISOString() }] }), { status: 200 });
    }) as unknown as typeof fetch;
    expect((await fetchBackupVerdict(env, spy)).status).toBe("ok");
    expect(asked).toBe("https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/database/backups");
    expect(auth).toBe("Bearer sbp_test");
  });
});

describe("a run", () => {
  beforeEach(async () => {
    await db.delete(backupChecks);
    await db.delete(emailLog);
  });

  it("is recorded, and a problem sends the backup alert", async () => {
    const before = process.env.SUPABASE_ACCESS_TOKEN;
    delete process.env.SUPABASE_ACCESS_TOKEN;
    try {
      const row = await runBackupCheck("test");
      expect(row.status).toBe("not_configured");
      const rows = await db.select().from(backupChecks);
      expect(rows).toHaveLength(1);
      expect(rows[0].trigger).toBe("test");
      // The alert is logged even where no email can go out (no mail key in tests).
      await new Promise((r) => setTimeout(r, 50));
      expect((await db.select().from(emailLog)).some((m) => m.type === "backup_missing")).toBe(true);
    } finally {
      if (before !== undefined) process.env.SUPABASE_ACCESS_TOKEN = before;
    }
  });

  it("a good backup is recorded and sends nothing", async () => {
    process.env.SUPABASE_ACCESS_TOKEN = "sbp_test";
    process.env.SUPABASE_PROJECT_REF = "abcdefghijklmnopqrst";
    try {
      const row = await runBackupCheck("test", respond(200, { backups: [{ status: "COMPLETED", inserted_at: new Date().toISOString() }] }));
      expect(row.status).toBe("ok");
      expect((await db.select().from(emailLog)).some((m) => m.type === "backup_missing")).toBe(false);
    } finally {
      delete process.env.SUPABASE_ACCESS_TOKEN;
      delete process.env.SUPABASE_PROJECT_REF;
    }
  });
});
