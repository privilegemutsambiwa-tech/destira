// One-off, idempotent: referral free-week columns, signup_sources and
// share_events (growth phase). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-growth.ts
//   npx tsx --env-file=.env     scripts/migrate-growth.ts   # production
import { client } from "../server/db";

async function run(sql: string) {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_reward_days integer NOT NULL DEFAULT 0;
    ALTER TABLE referrals ADD COLUMN IF NOT EXISTS invited_reward_days integer NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS signup_sources (
      user_id varchar PRIMARY KEY REFERENCES users(id),
      source text NOT NULL,
      detail text,
      created_at timestamp DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS share_events (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      kind text NOT NULL,
      format text NOT NULL,
      target_id text,
      created_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS share_events_created_idx ON share_events (created_at);
  `);
  console.log("growth migration done");
  process.exit(0);
}

main().catch((e) => {
  console.error("migration failed:", e);
  process.exit(1);
});
