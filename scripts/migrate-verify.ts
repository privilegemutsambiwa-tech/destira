import { and, asc, eq, sql, getTableName } from "drizzle-orm";
import { db, client } from "../server/db";
import { Pool } from "pg";
import * as schema from "../shared/schema";
import { allTables } from "./migrate-lib";

async function main() {
  console.log("=== Row counts on Supabase now ===");
  let total = 0;
  const counts: Record<string, number> = {};
  for (const [, table] of allTables) {
    const tableName = getTableName(table);
    const r = await db.execute(sql`SELECT COUNT(*)::int AS c FROM ${table}`);
    const c = (r.rows[0] as any).c;
    counts[tableName] = c;
    total += c;
  }
  console.log(`Total rows across all 70 tables: ${total}`);
  console.log(JSON.stringify(counts));

  console.log("\n=== Spot-check: twin_memory ordering for multi-message users ===");
  const memRows = await db
    .select({ userId: schema.twinMemory.userId, id: schema.twinMemory.id, createdAt: schema.twinMemory.createdAt, role: schema.twinMemory.role })
    .from(schema.twinMemory)
    .orderBy(asc(schema.twinMemory.userId), asc(schema.twinMemory.id));
  const byUser = new Map<string, typeof memRows>();
  for (const r of memRows) {
    if (!byUser.has(r.userId!)) byUser.set(r.userId!, [] as any);
    byUser.get(r.userId!)!.push(r);
  }
  for (const [userId, rows] of byUser) {
    if (rows.length < 2) continue;
    const sortedById = [...rows].sort((a, b) => a.id - b.id);
    const sortedByTime = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const idOrderMatchesTimeOrder = sortedById.every((r, i) => r.id === sortedByTime[i].id);
    console.log(`  user ${userId}: ${rows.length} messages, id-order matches createdAt-order: ${idOrderMatchesTimeOrder}`);
  }

  console.log("\n=== Spot-check: twin_memory_facts sensitivity/disclosable ===");
  const facts = await db.select().from(schema.twinMemoryFacts);
  for (const f of facts) {
    console.log(`  id=${f.id} disclosable=${f.disclosable} sensitivity=${JSON.stringify(f.sensitivity)}`);
  }

  console.log("\n=== Spot-check: profiles.disclosureSettings sample ===");
  const profs = await db
    .select({ id: schema.profiles.id, userId: schema.profiles.userId, disclosureSettings: schema.profiles.disclosureSettings })
    .from(schema.profiles)
    .limit(5);
  for (const p of profs) {
    console.log(`  profile id=${p.id} userId=${p.userId} disclosureSettings=${JSON.stringify(p.disclosureSettings)}`);
  }

  console.log("\n=== admin_audit_log integrity ===");
  const auditCount = await db.execute(sql`SELECT COUNT(*)::int AS c FROM admin_audit_log`);
  const auditMinMax = await db.execute(sql`SELECT MIN(id) AS min_id, MAX(id) AS max_id FROM admin_audit_log`);
  console.log(`  count=${(auditCount.rows[0] as any).c}`, auditMinMax.rows[0]);

  await (client as Pool).end();
}

main().catch(async (e) => {
  console.error(e);
  await (client as Pool).end();
  process.exit(1);
});
