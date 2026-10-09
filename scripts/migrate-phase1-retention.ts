// One-off, idempotent: tables for Phase 1 retention (member lifecycle email,
// runtime app settings, first-day checklist reward). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-phase1-retention.ts
//   npx tsx --env-file=.env     scripts/migrate-phase1-retention.ts   # production
import { client } from "../server/db";

async function run(sql: string) {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS member_email_log (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      kind text NOT NULL,
      dedupe_key text NOT NULL,
      recipient text NOT NULL,
      subject text NOT NULL,
      status text NOT NULL,
      provider_message_id text,
      error text,
      created_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS member_email_log_user_dedupe_idx ON member_email_log (user_id, dedupe_key);
    CREATE INDEX IF NOT EXISTS member_email_log_created_idx ON member_email_log (created_at);

    CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamp DEFAULT now(),
      updated_by varchar
    );

    CREATE TABLE IF NOT EXISTS first_day_rewards (
      user_id varchar PRIMARY KEY REFERENCES users(id),
      claimed_at timestamp DEFAULT now()
    );
  `);
  console.log("phase 1 retention migration done");
  process.exit(0);
}

main().catch((e) => {
  console.error("migration failed:", e);
  process.exit(1);
});
