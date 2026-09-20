import fs from "fs";
import path from "path";
import { sql, getTableName } from "drizzle-orm";
import { db, client } from "../server/db";
import { Pool } from "pg";
import * as schema from "../shared/schema";
import { topologicalTables, dateFieldKeys, serialIdColumn, userFkFieldKeys } from "./migrate-lib";

// Imports NDJSON files produced by migrate-export.ts into whatever DATABASE_URL
// points at (must be set — this script refuses to run against PGlite). Inserts
// in the same FK-safe order used for export, preserving original ids and
// timestamps exactly, then resets every serial sequence past its new max id.
//
// Uses ON CONFLICT DO NOTHING on every insert: the target database may
// already have rows (demo seed data, or real signups from a live production
// app pointed at the same DATABASE_URL) that this local export also contains
// or collides with by id/unique constraint. Skip-on-conflict keeps whatever
// is already there untouched and only adds rows that don't already exist,
// rather than overwriting or erroring on the clash.
const inDir = process.argv[2];
if (!inDir) {
  console.error("Usage: tsx scripts/migrate-import.ts <export-dir>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — refusing to import into PGlite.");
  process.exit(1);
}

const BATCH_SIZE = 500;

function reviveDates<T extends Record<string, any>>(row: T, dateKeys: string[]): T {
  for (const k of dateKeys) {
    if (row[k] != null) row[k] = new Date(row[k]);
  }
  return row;
}

// A local user's id doesn't always survive import unchanged: if Supabase
// already has a row with the same email (e.g. an account created there
// independently of this local dev copy), that row wins and our insert is
// skipped by ON CONFLICT DO NOTHING — but under a *different* id. Any child
// row that still references the old local id would then violate its FK.
// Build old-id -> winning-id so every child row gets rewritten first.
async function buildUserIdRemap(inDir: string): Promise<Map<string, string>> {
  const usersFile = path.join(inDir, "users.ndjson");
  const remap = new Map<string, string>();
  if (!fs.existsSync(usersFile)) return remap;

  const localUsers = fs
    .readFileSync(usersFile, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const supabaseUsers = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users);
  const supabaseIds = new Set(supabaseUsers.map((u) => u.id));
  const supabaseIdByEmail = new Map(supabaseUsers.filter((u) => u.email).map((u) => [u.email as string, u.id]));

  for (const u of localUsers) {
    if (supabaseIds.has(u.id)) continue; // exact id already present, no remap needed
    if (u.email && supabaseIdByEmail.has(u.email)) {
      remap.set(u.id, supabaseIdByEmail.get(u.email)!);
    }
  }
  return remap;
}

function applyUserIdRemap<T extends Record<string, any>>(row: T, keys: string[], remap: Map<string, string>): T {
  for (const k of keys) {
    if (row[k] != null && remap.has(row[k])) row[k] = remap.get(row[k]);
  }
  return row;
}

async function main() {
  const order = topologicalTables();
  const results: { table: string; source: number; inserted: number; skipped: number }[] = [];

  const userIdRemap = await buildUserIdRemap(inDir);
  if (userIdRemap.size > 0) {
    console.log("Remapping local user ids to their existing Supabase identity (matched by email):");
    for (const [oldId, newId] of userIdRemap) console.log(`  ${oldId} -> ${newId}`);
    console.log("");
  }

  for (const [, table] of order) {
    const tableName = getTableName(table);
    const filePath = path.join(inDir, `${tableName}.ndjson`);
    if (!fs.existsSync(filePath)) {
      console.log(`${tableName}: no export file, skipping`);
      continue;
    }
    const content = fs.readFileSync(filePath, "utf-8").trim();
    if (!content) {
      console.log(`${tableName}: 0 rows`);
      results.push({ table: tableName, source: 0, inserted: 0, skipped: 0 });
      continue;
    }

    const dateKeys = dateFieldKeys(table);
    const userFkKeys = tableName === "users" ? [] : userFkFieldKeys(table);
    const rows = content
      .split("\n")
      .map((line) => reviveDates(JSON.parse(line), dateKeys))
      .map((row) => applyUserIdRemap(row, userFkKeys, userIdRemap));
    let inserted = 0;

    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const written = await tx.insert(table).values(batch).onConflictDoNothing().returning();
        inserted += written.length;
      }
    });

    const skipped = rows.length - inserted;
    console.log(`${tableName}: ${inserted} inserted, ${skipped} skipped (already present) of ${rows.length} source rows`);
    results.push({ table: tableName, source: rows.length, inserted, skipped });
  }

  console.log("\nResetting sequences...");
  for (const [, table] of order) {
    const tableName = getTableName(table);
    const serialCol = serialIdColumn(table);
    if (!serialCol) continue;
    await db.execute(
      sql.raw(
        `SELECT setval(pg_get_serial_sequence('"${tableName}"', '${serialCol.dbColumn}'), COALESCE((SELECT MAX("${serialCol.dbColumn}") FROM "${tableName}"), 1), true)`,
      ),
    );
    console.log(`${tableName}: sequence reset`);
  }

  const totalInserted = results.reduce((a, r) => a + r.inserted, 0);
  const totalSkipped = results.reduce((a, r) => a + r.skipped, 0);
  console.log(`\n${results.length} tables processed: ${totalInserted} rows inserted, ${totalSkipped} rows skipped (already present).`);

  await (client as Pool).end();
}

main().catch(async (e) => {
  console.error(e);
  await (client as Pool).end();
  process.exit(1);
});
