import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { is, sql, getTableName } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";

// Counts a single PGlite data directory and prints one JSON line to stdout.
// Reads only from the filesystem copy passed on argv — never the live .localdb.
// Each invocation is meant to run in its own process so a crash on a corrupted
// directory can't take down counts for the other directories.
const dataDir = process.argv[2];
if (!dataDir) {
  console.error("Usage: tsx scripts/migrate-count.ts <data-dir>");
  process.exit(1);
}

const tables = Object.entries(schema).filter(
  (entry): entry is [string, PgTable] => is(entry[1], PgTable),
);

async function main() {
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  const counts: Record<string, number> = {};
  const maxIds: Record<string, number | null> = {};

  for (const [, table] of tables) {
    const tableName = getTableName(table);
    try {
      const result = await db.execute(sql`SELECT COUNT(*)::int AS count FROM ${table}`);
      counts[tableName] = (result.rows[0] as any).count;
    } catch (e) {
      counts[tableName] = -1;
    }
    try {
      const idCol = (table as any).id;
      if (idCol) {
        const result = await db.execute(sql`SELECT MAX(${idCol}) AS max_id FROM ${table}`);
        const v = (result.rows[0] as any).max_id;
        maxIds[tableName] = v === null ? null : Number(v);
      } else {
        maxIds[tableName] = null;
      }
    } catch {
      maxIds[tableName] = null;
    }
  }

  await client.close();
  console.log(JSON.stringify({ ok: true, counts, maxIds }));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String(e?.message ?? e) }));
  process.exit(1);
});
