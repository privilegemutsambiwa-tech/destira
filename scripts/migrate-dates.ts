// "Let's meet" date plans, the after-date check-in, and the one-time
// quiet-chat nudge (server/dates.ts). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-dates.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-dates.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS date_plans (
      id serial PRIMARY KEY,
      match_id integer NOT NULL REFERENCES matches(id),
      proposer_id varchar NOT NULL REFERENCES users(id),
      kind text NOT NULL,
      place_name text NOT NULL,
      place_detail text,
      event_id integer,
      times jsonb NOT NULL,
      starts_at timestamp,
      status text NOT NULL DEFAULT 'proposed',
      message_id integer,
      responded_at timestamp,
      checkin_pushed_at timestamp,
      created_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS date_plans_match_idx ON date_plans (match_id);
    CREATE INDEX IF NOT EXISTS date_plans_message_idx ON date_plans (message_id);
  `);
  console.log("date_plans: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS date_checkins (
      id serial PRIMARY KEY,
      plan_id integer NOT NULL REFERENCES date_plans(id),
      user_id varchar NOT NULL REFERENCES users(id),
      answer text NOT NULL,
      created_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS date_checkins_plan_user_idx ON date_checkins (plan_id, user_id);
  `);
  console.log("date_checkins: ready");

  await run(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS quiet_nudged_at timestamp;`);
  console.log("matches.quiet_nudged_at: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
