// Rewind, super like and boost (server/discover-perks.ts). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-discover-perks.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-discover-perks.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_super boolean DEFAULT false;`);
  console.log("matches.is_super: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS discover_rewinds (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      target_id varchar NOT NULL REFERENCES users(id),
      created_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS discover_rewinds_user_idx ON discover_rewinds (user_id, created_at);
  `);
  console.log("discover_rewinds: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS discover_boosts (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      source text NOT NULL,
      started_at timestamp NOT NULL DEFAULT now(),
      ends_at timestamp NOT NULL
    );
    CREATE INDEX IF NOT EXISTS discover_boosts_ends_idx ON discover_boosts (ends_at);
    CREATE TABLE IF NOT EXISTS discover_boost_views (
      id serial PRIMARY KEY,
      boost_id integer NOT NULL REFERENCES discover_boosts(id),
      viewer_id varchar NOT NULL REFERENCES users(id),
      created_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS discover_boost_views_boost_viewer_idx ON discover_boost_views (boost_id, viewer_id);
  `);
  console.log("discover_boosts, discover_boost_views: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
