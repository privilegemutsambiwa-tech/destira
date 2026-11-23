// The Sunday Table (Part O2): weekly sign-ups, the tables, and private
// "see again" picks. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-tables.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-tables.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS table_signups (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      weekend text NOT NULL,
      mix text NOT NULL DEFAULT 'mixed',
      status text NOT NULL DEFAULT 'waiting',
      table_id integer,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS table_signups_user_weekend_idx ON table_signups (user_id, weekend);
    CREATE INDEX IF NOT EXISTS table_signups_weekend_idx ON table_signups (weekend, status);
  `);
  console.log("table_signups: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS sunday_tables (
      id serial PRIMARY KEY,
      weekend text NOT NULL,
      starts_at timestamp NOT NULL,
      mix text NOT NULL,
      vibe text NOT NULL,
      age_min integer,
      age_max integer,
      area text,
      place_name text NOT NULL,
      place_detail text,
      chat_group_id integer,
      place_sent_at timestamp,
      picks_sent_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS sunday_tables_weekend_idx ON sunday_tables (weekend);
  `);
  console.log("sunday_tables: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS table_picks (
      id serial PRIMARY KEY,
      table_id integer NOT NULL,
      from_id varchar NOT NULL REFERENCES users(id),
      to_id varchar NOT NULL REFERENCES users(id),
      kind text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS table_picks_pair_idx ON table_picks (table_id, from_id, to_id);
  `);
  console.log("table_picks: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
