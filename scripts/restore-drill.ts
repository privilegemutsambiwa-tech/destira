// Restore drill (Part K7): proves a backup actually restores into a working
// database. Point it at a copy restored from a backup (never at production
// itself); it compares the copy with production and prints a verdict and a
// line for the drill log in docs/backups.md. Read-only on both: each session
// is set read-only before any query, and it prints counts, never member data.
//
//   RESTORE_DATABASE_URL="postgresql://…the restored copy…" \
//     npx tsx --env-file=.env scripts/restore-drill.ts
//
// .env supplies DATABASE_URL (production) for the comparison. Without it the
// drill still checks the copy on its own. The steps to make the copy are in
// docs/backups.md. The checks themselves (runDrill) are tested in
// tests/db/restore-drill.test.ts.
import { fileURLToPath } from "url";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import * as schema from "@shared/schema";

/** The tables without which Destira isn't Destira. */
export const CORE = ["users", "profiles", "matches", "direct_messages", "payments", "events", "groups", "group_messages"];

/** Runs one read-only query and returns its rows. */
export type Query = (sql: string) => Promise<any[]>;

export interface DrillReport {
  verdict: "PASS" | "FAIL";
  fails: string[];
  warns: string[];
  tables: { table: string; restored: number; prod: number | null }[];
  expectedTables: number;
  freshness: string[];
}

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

/** The checks: every table there, the core ones not empty, not far behind
 *  production, how recent the copy is, and that it hangs together. */
export async function runDrill(restored: Query, prod: Query | null): Promise<DrillReport> {
  const expected = (Object.values(schema) as unknown[])
    .filter((t): t is PgTable => is(t, PgTable))
    .map((t) => getTableConfig(t))
    .filter((c) => (c.schema ?? "public") === "public")
    .map((c) => c.name);

  const tablesIn = async (q: Query) => new Set((await q("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).map((r) => r.table_name as string));
  const restoredTables = await tablesIn(restored);
  const prodTables = prod ? await tablesIn(prod) : null;
  const count = async (q: Query, t: string) => Number((await q(`SELECT count(*)::bigint AS n FROM "${t}"`))[0].n);

  const fails: string[] = [];
  const warns: string[] = [];
  const tables: DrillReport["tables"] = [];
  for (const name of expected) {
    if (!restoredTables.has(name)) {
      // Missing in both: a migration production hasn't had yet, not the backup's fault.
      if (prodTables && !prodTables.has(name)) warns.push(`${name}: not in production either (a migration still to run)`);
      else if (CORE.includes(name)) fails.push(`${name}: missing from the restored copy`);
      else warns.push(`${name}: missing from the restored copy`);
      continue;
    }
    const r = await count(restored, name);
    const p = prod && prodTables?.has(name) ? await count(prod, name) : null;
    tables.push({ table: name, restored: r, prod: p });
    if (CORE.includes(name) && r === 0 && (p ?? 1) > 0) fails.push(`${name}: empty in the restored copy`);
    // A backup is older than production, so a little less is expected; a lot less isn't.
    if (p !== null && p > 50 && r < p * 0.8) warns.push(`${name}: ${r} rows restored, ${p} in production`);
  }

  const newest = async (q: Query, t: string) => {
    try {
      const at = (await q(`SELECT max(created_at) AS at FROM "${t}"`))[0]?.at;
      return at ? new Date(at) : null;
    } catch {
      return null;
    }
  };
  const freshness: string[] = [];
  for (const t of ["direct_messages", "payments", "users"]) {
    if (!restoredTables.has(t)) continue;
    const r = await newest(restored, t);
    const p = prod ? await newest(prod, t) : null;
    if (r) freshness.push(`${t}: newest ${stamp(r)} UTC${p ? ` (production ${stamp(p)}, ${Math.max(0, Math.round((p.getTime() - r.getTime()) / 3_600_000))} h newer)` : ""}`);
  }

  // Does it hang together: every profile belongs to a member, every message to a match.
  const orphans = async (sql: string) => {
    try {
      return Number((await restored(sql))[0].n);
    } catch {
      return 0;
    }
  };
  const op = await orphans(`SELECT count(*)::bigint AS n FROM profiles p LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL`);
  const om = await orphans(`SELECT count(*)::bigint AS n FROM direct_messages m LEFT JOIN matches x ON x.id = m.match_id WHERE x.id IS NULL`);
  if (op) fails.push(`${op} profiles without a member: the copy is incomplete`);
  if (om) fails.push(`${om} messages without a match: the copy is incomplete`);

  return { verdict: fails.length ? "FAIL" : "PASS", fails, warns, tables, expectedTables: expected.length, freshness };
}

/** The report as printed, ending with the line for the drill log. */
export function formatDrill(d: DrillReport, where: { restored: string; prod: string | null }, seconds: number): string {
  const out: string[] = [];
  out.push(`Restore drill: ${d.verdict}  (${seconds.toFixed(0)} s)`);
  out.push(`Restored copy: ${where.restored}${where.prod ? `   compared with production: ${where.prod}` : "   (no production comparison: DATABASE_URL not set)"}`);
  out.push("", "Core tables (restored / production):");
  for (const t of d.tables.filter((t) => CORE.includes(t.table))) out.push(`  ${t.table.padEnd(18)} ${String(t.restored).padStart(8)} / ${t.prod ?? "—"}`);
  out.push("", `${d.tables.length} of ${d.expectedTables} tables restored, ${d.tables.reduce((a, t) => a + t.restored, 0)} rows in all.`);
  if (d.freshness.length) out.push("", "How recent:", ...d.freshness.map((f) => `  ${f}`));
  if (d.fails.length) out.push("", "Failed:", ...d.fails.map((f) => `  ${f}`));
  if (d.warns.length) out.push("", "Worth a look:", ...d.warns.map((f) => `  ${f}`));
  const members = d.tables.find((t) => t.table === "users")?.restored ?? "?";
  out.push(
    "",
    "For the drill log in docs/backups.md:",
    `| ${new Date().toISOString().slice(0, 10)} | ${d.verdict} | ${d.tables.length}/${d.expectedTables} tables, ${members} members | ${d.freshness[0] ?? "—"} | (who, and how you restored) |`,
  );
  return out.join("\n");
}

const host = (url: string) => url.replace(/^.*@/, "").replace(/[?].*$/, "");

async function main() {
  const { Pool } = await import("pg");
  const restoredUrl = process.env.RESTORE_DATABASE_URL;
  const prodUrl = process.env.DATABASE_URL || null;
  if (!restoredUrl) throw new Error("Set RESTORE_DATABASE_URL to the restored copy (see docs/backups.md).");
  if (prodUrl && host(prodUrl) === host(restoredUrl)) throw new Error("RESTORE_DATABASE_URL is production itself. Point it at the restored copy.");

  const open = async (url: string) => {
    const pool = new Pool({ connectionString: url, ssl: process.env.PGSSL_DISABLE === "1" ? false : { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 20_000 });
    const c = await pool.connect();
    // Read-only before anything else: the drill can't change either database.
    await c.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    await c.query("SET statement_timeout = '60s'");
    const q: Query = async (sql) => (await c.query(sql)).rows;
    return { q, close: async () => { c.release(); await pool.end(); } };
  };

  const started = Date.now();
  const r = await open(restoredUrl);
  const p = prodUrl ? await open(prodUrl) : null;
  try {
    const report = await runDrill(r.q, p?.q ?? null);
    console.log("\n" + formatDrill(report, { restored: host(restoredUrl), prod: prodUrl ? host(prodUrl) : null }, (Date.now() - started) / 1000));
    process.exitCode = report.verdict === "PASS" ? 0 : 1;
  } finally {
    await r.close();
    await p?.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`\nRestore drill couldn't run: ${e?.message ?? e}`);
    process.exit(2);
  });
}
