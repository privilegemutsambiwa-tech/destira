// Deck score inputs: reply rate and the popularity cap (server/matching.ts).
// Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-matching.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-matching.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS discover_shown_daily (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      day date NOT NULL,
      shown integer NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS discover_shown_daily_user_day_idx ON discover_shown_daily (user_id, day);
  `);
  console.log("discover_shown_daily: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS member_match_stats (
      user_id varchar PRIMARY KEY REFERENCES users(id),
      reply_rate real,
      reply_sample integer NOT NULL DEFAULT 0,
      shown_yesterday integer NOT NULL DEFAULT 0,
      updated_day date
    );
  `);
  console.log("member_match_stats: ready");

  // Speeds up the daily reply-rate pass.
  await run(`CREATE INDEX IF NOT EXISTS direct_messages_match_created_idx ON direct_messages (match_id, created_at);`);
  console.log("direct_messages (match_id, created_at) index: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
