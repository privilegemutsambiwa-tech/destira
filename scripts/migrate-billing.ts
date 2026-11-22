// Money (phase 3): the plan reminders already sent (server/billing.ts), so
// none repeats. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-billing.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-billing.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS billing_notices (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key text NOT NULL,
      created_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS billing_notices_user_key_idx ON billing_notices (user_id, key);
  `);
  console.log("billing_notices: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
