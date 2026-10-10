// One-off, idempotent: the daily_picks table ("Tonight's three"). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-daily-picks.ts
//   npx tsx --env-file=.env     scripts/migrate-daily-picks.ts   # production
import { client } from "../server/db";

async function run(sql: string) {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS daily_picks (
      user_id varchar NOT NULL REFERENCES users(id),
      pick_date date NOT NULL,
      picks jsonb NOT NULL,
      notified_at timestamp,
      created_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS daily_picks_user_date_idx ON daily_picks (user_id, pick_date);
  `);
  console.log("daily picks migration done");
  process.exit(0);
}

main().catch((e) => {
  console.error("migration failed:", e);
  process.exit(1);
});
