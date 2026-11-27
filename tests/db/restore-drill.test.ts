// The restore drill's checks (scripts/restore-drill.ts), on in-memory
// databases: a complete copy passes, a copy missing core tables fails, and a
// copy far behind production is flagged.
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { client, db } from "../../server/db";
import { users, profiles } from "@shared/schema";
import { CORE, formatDrill, runDrill, type Query } from "../../scripts/restore-drill";

const q = (pg: PGlite): Query => async (sql) => (await pg.query(sql)).rows as any[];
const testDb = q(client as unknown as PGlite);

describe("restore drill", () => {
  it("a complete copy passes and reports how recent it is", async () => {
    await db.insert(users).values({ id: "drill-u1", email: "drill-u1@local.test" } as any).onConflictDoNothing();
    await db.insert(profiles).values({ userId: "drill-u1", displayName: "Drill" } as any);
    // Production and the copy the same database: everything matches.
    const d = await runDrill(testDb, testDb);
    expect(d.fails).toEqual([]);
    // Core tables that are empty on both sides don't fail (nothing to lose).
    expect(d.verdict).toBe("PASS");
    expect(d.tables.find((t) => t.table === "users")?.restored).toBeGreaterThan(0);
    expect(d.freshness.some((f) => f.startsWith("users: newest"))).toBe(true);
    expect(formatDrill(d, { restored: "copy", prod: "prod" }, 1)).toMatch(/\| PASS \|/);
  });

  it("a copy missing the core tables fails, naming them", async () => {
    const half = new PGlite();
    await half.exec(`CREATE TABLE users (id varchar PRIMARY KEY, created_at timestamp DEFAULT now());`);
    await half.exec(`INSERT INTO users (id) VALUES ('a');`);
    const d = await runDrill(q(half), testDb);
    expect(d.verdict).toBe("FAIL");
    for (const t of CORE.filter((t) => t !== "users")) expect(d.fails.join("\n")).toContain(`${t}: missing from the restored copy`);
    await half.close();
  });

  it("a copy far behind production is flagged", async () => {
    const old = new PGlite();
    await old.exec(`CREATE TABLE users (id varchar PRIMARY KEY, created_at timestamp DEFAULT now());`);
    const prod = new PGlite();
    await prod.exec(`CREATE TABLE users (id varchar PRIMARY KEY, created_at timestamp DEFAULT now());`);
    await prod.exec(`INSERT INTO users (id) SELECT 'u' || g FROM generate_series(1, 100) g;`);
    await old.exec(`INSERT INTO users (id) SELECT 'u' || g FROM generate_series(1, 40) g;`);
    const d = await runDrill(q(old), q(prod));
    expect(d.warns).toContain("users: 40 rows restored, 100 in production");
    await old.close();
    await prod.close();
  });
});
