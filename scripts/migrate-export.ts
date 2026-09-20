import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { asc, getTableName, sql } from "drizzle-orm";
import * as schema from "../shared/schema";
import { topologicalTables, idFieldKey } from "./migrate-lib";

// Reads only from a filesystem COPY under T:\vibeflow-backups — never the
// live .localdb. Writes one NDJSON file per table to OUT_DIR, in FK-safe
// (parents-first) order, preserving every value exactly as stored.
const dataDir = process.argv[2];
const outDir = process.argv[3] || path.join(process.cwd(), "migration-export");

if (!dataDir) {
  console.error("Usage: tsx scripts/migrate-export.ts <backup-localdb-dir> [out-dir]");
  process.exit(1);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });

  const order = topologicalTables();
  const summary: { table: string; rows: number }[] = [];

  for (const [, table] of order) {
    const tableName = getTableName(table);
    const idKey = idFieldKey(table);
    const idCol = idKey ? (table as any)[idKey] : null;

    const query = idCol ? db.select().from(table).orderBy(asc(idCol)) : db.select().from(table);
    const rows = await query;

    const filePath = path.join(outDir, `${tableName}.ndjson`);
    const lines = rows.map((r) => JSON.stringify(r)).join("\n");
    fs.writeFileSync(filePath, rows.length ? lines + "\n" : "");

    summary.push({ table: tableName, rows: rows.length });
    console.log(`${tableName}: ${rows.length} rows -> ${filePath}`);
  }

  await client.close();

  fs.writeFileSync(path.join(outDir, "_order.json"), JSON.stringify(order.map(([, t]) => getTableName(t))));
  fs.writeFileSync(path.join(outDir, "_summary.json"), JSON.stringify(summary, null, 2));

  const total = summary.reduce((a, s) => a + s.rows, 0);
  console.log(`\nExported ${summary.length} tables, ${total} rows total, to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
